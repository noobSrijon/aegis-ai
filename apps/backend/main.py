import os
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import assemblyai as aai
from auth_utils import get_current_user
from fastapi import Depends
from pydantic import BaseModel
# Setup Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment variables.")
    supabase: Client = None
else:
    # Explicitly set the schema to 'public'
    supabase: Client = create_client(
        SUPABASE_URL, 
        SUPABASE_KEY, 
        options=ClientOptions(schema="public")
    )

# Setup AssemblyAI
ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
aai.settings.api_key = ASSEMBLYAI_API_KEY

app = FastAPI()

class ThreadCreate(BaseModel):
    initial_context: str = ""

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Loosen for debugging
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def read_root():
    return {"message": "Hello from FastAPI backend!"}


@app.get('/settings')
async def get_settings():
    return {"settings": {}}

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.websocket("/ws/{thread_id}")
async def monitor_audio(websocket: WebSocket, thread_id: str):
    print(f"WS CONNECTION ATTEMPT: thread_id={thread_id}")
    await websocket.accept()
    print(f"WS ACCEPTED: {thread_id}")
    
    from assemblyai.streaming.v3 import (
        StreamingClient,
        StreamingClientOptions,
        StreamingEvents,
        StreamingParameters,
        BeginEvent,
        TurnEvent,
        StreamingError,
        TerminationEvent,
    )
    import queue
    import threading

    audio_queue = queue.Queue()
    loop = asyncio.get_running_loop()
    session_location = {"lat": None, "lon": None}

    def on_turn(client, event: TurnEvent):
        if not event.transcript: return
        sentence = event.transcript
        is_final = event.end_of_turn
        lat, lon = session_location["lat"], session_location["lon"]

        async def process():
            if is_final and supabase:
                supabase.table("logs").insert({"thread_id": thread_id, "content": sentence, "latitude": lat, "longitude": lon}).execute()
            mock_risk = 95 if "help" in sentence.lower() else (45 if "risk" in sentence.lower() else 10)
            await websocket.send_json({"transcript": sentence, "is_final": is_final, "risk": mock_risk, "action": "Analyzing..."})

        asyncio.run_coroutine_threadsafe(process(), loop)

    client = StreamingClient(
        options=StreamingClientOptions(api_key=aai.settings.api_key)
    )
    client.on(StreamingEvents.Turn, on_turn)
    client.on(StreamingEvents.Error, lambda c, e: print(f"AAI Error: {e}"))
    
    client.connect(StreamingParameters(sample_rate=16000))

    def audio_generator():
        while True:
            chunk = audio_queue.get()
            if chunk is None: break
            yield chunk

    threading.Thread(target=lambda: client.stream(audio_generator()), daemon=True).start()

    try:
        while True:
            data = await websocket.receive()
            if "bytes" in data: audio_queue.put(data["bytes"])
            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "location":
                    session_location["lat"], session_location["lon"] = msg.get("lat"), msg.get("lon")
    except WebSocketDisconnect:
        print(f"Disconnected: {thread_id}")
    finally:
        audio_queue.put(None)

@app.get("/api/profile")
async def get_profile(user = Depends(get_current_user)):
    if not supabase:
        return {"id": user.id, "email": user.email, "is_enrolled": False}
    
    try:
        res = supabase.table("profiles").select("*").eq("id", user.id).execute()
        if res.data:
            return res.data[0]
        return {"id": user.id, "email": user.email, "is_enrolled": False}
    except Exception as e:
        print(f"Profile error: {e}")
        return {"id": user.id, "email": user.email, "is_enrolled": False}

@app.get("/api/history")
async def get_history(user = Depends(get_current_user)):
    if not supabase:
        return []
    
    try:
        # Fetch threads with their logs
        threads_res = supabase.table("threads").select("*, logs(*)").eq("user_id", user.id).order("created_at", desc=True).execute()
        return threads_res.data
    except Exception as e:
        print(f"History error: {e}")
        return []

@app.get("/api/guarding")
async def get_guarding(user = Depends(get_current_user)):
    """
    Returns the guarding relationships where this user is the guardian.
    Includes the profile of the person who added them.
    """
    if not supabase:
        return []
    
    try:
        # Fetch relationships where this user is the guardian
        res = supabase.table("guardians").select("*, profiles:user_id(*)").eq("guardian_id", user.id).execute()
        return res.data
    except Exception as e:
        print(f"Guarding error: {e}")
        return []

@app.post("/api/guardians/accept/{relationship_id}")
async def accept_guardian(relationship_id: str, user = Depends(get_current_user)):
    if not supabase:
        return {"message": "Supabase not configured"}
    try:
        # Update status to active only if this user is the guardian for this relationship
        supabase.table("guardians").update({"status": "active"}).eq("id", relationship_id).eq("guardian_id", user.id).execute()
        return {"message": "Guardian request accepted"}
    except Exception as e:
        print(f"Accept error: {e}")
        return {"error": str(e)}, 400

@app.get("/api/my-guardians")
async def get_my_guardians(user = Depends(get_current_user)):
    if not supabase:
        return []
    try:
        # Fetch guardians added by the current user
        res = supabase.table("guardians").select("*").eq("user_id", user.id).execute()
        return res.data
    except Exception as e:
        print(f"My Guardians error: {e}")
        return []

@app.get("/api/notifications")
async def get_notifications(user = Depends(get_current_user)):
    if not supabase:
        return []
    try:
        res = supabase.table("notifications").select("*").eq("user_id", user.id).order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        print(f"Notifications error: {e}")
        return []

@app.post("/api/notifications/read/{notification_id}")
async def mark_notification_read(notification_id: str, user = Depends(get_current_user)):
    if not supabase:
        return {"message": "Supabase not configured"}
    try:
        supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).eq("user_id", user.id).execute()
        return {"message": "Notification marked as read"}
    except Exception as e:
        print(f"Mark read error: {e}")
        return {"error": str(e)}, 400

@app.post("/api/enroll-voice")
async def enroll_voice(file: UploadFile = File(...), user = Depends(get_current_user)):
    """
    Accepts a .wav file, generates a voice fingerprint embedding, 
    and updates the user's profile.
    """
    if not supabase:
        return {"message": "Supabase not configured"}
        
    try:
        # Save uploaded file temporarily for processing
        temp_path = f"temp_{user.id}.wav"
        with open(temp_path, "wb") as f:
            f.write(await file.read())
            
        # For now, we simulate the embedding generation (384-dimensional vector)
        import numpy as np
        embedding = np.random.uniform(-1, 1, 384).tolist()
        
        # Update user profile in Supabase
        # First ensure the profile exists
        supabase.table("profiles").upsert({
            "id": user.id,
            "email": user.email,
            "voice_fingerprint": embedding,
            "is_enrolled": True
        }).execute()
        
        return {"message": "Voice enrolled successfully"}
    except Exception as e:
        print(f"Enrollment error: {e}")
        return {"error": str(e)}, 400
    finally:
        if os.path.exists("temp_enrollment.wav"):
            os.remove("temp_enrollment.wav")

@app.post("/api/guardians/add")
async def add_guardian(
    guardian_email: str = Body(..., embed=True), 
    guardian_phone: str = Body(None, embed=True),
    user = Depends(get_current_user)
):
    """
    Adds a guardian to the user's circle.
    If the email exists in profiles, links them.
    Otherwise, marks as a guest guardian.
    """
    if not supabase:
        return {"message": "Supabase not configured"}
        
    try:
        # Check if guardian exists as a user
        res = supabase.table("profiles").select("id").eq("email", guardian_email).execute()
        guardian_id = res.data[0]["id"] if res.data else None
        
        # Insert into guardians table
        supabase.table("guardians").insert({
            "user_id": user.id,
            "guardian_id": guardian_id,
            "guardian_email": guardian_email,
            "guardian_phone": guardian_phone,
            "status": "pending"
        }).execute()

        # If guardian is a registered user, send them a notification
        if guardian_id:
            try:
                # Fetch adder's name or email for the notification message
                res_adder = supabase.table("profiles").select("full_name, email").eq("id", user.id).execute()
                adder_name = res_adder.data[0].get("full_name") or res_adder.data[0].get("email") if res_adder.data else user.email
                
                supabase.table("notifications").insert({
                    "user_id": guardian_id,
                    "type": "guardian_added",
                    "title": "New Guarding Request",
                    "message": f"{adder_name} has added you as their guardian. You can now monitor their safety sessions.",
                    "link": "/guardians",
                    "is_read": False
                }).execute()
            except Exception as notif_err:
                print(f"Failed to send guardian notification: {notif_err}")
        
        return {
            "message": "Guardian added",
            "is_guest": guardian_id is None,
            "status": "pending"
        }
    except Exception as e:
        print(f"Add guardian error: {e}")
        return {"error": str(e)}, 400

@app.post("/api/threads")
async def create_thread(data: ThreadCreate, user = Depends(get_current_user)):
    print(f"CREATE_THREAD: Received data={data} for user={user.id}")
    if not supabase:
        print("CREATE_THREAD: Supabase not configured, using fallback")
        import uuid
        return {"id": str(uuid.uuid4()), "message": "Development mode (no Supabase)"}
    
    try:
        initial_context = data.initial_context
        print(f"CREATE_THREAD: Attempting insert into threads table (context: {initial_context})")
        response = supabase.table("threads").insert({
            "user_id": user.id,
            "initial_context": initial_context
        }).execute()
        
        if response.data:
            print(f"CREATE_THREAD: Success! Thread ID: {response.data[0].get('id')}")
            return response.data[0]
        
        print("CREATE_THREAD: Insert returned no data, using fallback mock ID")
        return {"id": "mock-thread-id"}
    except Exception as e:
        print(f"CREATE_THREAD ERROR: {e}")
        # Try fallback without context
        try:
            print("CREATE_THREAD: Attempting fallback insert without initial_context")
            response = supabase.table("threads").insert({
                "user_id": user.id
            }).execute()
            if response.data:
                print(f"CREATE_THREAD: Fallback success! Thread ID: {response.data[0].get('id')}")
                return response.data[0]
        except Exception as e2:
            print(f"CREATE_THREAD FALLBACK ERROR: {e2}")
            
        import uuid
        mock_id = str(uuid.uuid4())
        print(f"CREATE_THREAD: Returning mock UUID: {mock_id}")
        return {"id": mock_id, "error": str(e)}


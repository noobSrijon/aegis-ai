import os
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Body
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import assemblyai as aai
from auth_utils import get_current_user
from fastapi import Depends
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

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Allow Next.js frontend
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
    Returns the profiles of users who have added this user as a guardian.
    """
    if not supabase:
        return []
    
    try:
        # Join guardians table with profiles to get details of the protected users
        # Filter where guardian_id matches the current user
        res = supabase.table("guardians").select("profiles:user_id(*)").eq("guardian_id", user.id).execute()
        
        # Flatten the response to return a list of profiles
        protected_users = [item["profiles"] for item in res.data if item.get("profiles")]
        return protected_users
    except Exception as e:
        print(f"Guarding error: {e}")
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
async def create_thread(user = Depends(get_current_user)):
    if not supabase:
        # Fallback for development without Supabase
        import uuid
        return {"id": str(uuid.uuid4()), "message": "Development mode (no Supabase)"}
    
    try:
        response = supabase.table("threads").insert({"user_id": user.id}).execute()
        if response.data:
            return response.data[0]
        return {"id": "mock-thread-id"} # Fallback if insert fails
    except Exception as e:
        print(f"Error creating thread: {e}")
        import uuid
        return {"id": str(uuid.uuid4()), "error": str(e)}

@app.websocket("/ws/monitor")
async def monitor_audio(websocket: WebSocket, thread_id: str = "default"):
    await websocket.accept()
    
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

    # Queue to bridge WebSocket bytes to the blocking AssemblyAI stream
    audio_queue = queue.Queue()
    loop = asyncio.get_running_loop()

    # Track user location for this session
    session_location = {"lat": None, "lon": None}

    def on_begin(client, event: BeginEvent):
        print(f"AssemblyAI Session started: {event.id}")

    def on_turn(client, event: TurnEvent):
        if not event.transcript:
            return
        
        sentence = event.transcript
        is_final = event.end_of_turn
        
        # Capture current location snapshot
        lat = session_location["lat"]
        lon = session_location["lon"]

        async def process_and_send():
            # Store in Supabase ONLY IF it's the end of a turn (batching)
            if is_final and supabase:
                try:
                    supabase.table("logs").insert({
                        "content": sentence,
                        "thread_id": thread_id,
                        "latitude": lat,
                        "longitude": lon,
                        "speaker_label": "Speaker_A",
                        "is_primary_user": True
                    }).execute()
                except Exception as e:
                    print(f"Supabase error: {e}")

            # Risk Analysis
            risk_level = 85.0 if any(word in sentence.lower() for word in ["suspicious", "terminal", "danger", "alert", "security"]) else 15.0
            
            # Guardian Notifications on High Risk
            if risk_level >= 80 and supabase:
                try:
                    # 1. Find the user ID associated with this thread
                    thread_res = supabase.table("threads").select("user_id").eq("id", thread_id).execute()
                    if thread_res.data:
                        owner_id = thread_res.data[0]["user_id"]
                        
                        # 2. Get all active guardians for this user
                        guard_res = supabase.table("guardians").select("guardian_email, guardian_phone").eq("user_id", owner_id).eq("status", "active").execute()
                        
                        for g in guard_res.data:
                            # Placeholder for actual alert (Resend/Twilio)
                            print(f"ALERT: Notifying guardian {g['guardian_email']} about high risk session {thread_id}")
                            # Send Live View Link: f"https://black-box.app/guardian/view/{thread_id}"
                except Exception as e:
                    print(f"Notification error: {e}")

            # Defense mechanism
            defense_msg = ""
            if risk_level < 20: defense_msg = "NORMAL: No action required."
            elif risk_level < 60: defense_msg = "CAUTION: Notify administrator."
            elif risk_level < 90: defense_msg = "HIGH RISK: Trigger local alarm."
            else: defense_msg = "CRITICAL: System isolation initiated."

            try:
                await websocket.send_json({
                    "risk": risk_level,
                    "action": defense_msg,
                    "transcript": sentence,
                    "thread_id": thread_id,
                    "is_final": is_final,
                    "location": {"lat": lat, "lon": lon} if lat and lon else None
                })
            except Exception as e:
                print(f"WS send error: {e}")

        asyncio.run_coroutine_threadsafe(process_and_send(), loop)

    def on_error(client, error: StreamingError):
        print(f"AssemblyAI error: {error}")

    def on_terminated(client, event: TerminationEvent):
        print("AssemblyAI session terminated")

    # Initialize Client
    client = StreamingClient(
        StreamingClientOptions(
            api_key=aai.settings.api_key,
            api_host="streaming.assemblyai.com",
        )
    )

    client.on(StreamingEvents.Begin, on_begin)
    client.on(StreamingEvents.Turn, on_turn)
    client.on(StreamingEvents.Error, on_error)
    client.on(StreamingEvents.Termination, on_terminated)

    client.connect(
        StreamingParameters(
            sample_rate=16000
        )
    )

    # Generator to yield audio from the queue to the client
    def audio_generator():
        while True:
            chunk = audio_queue.get()
            if chunk is None:
                return
            yield chunk

    # Run the blocking steam method in a separate thread
    stream_thread = threading.Thread(target=client.stream, args=(audio_generator(),))
    stream_thread.start()

    try:
        while True:
            # We use receive() to handle both text (location) and bytes (audio)
            message = await websocket.receive()
            
            if "bytes" in message:
                audio_queue.put(message["bytes"])
            elif "text" in message:
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")
                    
                    if msg_type == "location":
                        session_location["lat"] = data.get("lat")
                        session_location["lon"] = data.get("lon")
                        print(f"Updated location for {thread_id}: {session_location}")
                        
                    elif msg_type == "chat":
                        text = data.get("text")
                        if text:
                            print(f"Manual context received: {text}")
                            # Directly process and persist manual chat
                            lat = session_location["lat"]
                            lon = session_location["lon"]
                            
                            # Persist
                            if supabase:
                                try:
                                    supabase.table("logs").insert({
                                        "content": text,
                                        "thread_id": thread_id,
                                        "latitude": lat,
                                        "longitude": lon,
                                        "speaker_label": "Speaker_A",
                                        "is_primary_user": True
                                    }).execute()
                                except Exception as e:
                                    print(f"Supabase error: {e}")
                            
                            # Analyze
                            risk_level = 85.0 if any(word in text.lower() for word in ["suspicious", "terminal", "danger", "alert", "security", "threat"]) else 15.0
                            
                            # Guardian Notifications on High Risk (Manual Chat)
                            if risk_level >= 80 and supabase:
                                try:
                                    thread_res = supabase.table("threads").select("user_id").eq("id", thread_id).execute()
                                    if thread_res.data:
                                        owner_id = thread_res.data[0]["user_id"]
                                        guard_res = supabase.table("guardians").select("guardian_email, guardian_phone").eq("user_id", owner_id).eq("status", "active").execute()
                                        for g in guard_res.data:
                                            print(f"ALERT: Notifying guardian {g['guardian_email']} about high risk MANUAL CHAT in session {thread_id}")
                                except Exception as e:
                                    print(f"Notification error: {e}")

                            defense_msg = ""
                            if risk_level < 20: defense_msg = "NORMAL: No action required."
                            elif risk_level < 60: defense_msg = "CAUTION: Notify administrator."
                            elif risk_level < 90: defense_msg = "HIGH RISK: Trigger local alarm."
                            else: defense_msg = "CRITICAL: System isolation initiated."
                            
                            await websocket.send_json({
                                "risk": risk_level,
                                "action": defense_msg,
                                "transcript": text,
                                "thread_id": thread_id,
                                "is_final": True,
                                "is_manual": True,
                                "location": {"lat": lat, "lon": lon} if lat and lon else None
                            })
                except Exception as e:
                    print(f"Error parsing JSON message: {e}")
                    
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        audio_queue.put(None) # Stop the generator
        client.disconnect(terminate=True)
        stream_thread.join(timeout=2)

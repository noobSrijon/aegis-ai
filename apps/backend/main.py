import os
import json
import asyncio
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import assemblyai as aai
from auth_utils import get_current_user
from risk_analysis import assess_danger
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
    allow_origins=["*"],  # Loosen for debugging
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


class TestRiskInput(BaseModel):
    transcript: str
    location: Optional[dict] = None


@app.post("/api/test-risk")
async def test_risk_assessment(data: TestRiskInput):
    """
    Test the Groq LLM risk analysis without a WebSocket session.
    Use this to see how different transcripts are scored (0-100, with level: low/medium/high/critical).
    """
    result = await assess_danger(data.transcript, location=data.location)
    return result


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
    message_buffer = []
    BATCH_SIZE = 2
    is_connected = True

    def on_turn(client, event: TurnEvent):
        if not is_connected: return
        if not event.transcript: return
        sentence = event.transcript
        is_final = event.end_of_turn
        lat, lon = session_location["lat"], session_location["lon"]

        async def process():
            nonlocal message_buffer
            if not is_connected: return
            try:
                if is_final:
                    if supabase:
                        supabase.table("logs").insert(
                            {"thread_id": thread_id, "content": sentence, "latitude": lat, "longitude": lon}).execute()
                    
                    message_buffer.append(sentence)
                    
                    if len(message_buffer) >= BATCH_SIZE:
                        # Process all messages in buffer for context
                        combined_text = "\n".join(message_buffer)
                        loc = {"lat": lat, "lon": lon} if (lat is not None and lon is not None) else None
                        
                        result = await assess_danger(combined_text, location=loc)
                        risk_score = int(result["score"])
                        
                        if not is_connected: return
                        
                        if risk_score >= 65:
                            await websocket.send_json({"risk": risk_score, "action": "Analyzing..."})
                        
                        action_text = result["reason"] or "Analyzing..."
                        # Only send back the latest chunk to avoid duplication, but include risk context
                        await websocket.send_json(
                            {"transcript": sentence, "is_final": True, "risk": risk_score, "action": action_text})
                        
                        # Clear buffer after assessment
                        message_buffer = []
                    else:
                        # Just send the transcript back without full assessment yet
                        await websocket.send_json({"transcript": sentence, "is_final": True, "risk": 0})

            except Exception as e:
                if is_connected:
                    print(f"WS SEND ERROR: {e}")

        asyncio.run_coroutine_threadsafe(process(), loop)

    client = StreamingClient(
        options=StreamingClientOptions(api_key=aai.settings.api_key)
    )
    client.on(StreamingEvents.Turn, on_turn)
    client.on(StreamingEvents.Error, lambda c, e: print(f"AAI Error: {e}") if is_connected else None)

    client.connect(StreamingParameters(sample_rate=16000))

    def audio_generator():
        while is_connected:
            try:
                chunk = audio_queue.get(timeout=0.1)
                if chunk is None: break
                yield chunk
            except queue.Empty:
                continue

    threading.Thread(target=lambda: client.stream(audio_generator()), daemon=True).start()

    try:
        while True:
            data = await websocket.receive()
            if data.get("type") == "websocket.disconnect":
                print(f"WS DISCONNECT MESSAGE RECEIVED: {thread_id}")
                break
            
            if "bytes" in data:
                audio_queue.put(data["bytes"])
            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("type") == "location":
                    session_location["lat"], session_location["lon"] = msg.get("lat"), msg.get("lon")
                elif msg.get("type") == "chat":
                    text = msg.get("text", "").strip()
                    if text:
                        try:
                            message_buffer.append(text)
                            if supabase:
                                supabase.table("logs").insert({"thread_id": thread_id, "content": text, "latitude": session_location["lat"], "longitude": session_location["lon"]}).execute()
                            
                            if len(message_buffer) >= BATCH_SIZE:
                                combined_text = "\n".join(message_buffer)
                                loc = {"lat": session_location["lat"], "lon": session_location["lon"]} if (session_location["lat"] is not None and session_location["lon"] is not None) else None
                                result = await assess_danger(combined_text, location=loc)
                                risk_score = int(result["score"])
                                action_text = result["reason"] or "Analyzed."
                                if is_connected:
                                    # Send ONLY the current message text to UI, but with the risk result
                                    await websocket.send_json({"transcript": text, "is_final": True, "risk": risk_score, "action": action_text})
                                message_buffer = []
                            else:
                                if is_connected:
                                    await websocket.send_json({"transcript": text, "is_final": True, "risk": 0})
                        except Exception as e:
                            if is_connected:
                                print(f"Chat assess error: {e}")
                                await websocket.send_json({"transcript": text, "is_final": True, "risk": 0, "action": f"Assessment failed: {e}"})
    except WebSocketDisconnect:
        print(f"Disconnected: {thread_id}")
    finally:
        is_connected = False
        audio_queue.put(None)
        try:
            client.close()
        except:
            pass


@app.get("/api/profile")
async def get_profile(user=Depends(get_current_user)):
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


@app.get("/api/profile/role")
async def get_profile_role(user=Depends(get_current_user)):
    if not supabase:
        return {"account_role": "both"}
    try:
        res = supabase.table("profiles").select("account_role").eq("id", user.id).execute()
        if res.data:
            role = res.data[0].get("account_role", "both")
            return {"account_role": role}
        return {"account_role": "both"}
    except Exception as e:
        print(f"Role fetch error: {e}")
        return {"account_role": "both"}


class RoleUpdate(BaseModel):
    account_role: str
    is_enrolled: bool = None


@app.post("/api/profile/role")
async def update_profile_role(data: RoleUpdate, user=Depends(get_current_user)):
    if not supabase:
        return {"message": "Supabase not configured"}

    role = data.account_role

    if role not in ["guardian", "both"]:
        return {"error": "Invalid role. Must be 'guardian' or 'both'"}, 400

    try:
        update_data = {"account_role": role}
        if data.is_enrolled is not None:
            update_data["is_enrolled"] = data.is_enrolled
            
        supabase.table("profiles").update(update_data).eq("id", user.id).execute()
        return {"message": f"Account role updated to {role}"}
    except Exception as e:
        print(f"Role update error: {e}")
        return {"error": str(e)}, 400


async def check_is_guardian(guardian_id: str, ward_id: str) -> bool:
    """Helper to check if a user is an active guardian for another user."""
    if not supabase: return False
    try:
        res = supabase.table("guardians").select("status").eq("guardian_id", guardian_id).eq("user_id", ward_id).eq("status", "active").execute()
        return len(res.data) > 0
    except Exception as e:
        print(f"Guardian check error: {e}")
        return False


@app.get("/api/guarding/threads/{user_id}")
async def get_ward_threads(user_id: str, user=Depends(get_current_user)):
    """Fetch threads for a ward, only if the current user is their active guardian."""
    if not supabase: return []
    
    is_guardian = await check_is_guardian(user.id, user_id)
    if not is_guardian:
        raise HTTPException(status_code=403, detail="Not authorized to view this user's threads")
    
    try:
        res = supabase.table("threads").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return res.data
    except Exception as e:
        print(f"Ward threads error: {e}")
        return []


@app.get("/api/threads/{thread_id}")
async def get_thread_details(thread_id: str, user=Depends(get_current_user)):
    """Fetch a single thread with its logs. User must be owner or an active guardian."""
    if not supabase: return None
    
    try:
        # Get thread to check ownership
        thread_res = supabase.table("threads").select("*").eq("id", thread_id).execute()
        if not thread_res.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        
        thread = thread_res.data[0]
        owner_id = thread["user_id"]
        
        if owner_id != user.id:
            is_guardian = await check_is_guardian(user.id, owner_id)
            if not is_guardian:
                raise HTTPException(status_code=403, detail="Not authorized to view this thread")
        
        # Fetch logs
        logs_res = supabase.table("logs").select("*").eq("thread_id", thread_id).order("created_at", desc=False).execute()
        thread["logs"] = logs_res.data
        return thread
    except HTTPException:
        raise
    except Exception as e:
        print(f"Thread details error: {e}")
        return None


@app.get("/api/history")
async def get_history(user=Depends(get_current_user)):
    if not supabase:
        return []

    try:
        # Fetch threads with their logs
        threads_res = supabase.table("threads").select("*, logs(*)").eq("user_id", user.id).order("created_at",
                                                                                                  desc=True).execute()
        return threads_res.data
    except Exception as e:
        print(f"History error: {e}")
        return []


@app.get("/api/guarding")
async def get_guarding(user=Depends(get_current_user)):
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
async def accept_guardian(relationship_id: str, user=Depends(get_current_user)):
    if not supabase:
        return {"message": "Supabase not configured"}
    try:
        # Update status to active only if this user is the guardian for this relationship
        supabase.table("guardians").update({"status": "active"}).eq("id", relationship_id).eq("guardian_id",
                                                                                              user.id).execute()
        return {"message": "Guardian request accepted"}
    except Exception as e:
        print(f"Accept error: {e}")
        return {"error": str(e)}, 400


@app.get("/api/my-guardians")
async def get_my_guardians(user=Depends(get_current_user)):
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
async def get_notifications(user=Depends(get_current_user)):
    if not supabase:
        return []
    try:
        res = supabase.table("notifications").select("*").eq("user_id", user.id).order("created_at",
                                                                                       desc=True).execute()
        return res.data
    except Exception as e:
        print(f"Notifications error: {e}")
        return []


@app.post("/api/notifications/read/{notification_id}")
async def mark_notification_read(notification_id: str, user=Depends(get_current_user)):
    if not supabase:
        return {"message": "Supabase not configured"}
    try:
        supabase.table("notifications").update({"is_read": True}).eq("id", notification_id).eq("user_id",
                                                                                               user.id).execute()
        return {"message": "Notification marked as read"}
    except Exception as e:
        print(f"Mark read error: {e}")
        return {"error": str(e)}, 400


@app.post("/api/enroll-voice")
async def enroll_voice(file: UploadFile = File(...), user=Depends(get_current_user)):
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
        user=Depends(get_current_user)
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
                adder_name = res_adder.data[0].get("full_name") or res_adder.data[0].get(
                    "email") if res_adder.data else user.email

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


@app.delete("/api/guardians/{relationship_id}")
async def delete_guardian(relationship_id: str, user=Depends(get_current_user)):
    if not supabase:
        return {"message": "Supabase not configured"}
    try:
        # Allow deletion if user is either the one who added (user_id) or the guardian (guardian_id)
        res = supabase.table("guardians").delete().eq("id", relationship_id).or_(f"user_id.eq.{user.id},guardian_id.eq.{user.id}").execute()
        return {"message": "Guardian relationship removed"}
    except Exception as e:
        print(f"Delete guardian error: {e}")
        return {"error": str(e)}, 400


@app.post("/api/threads")
async def create_thread(data: ThreadCreate, user=Depends(get_current_user)):
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


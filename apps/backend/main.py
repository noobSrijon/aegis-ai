import os
import json
import asyncio
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
import assemblyai as aai
from auth_utils import get_current_user
from fastapi import Depends
load_dotenv()
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
    

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/threads")
async def create_thread(user = Depends(get_current_user)):
    if not supabase:
        # Fallback for development without Supabase
        import uuid
        return {"id": str(uuid.uuid4()), "message": "Development mode (no Supabase)"}
    
    try:
        response = supabase.table("threads").insert({}).execute()
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

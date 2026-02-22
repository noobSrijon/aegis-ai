# Aegis AI

**Aegis AI** is a real-time risk triage and safety monitoring system designed to protect individuals in potentially hazardous situations. By combining live audio transcription with advanced LLM-driven risk analysis, Aegis AI acts as a "Shadow" protector, alerting trusted guardians when danger is detected.

## What Aegis AI Does
Aegis AI provides a safety net through continuous monitoring and proactive alerting:

*   **Live Audio Monitoring**: Streams real-time audio from the user's device.
*   **Intelligent Transcription**: Uses AssemblyAI for low-latency, accurate speech-to-text.
*   **AI-Driven Risk Triage**: Analyzes conversation transcripts using Google Gemini to detect markers of harassment, coercion, isolation, or imminent harm.
*   **Proactive Alerting**: Automatically notifies a "Circle of Guardians" via the platform when a high or critical risk score is detected.
*   **Shared Live Status**: Guardians can view the live status and location of their wards during active sessions.

## Tech Stack

### Frontend
*   **Framework**: Next.js
*   **Language**: TypeScript
*   **Real-time**: WebSockets for live status and audio streaming.

### Backend
*   **Framework**: FastAPI (Python)
*   **Database & Auth**: Supabase

### AI & Infrastructure
*   **LLM (Risk Analysis)**: Google Gemini (`gemini-2.0-flash`)
*   **Transcription**: AssemblyAI V3 (Streaming)

## Developer Setup

### Prerequisites
*   Node.js 18+
*   Python 3.10+
*   Supabase Account
*   AssemblyAI API Key
*   Google Gemini API Key

### Frontend Setup (apps/web)
1.  **Install dependencies**:
    ```bash
    cd apps/web
    npm install
    ```
2.  **Environment Variables**: Create a `.env` file in `apps/web`:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
    NEXT_PUBLIC_API_URL=http://localhost:8000
    ```
3.  **Run Development Server**:
    ```bash
    npm run dev
    ```

### Backend Setup (apps/backend)
1.  **Setup Virtual Environment**:
    ```bash
    cd apps/backend
    python -m venv venv
    source venv/bin/activate  # Mac/Linux
    pip install -r requirements.txt
    ```
2.  **Environment Variables**: Create a `.env` file in `apps/backend`:
    ```env
    SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
    ASSEMBLYAI_API_KEY=your_assemblyai_api_key
    GEMINI_KEY=your_gemini_api_key
    ```
3.  **Run Backend Server**:
    ```bash
    uvicorn main:app --reload
    ```

## Contact
For questions, demos, or collaboration, reach out to the project team:

*   **Adil Sabir Azeez** - adilsabirazeez@gmail.com
*   **Srijon Kumar** - srijonkumar18@gmail.com
*   **Caleb Walters** - cwalterssoccer2004@gmail.com
*   **Sri Ram Swaminathan** - srirams1627@gmail.com


# risk_analysis.py
import os
import json
import asyncio
from typing import Optional, Dict, Any

from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

SYSTEM_PROMPT = """You are a risk triage assistant for user interactions.
Return ONLY JSON (no markdown, no extra text) with exactly these keys:
- level: one of ["low","medium","high","critical"]
- score: number 0 to 100
- reason: short string

Scoring guide:
0–39 low, 40–69 medium, 70–84 high, 85–100 critical
Be conservative: if unsure, choose the LOWER score.
"""

def _sanitize_result(obj: dict) -> dict:
    level = obj.get("level", "low")
    score = float(obj.get("score", 0.0))
    reason = obj.get("reason", "")
    if level not in {"low", "medium", "high", "critical"}:
        level = "low"
    if score < 0: score = 0.0
    if score > 100: score = 100.0
    if not isinstance(reason, str):
        reason = str(reason)
    return {"level": level, "score": score, "reason": reason}

async def assess_danger(transcript: str, location: Optional[dict] = None) -> dict:
    """
    Returns: {"level": str, "score": float, "reason": str}
    """
    payload = {"transcript": transcript, "location": location}

    def _call_groq_sync() -> dict:
        # NOTE: Groq client is sync; run in a thread to avoid blocking.
        resp = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile"),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload)},
            ],
            temperature=0,
        )

        content = resp.choices[0].message.content.strip()

        # Some models may wrap JSON in text; try to extract the JSON object.
        # Fast heuristic: find first "{" and last "}"
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start : end + 1]

        return json.loads(content)

    try:
        # Optional timeout so you never hang:
        result = await asyncio.wait_for(asyncio.to_thread(_call_groq_sync), timeout=8)
        return _sanitize_result(result)

    except Exception as e:
        return {
            "level": "low",
            "score": 0.0,
            "reason": f"Assessment unavailable (Groq error: {type(e).__name__}).",
        }
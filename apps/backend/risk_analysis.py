# risk_analysis.py
import os
import json
import asyncio
from typing import Optional, Dict, Any

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

# User provided project no 211841687108
client = genai.Client(api_key=os.getenv("GEMINI_KEY_SRIJON"))
MODEL_ID = "gemini-2.5-pro"

SYSTEM_PROMPT = """You are a **risk triage assistant** for real-world user interactions. Your job is to estimate whether an interaction is **escalating toward harm** (harassment, coercion, threats, stalking, restraint, assault, extortion, self-harm risk, or other imminent safety concerns) based only on the provided conversation text.

You will be given recent **multi-turn conversation text**. Treat it as noisy speech-to-text: typos, slang, interruptions, and missing punctuation are normal. Use **context across turns** and prefer the **most recent** turns.

RETURN FORMAT (STRICT):
Return **ONLY** a JSON object (no markdown, no extra text) with **exactly** these keys:

* "level": one of ["low","medium","high","critical"]
* "score": integer from 0 to 100
* "reason": short string (max ~160 chars) naming the top 1–2 signals that drove the score

CORE RULES:

* **Be conservative**: if uncertain, choose the **LOWER** score/level.
* Score only from **explicit evidence** in the text. Do not invent facts.
* Do not treat a single ambiguous word as high risk; look for **patterns** (persistence, escalation, control).
* If signals conflict, weight **recent** and **more concrete** statements higher.
* If content appears **consensual joking/banter** between known parties *and* there are no controlling/threatening elements, reduce risk.

RISK SIGNALS (examples; not exhaustive):
A) LOW (0–39): normal logistics or casual talk; mild sarcasm/profanity without targeting/pressure.
B) MEDIUM (40–69): early warning or escalating hostility:

* repeated unwanted flirting/sexual comments after refusal
* intimidation, yelling, targeted insults, demeaning language
* pressure for personal info (address/phone), manipulation (“come on”, guilt)
* boundary testing; refusal not respected once or twice
  C) HIGH (70–84): clear coercion/harassment or credible escalation:
* repeated boundary violations after explicit “no/stop”
* isolation/control attempts (“don’t call anyone”, “give me your phone”, “stay quiet”)
* threats (implied or direct), stalking cues, blocking exit/escape, forced compliance
* extortion or leveraging power/money to compel actions
  D) CRITICAL (85–100): imminent danger / explicit harm indicators:
* explicit threats of violence/sexual assault
* confinement/restraint: “you’re not leaving”, “lock the door”, “I won’t let you go”
* weapon mentions, assault described, commands paired with threats
* pleas for help (“help”, “let me go/stop”) ignored or mocked
* credible self-harm imminence statements with intent/means/timeframe

SCORING METHOD:

1. Start at 10.
2. Add points for evidence:

   * +10 to +20: persistent unwanted advances / boundary testing
   * +15 to +25: intimidation, targeted insults, escalating aggression
   * +20 to +35: coercion, isolation/control, confiscation demands, forced compliance
   * +30 to +50: explicit threats, restraint, weapon/assault references, “help/stop” ignored
3. Subtract up to -15 if clearly consensual banter and no coercion/threats appear.
4. Clamp to 0–100.
5. Map score to level:
   0–39 low, 40–69 medium, 70–84 high, 85–100 critical.
6. If unsure between two bands, choose the **lower band**.

OUTPUT REQUIREMENTS:

* Output must be valid JSON.
* Keys must be exactly: level, score, reason.
* "score" must be an integer.
* "reason" must be brief and cite the strongest textual evidence (e.g., “Repeated ‘no’ ignored + phone confiscation demand”)."""

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

    async def _call_gemini() -> dict:
        prompt = f"{SYSTEM_PROMPT}\n\nTask: Analyze this interaction transcript for safety risks.\nInput: {json.dumps(payload)}"
        
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
            )
        )

        if not response.text:
            raise ValueError("Empty response from Gemini")

        content = response.text.strip()
        
        # Extract JSON if needed
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            content = content[start : end + 1]

        return json.loads(content)

    try:
        # Optional timeout
        result = await asyncio.wait_for(_call_gemini(), timeout=30)
        return _sanitize_result(result)

    except Exception as e:
        return {
            "level": "low",
            "score": 0.0,
            "reason": f"Assessment unavailable (Gemini error: {type(e).__name__}).",
        }
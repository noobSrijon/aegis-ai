import os
from elevenlabs import ElevenLabs

# 1. Initialize the client
# Replace 'YOUR_API_KEY' with your actual ElevenLabs API key
client = ElevenLabs(api_key="c624ee17024f401a2852ba2a5bbe6781521f2cab9f6aff14b730756a27ee4ad7")


def transcribe_with_diarization(file_path):
    print(f"Uploading and transcribing: {file_path}...")

    with open(file_path, "rb") as audio_file:
        # 2. Call the Speech-to-Text API
        # diarize=True triggers speaker identification
        transcription = client.speech_to_text.convert(
            file=audio_file,
            model_id="scribe_v2",  # Scribe v2 is the latest, most accurate model
            tag_audio_events=True,  # Optional: captures (laughter), (applause), etc.
            diarize=True
        )

    # 3. Process the diarized response
    # The API returns a 'words' list where each entry has a 'speaker_id'
    current_speaker = None
    transcript_output = []
    current_segment = []

    for word_data in transcription.words:
        speaker = word_data.speaker_id
        text = word_data.text

        # If the speaker changes, finalize the previous block and start a new one
        if speaker != current_speaker:
            if current_segment:
                transcript_output.append(f"{current_speaker}: {''.join(current_segment).strip()}")
            current_speaker = speaker
            current_segment = [text]
        else:
            current_segment.append(text)

    # Add the final segment
    if current_segment:
        transcript_output.append(f"{current_speaker}: {''.join(current_segment).strip()}")

    return "\n\n".join(transcript_output)


if __name__ == "__main__":
    # Path to your audio file (mp3, wav, mp4, etc.)
    audio_path = "rec.mp3"

    if os.path.exists(audio_path):
        result = transcribe_with_diarization(audio_path)
        print("\n--- Diarized Transcript ---\n")
        print(result)
    else:
        print("Error: Audio file not found. Please update the audio_path variable.")
# MVG — Video Analysis Studio

A starter web app for analyzing downloaded videos, generating transcripts, and exporting subtitles. The UI is designed for an AI-assisted video reporting workflow.

## Current features
- Video upload and in-browser preview
- FastAPI backend upload endpoint
- Speech transcription with Faster-Whisper (runs on your own machine/server)
- SRT subtitle download
- Bangla/English language selection in the interface

## Requirements
- Python 3.10+
- Node.js 18+
- FFmpeg installed and available on PATH (for broad video/audio format support)

## Run the backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The first transcription downloads the selected Whisper model, which can be large. CPU mode is the default for broad compatibility.

## Run the frontend
In a second terminal, from the repository root:
```bash
npm install
npm run dev
```
Open the local URL printed by Vite. The frontend expects the API at `http://127.0.0.1:8000`.

## Important
- This is an initial working foundation, not a finished fact-checking system.
- Transcription is performed locally by the backend; the uploaded video is not automatically sent to a third-party AI service.
- Visual scene understanding, source-backed fact-checking, and burned-in MP4 export are not implemented yet.
- Do not upload private or sensitive footage to a public deployment without adding authentication, file-size limits, retention controls, and a privacy policy.

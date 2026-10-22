import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="MVG Video Analysis API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

MAX_BYTES = 1024 * 1024 * 1024
ALLOWED_MODELS = {"tiny", "base", "small", "medium"}
_model_cache = {}


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "MVG Video Analysis API"}


def get_model(name: str):
    if name not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported Whisper model.")
    if name not in _model_cache:
        # CPU/int8 is the most broadly compatible default.
        _model_cache[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _model_cache[name]


def to_srt_time(seconds: float) -> str:
    ms = max(0, round(seconds * 1000))
    hours, ms = divmod(ms, 3_600_000)
    minutes, ms = divmod(ms, 60_000)
    secs, ms = divmod(ms, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


@app.post("/api/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form(default=None),
    model: str = Form(default="small"),
):
    filename = Path(file.filename or "upload.bin").name
    suffix = Path(filename).suffix or ".media"
    temp_path = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds the 1 GB limit.")
                tmp.write(chunk)

        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        whisper = get_model(model)
        segments_iter, info = whisper.transcribe(
            temp_path,
            language=language or None,
            vad_filter=True,
            beam_size=5,
        )
        segments = []
        srt_blocks = []
        for index, segment in enumerate(segments_iter, start=1):
            text = segment.text.strip()
            segments.append({
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text,
            })
            srt_blocks.append(
                f"{index}\n{to_srt_time(segment.start)} --> {to_srt_time(segment.end)}\n{text}"
            )

        return {
            "filename": filename,
            "language": info.language,
            "duration": round(info.duration, 3),
            "segments": segments,
            "srt": "\n\n".join(srt_blocks) + ("\n" if srt_blocks else ""),
        }
    except HTTPException:
        raise
    except Exception as exc:
        # Avoid returning file paths or internal stack details to clients.
        raise HTTPException(
            status_code=422,
            detail=f"Could not transcribe this media file. Check that FFmpeg is installed and the file is valid. ({type(exc).__name__})",
        ) from exc
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

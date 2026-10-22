import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="MVG Video Analysis API", version="0.3.0")
CORS_ORIGINS = [origin.strip() for origin in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

MAX_BYTES = 1024 * 1024 * 1024
ALLOWED_MODELS = {"tiny", "base", "small", "medium"}
ALLOWED_LANGUAGES = {"bn", "en", "hi", "ur", "ar", "ru", "uk"}
_model_cache = {}


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "MVG Video Analysis API", "version": "0.3.0"}


def get_model(name: str):
    if name not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported Whisper model.")
    if name not in _model_cache:
        _model_cache[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _model_cache[name]


def to_srt_time(seconds: float) -> str:
    ms = max(0, round(seconds * 1000))
    hours, ms = divmod(ms, 3_600_000)
    minutes, ms = divmod(ms, 60_000)
    secs, ms = divmod(ms, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def transcribe_path(path: str, filename: str, language: Optional[str], model: str):
    whisper = get_model(model)
    iterator, info = whisper.transcribe(path, language=language or None, vad_filter=True, beam_size=5)
    segments, blocks = [], []
    for index, segment in enumerate(iterator, start=1):
        value = segment.text.strip()
        segments.append({"start": round(segment.start, 3), "end": round(segment.end, 3), "text": value})
        blocks.append(f"{index}\n{to_srt_time(segment.start)} --> {to_srt_time(segment.end)}\n{value}")
    return {
        "filename": filename,
        "language": info.language,
        "duration": round(info.duration, 3),
        "segments": segments,
        "srt": "\n\n".join(blocks) + ("\n" if blocks else ""),
    }


def check_language(language: Optional[str]):
    if language and language not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language code.")


async def save_upload(upload: UploadFile, destination: str):
    size = 0
    with open(destination, "wb") as target:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                raise HTTPException(status_code=413, detail="File exceeds the 1 GB limit.")
            target.write(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = Form(default=None), model: str = Form(default="small")):
    filename = Path(file.filename or "upload.bin").name
    temp_path = None
    try:
        check_language(language)
        suffix = Path(filename).suffix or ".media"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
        await save_upload(file, temp_path)
        return transcribe_path(temp_path, filename, language, model)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not transcribe media. Check FFmpeg and file format. ({type(exc).__name__})") from exc
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/transcribe-x-url")
def transcribe_x_url(url: str = Form(...), language: Optional[str] = Form(default=None), model: str = Form(default="small")):
    """Download a public X/Twitter post video with yt-dlp, then transcribe it."""
    check_language(language)
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in {"x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"}:
        raise HTTPException(status_code=400, detail="Enter a full HTTPS link from x.com or twitter.com.")
    if not re.search(r"/[^/]+/status/\d+", parsed.path):
        raise HTTPException(status_code=400, detail="Use a direct X post URL, for example https://x.com/user/status/123456789.")
    if not shutil.which("yt-dlp"):
        raise HTTPException(status_code=503, detail="yt-dlp is not installed. Install backend requirements and restart the API.")
    workdir = tempfile.mkdtemp(prefix="mvg_x_")
    try:
        template = os.path.join(workdir, "source.%(ext)s")
        command = [
            "yt-dlp", "--no-playlist", "--no-warnings", "--max-filesize", "1G",
            "--merge-output-format", "mp4", "--format", "best[height<=1080]/best",
            "--output", template, "--print", "after_move:filepath", url.strip(),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=900)
        if completed.returncode != 0:
            raise HTTPException(status_code=422, detail="Could not fetch this X post. It may be private, unavailable, age-restricted, or require login.")
        candidates = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
        media_path = next((p for p in reversed(candidates) if os.path.isfile(p)), None)
        if not media_path:
            media_path = next((str(p) for p in Path(workdir).glob("source.*") if p.is_file()), None)
        if not media_path or os.path.getsize(media_path) > MAX_BYTES:
            raise HTTPException(status_code=422, detail="No downloadable video was found, or the file exceeds 1 GB.")
        return transcribe_path(media_path, Path(media_path).name, language, model)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=408, detail="X video download/transcription timed out.") from exc
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.post("/api/burn-subtitles")
async def burn_subtitles(file: UploadFile = File(...), srt: str = Form(...)):
    import subprocess
    from fastapi.responses import FileResponse
    from starlette.background import BackgroundTask

    if not shutil.which("ffmpeg"):
        raise HTTPException(status_code=503, detail="FFmpeg is not installed or not available on PATH.")
    filename = Path(file.filename or "video.mp4").name
    if Path(filename).suffix.lower() not in {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}:
        raise HTTPException(status_code=415, detail="Choose a supported video file.")
    if not srt.strip():
        raise HTTPException(status_code=400, detail="Subtitle text is empty.")
    workdir = tempfile.mkdtemp(prefix="mvg_export_")
    video_path = os.path.join(workdir, "source" + (Path(filename).suffix or ".mp4"))
    srt_path = os.path.join(workdir, "captions.srt")
    output_path = os.path.join(workdir, "subtitled.mp4")
    try:
        await save_upload(file, video_path)
        with open(srt_path, "w", encoding="utf-8-sig", newline="") as target:
            target.write(srt)
        escaped = srt_path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", video_path,
                   "-vf", f"subtitles='{escaped}':charenc=UTF-8", "-c:v", "libx264", "-preset", "veryfast",
                   "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output_path]
        completed = subprocess.run(command, capture_output=True, text=True, timeout=1800)
        if completed.returncode != 0 or not os.path.exists(output_path):
            raise HTTPException(status_code=422, detail="FFmpeg could not burn subtitles. Check subtitle-filter support and fonts.")
        return FileResponse(output_path, media_type="video/mp4", filename=f"{Path(filename).stem}-subtitled.mp4",
                            background=BackgroundTask(shutil.rmtree, workdir, ignore_errors=True))
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(workdir, ignore_errors=True)
        raise HTTPException(status_code=408, detail="Subtitle export timed out.") from exc
    except Exception:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    finally:
        await file.close()

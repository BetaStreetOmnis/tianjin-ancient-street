import base64
import json
import os
import time
import uuid
from pathlib import Path
from typing import List, Optional

import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
GENERATED_DIR = STATIC_DIR / "generated"

app = FastAPI(title="Tianjin Ancient Culture Street 3D")

LANDMARKS = [
    {
        "id": "archway",
        "name": "古文化街牌坊",
        "type": "gate",
        "position": {"x": 0.0, "z": -46.0},
        "height": 6.0,
        "color": "#d28c3c",
        "description": "津门故里的迎宾标识与入口意象。",
    },
    {
        "id": "folk-crafts",
        "name": "民俗工艺馆",
        "type": "craft",
        "position": {"x": -18.0, "z": -18.0},
        "height": 5.0,
        "color": "#b55a3a",
        "description": "泥人张、风筝、剪纸等传统手作展示。",
    },
    {
        "id": "tianhou",
        "name": "天后宫",
        "type": "temple",
        "position": {"x": -18.0, "z": 8.0},
        "height": 7.0,
        "color": "#c97c3b",
        "description": "供奉妈祖的古庙建筑与香火文化。",
    },
    {
        "id": "snack",
        "name": "津味小吃街",
        "type": "market",
        "position": {"x": 18.0, "z": -2.0},
        "height": 4.5,
        "color": "#d28c3c",
        "description": "耳朵眼炸糕、煎饼果子等津味汇聚。",
    },
    {
        "id": "opera",
        "name": "曲艺戏台",
        "type": "stage",
        "position": {"x": 16.0, "z": 22.0},
        "height": 5.5,
        "color": "#a05238",
        "description": "相声、评剧等传统曲艺演出区域。",
    },
    {
        "id": "gulou",
        "name": "鼓楼",
        "type": "tower",
        "position": {"x": 0.0, "z": 44.0},
        "height": 9.0,
        "color": "#9c4a35",
        "description": "北端地标，眺望古街与海河风光。",
    },
]

MODEL_API_URL = os.getenv(
    "MODEL_API_URL", "http://218.67.242.10:41000/v1/chat/completions"
)
MODEL_API_TOKEN = os.getenv("MODEL_API_TOKEN", "abc@123")
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen3-VL-32B-Instruct")
MODEL_TIMEOUT = float(os.getenv("MODEL_TIMEOUT", "30"))
CHAT_IMAGE_MAX_MB = int(os.getenv("CHAT_IMAGE_MAX_MB", "3"))
SYSTEM_PROMPT = (
    "你是天津古文化街的数字人导览员，语气亲切、简洁专业。"
    "回答以景区导览、文化介绍、路线建议和服务提醒为主。"
    "如果问题超出景区范围，请礼貌说明并引导回景区话题。"
)

TONGYI_API_KEY = os.getenv("DASHSCOPE_API_KEY") or os.getenv("TONGYI_API_KEY")
TONGYI_IMAGE_ENDPOINT = os.getenv(
    "TONGYI_IMAGE_ENDPOINT",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
)
TONGYI_TASK_ENDPOINT = os.getenv(
    "TONGYI_TASK_ENDPOINT",
    "https://dashscope.aliyuncs.com/api/v1/tasks",
)
TONGYI_IMAGE_MODEL = os.getenv("TONGYI_IMAGE_MODEL", "wanx-v1")
TONGYI_IMAGE_SIZE = os.getenv("TONGYI_IMAGE_SIZE", "1024*1024")
TONGYI_IMAGE_MODE = os.getenv("TONGYI_IMAGE_MODE", "text2image")
TONGYI_POLL_INTERVAL = float(os.getenv("TONGYI_POLL_INTERVAL", "2"))
TONGYI_POLL_TIMEOUT = float(os.getenv("TONGYI_POLL_TIMEOUT", "60"))
MAX_UPLOAD_MB = int(os.getenv("PHOTO_MAX_SIZE_MB", "6"))

BASE_PROMPT = (
    "A high-quality portrait photo of a person wearing a traditional "
    "xiangsheng jacket (ma jia), standing on a Deyunshe cross-talk stage, "
    "red curtain, wooden stage, cinematic lighting, realistic, sharp focus."
)
THEME_PROMPTS = {
    "classic": "Classic theater lighting, warm lantern glow, rich wood texture.",
    "warm": "Warm spotlight, cozy atmosphere, golden tones.",
    "night": "Night performance, dramatic spotlight, deep contrast, soft haze.",
}
NEGATIVE_PROMPT = (
    "low quality, blurry, distorted face, extra limbs, watermark, text, logo"
)

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str = Field("", max_length=1200)
    image: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    temperature: float = Field(0.7, ge=0.0, le=1.2)
    max_tokens: int = Field(200, ge=32, le=600)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/landmarks")
def get_landmarks() -> dict:
    return {"landmarks": LANDMARKS}


def _build_chat_payload(request: ChatRequest, stream: bool) -> dict:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    messages = []
    for message in request.messages:
        if not message.content and not message.image:
            raise HTTPException(
                status_code=400, detail="message content or image is required"
            )
        if message.image and message.role != "user":
            raise HTTPException(
                status_code=400, detail="image is only supported for user messages"
            )
        if message.image:
            _validate_chat_image(message.image)
            parts = []
            if message.content:
                parts.append({"type": "text", "text": message.content})
            else:
                parts.append({"type": "text", "text": "请描述图片内容。"})
            parts.append({"type": "image_url", "image_url": {"url": message.image}})
            messages.append({"role": message.role, "content": parts})
        else:
            messages.append({"role": message.role, "content": message.content})

    if messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    return {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "stream": stream,
    }


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict:
    payload = _build_chat_payload(request, stream=False)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MODEL_API_TOKEN}",
    }

    try:
        response = requests.post(
            MODEL_API_URL, headers=headers, json=payload, timeout=MODEL_TIMEOUT
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="model request failed") from exc

    if not response.ok:
        raise HTTPException(
            status_code=502, detail=f"model error {response.status_code}"
        )

    data = response.json()
    content = ""
    try:
        content = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError):
        content = ""

    return {
        "content": content,
        "usage": data.get("usage"),
        "model": data.get("model", MODEL_NAME),
    }


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    payload = _build_chat_payload(request, stream=True)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MODEL_API_TOKEN}",
    }

    def event_stream():
        try:
            with requests.post(
                MODEL_API_URL,
                headers=headers,
                json=payload,
                stream=True,
                timeout=MODEL_TIMEOUT,
            ) as response:
                if not response.ok:
                    error_payload = json.dumps(
                        {"error": f"model error {response.status_code}"}
                    )
                    yield f"data: {error_payload}\n\n"
                    return

                for line in response.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    if line.startswith("data:"):
                        data = line[5:].strip()
                        if data == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        yield f"data: {data}\n\n"
                    else:
                        yield f"data: {line}\n\n"
        except requests.RequestException:
            error_payload = json.dumps({"error": "model request failed"})
            yield f"data: {error_payload}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/photo/generate")
def generate_photo(
    theme: str = Form("classic"),
    photo: Optional[UploadFile] = File(None),
) -> dict:
    if not TONGYI_API_KEY:
        raise HTTPException(status_code=400, detail="DASHSCOPE_API_KEY not configured")

    theme_key = theme if theme in THEME_PROMPTS else "classic"
    prompt = f"{BASE_PROMPT} {THEME_PROMPTS[theme_key]}"

    image_data_url = None
    if photo:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Only image uploads are supported")
        image_bytes = photo.file.read()
        if len(image_bytes) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Photo file is too large")
        if TONGYI_IMAGE_MODE == "image2image":
            image_data_url = _to_data_url(image_bytes, photo.content_type)

    image_url = _request_tongyi_image(prompt, image_data_url=image_data_url)
    cached_url = _cache_generated_image(image_url)
    return {"image_url": cached_url, "prompt": prompt}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _to_data_url(image_bytes: bytes, content_type: Optional[str]) -> str:
    mime = content_type or "image/jpeg"
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{encoded}"

def _estimate_base64_size(encoded: str) -> int:
    padding = encoded.count("=")
    return max(len(encoded) * 3 // 4 - padding, 0)


def _validate_chat_image(image_data_url: str) -> None:
    if not image_data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="invalid image data url")
    if "base64," not in image_data_url:
        raise HTTPException(status_code=400, detail="invalid image data url")
    encoded = image_data_url.split("base64,", 1)[1]
    size = _estimate_base64_size(encoded)
    if size > CHAT_IMAGE_MAX_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail="image is too large")


def _request_tongyi_image(prompt: str, image_data_url: Optional[str]) -> str:
    payload = {
        "model": TONGYI_IMAGE_MODEL,
        "input": {
            "prompt": prompt,
            "negative_prompt": NEGATIVE_PROMPT,
        },
        "parameters": {
            "size": TONGYI_IMAGE_SIZE,
            "n": 1,
        },
    }

    if image_data_url:
        payload["input"]["image"] = image_data_url

    response = _post_tongyi(payload)
    if not response.ok and image_data_url:
        payload["input"].pop("image", None)
        response = _post_tongyi(payload)

    data = _parse_tongyi_response(response)
    task_id = data.get("output", {}).get("task_id")
    if task_id:
        return _poll_tongyi_task(task_id)

    url = _extract_result_url(data)
    if not url:
        raise HTTPException(status_code=502, detail="No image result returned by Tongyi")
    return url


def _post_tongyi(payload: dict) -> requests.Response:
    headers = {
        "Authorization": f"Bearer {TONGYI_API_KEY}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    return requests.post(
        TONGYI_IMAGE_ENDPOINT,
        json=payload,
        headers=headers,
        timeout=30,
    )


def _parse_tongyi_response(response: requests.Response) -> dict:
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Invalid Tongyi response") from exc
    if not response.ok:
        message = data.get("message") or data.get("error", {}).get("message") or "Tongyi error"
        raise HTTPException(status_code=response.status_code, detail=message)
    return data


def _poll_tongyi_task(task_id: str) -> str:
    headers = {
        "Authorization": f"Bearer {TONGYI_API_KEY}",
        "Content-Type": "application/json",
    }
    deadline = time.time() + TONGYI_POLL_TIMEOUT
    last_status = None

    while time.time() < deadline:
        response = requests.get(
            f"{TONGYI_TASK_ENDPOINT}/{task_id}",
            headers=headers,
            timeout=20,
        )
        data = _parse_tongyi_response(response)
        output = data.get("output", {})
        status = output.get("task_status")
        if status == "SUCCEEDED":
            url = _extract_result_url(data)
            if url:
                return url
        if status in {"FAILED", "CANCELED"}:
            raise HTTPException(status_code=502, detail=f"Tongyi task failed: {status}")
        last_status = status
        time.sleep(TONGYI_POLL_INTERVAL)

    raise HTTPException(status_code=504, detail=f"Tongyi task timeout ({last_status})")


def _extract_result_url(data: dict) -> Optional[str]:
    results = data.get("output", {}).get("results") or []
    if not results:
        return None
    return results[0].get("url")


def _cache_generated_image(image_url: str) -> str:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    response = requests.get(image_url, timeout=30)
    if not response.ok:
        raise HTTPException(status_code=502, detail="Failed to fetch generated image")

    content_type = response.headers.get("Content-Type", "").lower()
    ext = "png" if "png" in content_type else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    target = GENERATED_DIR / filename
    target.write_bytes(response.content)
    return f"/static/generated/{filename}"

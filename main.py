import os
from pathlib import Path
from typing import List

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

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
SYSTEM_PROMPT = (
    "你是天津古文化街的数字人导览员，语气亲切、简洁专业。"
    "回答以景区导览、文化介绍、路线建议和服务提醒为主。"
    "如果问题超出景区范围，请礼貌说明并引导回景区话题。"
)


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(system|user|assistant)$")
    content: str = Field(..., min_length=1, max_length=1200)


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


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict:
    if not request.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    messages = [message.model_dump() for message in request.messages]
    if messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
        "stream": False,
    }
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


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

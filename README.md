# Tianjin Ancient Culture Street 3D

Stylized Three.js map served by FastAPI with PPT-style sections.

## Features

- 3D map + landmark focus
- AI application matrix slide
- Video showcase slide
- Digital human chat (proxy to LLM)
- AI travel photo stage (vest + theater background)

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `http://127.0.0.1:8000` in your browser.

## Video Library

Place product videos in `static/media/robot-videos/` and refresh the page to display them.

## Model Config

Set environment variables before starting to override the LLM endpoint:

```bash
export MODEL_API_URL="http://218.67.242.10:41000/v1/chat/completions"
export MODEL_API_TOKEN="abc@123"
export MODEL_NAME="Qwen3-VL-32B-Instruct"
```

## Tongyi Photo Generation

The photo stage calls Tongyi (DashScope) image generation when a key is set:

```bash
export DASHSCOPE_API_KEY="your_dashscope_api_key"
export TONGYI_IMAGE_MODEL="wanx-v1"
export TONGYI_IMAGE_SIZE="1024*1024"
```

Optional image-to-image mode (use the uploaded photo as input):

```bash
export TONGYI_IMAGE_MODE="image2image"
```

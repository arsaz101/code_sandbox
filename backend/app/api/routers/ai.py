from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.core.config import get_settings
import os, asyncio, logging
from typing import List

settings = get_settings()
router = APIRouter(prefix="/ai", tags=["ai"])


class SuggestRequest(BaseModel):
    path: str
    content: str
    cursor_line: int
    cursor_col: int
    project_id: int | None = None
    prefix: str | None = None  # optional already extracted prefix
    suffix: str | None = None  # optional suffix
    max_tokens: int = 120


class SuggestItem(BaseModel):
    completion: str
    score: float | None = None


class SuggestResponse(BaseModel):
    items: List[SuggestItem]
    model: str
    truncated: bool = False


def _fallback_suggestion(req: SuggestRequest) -> str:
    # Very naive heuristic: take previous line indentation and suggest a pass / placeholder
    lines = req.content.splitlines()
    if not lines:
        return "# TODO: implement\n"
    line_idx = max(0, min(req.cursor_line - 1, len(lines) - 1))
    current = lines[line_idx]
    indent = len(current) - len(current.lstrip(" \t"))
    pad = current[:indent]
    # simple multi-line scaffold
    return f"{pad}# suggestion\n{pad}pass\n"


async def _openai_suggest(req: SuggestRequest) -> str | None:
    # Prefer settings (env validated) over raw os.getenv for safety/centralization
    api_key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
    if not api_key:
        logging.getLogger("ai").debug("Skipping OpenAI: no API key")
        return None
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        # Build prompt with small window around cursor
        lines = req.content.splitlines()
        before = lines[max(0, req.cursor_line - 11) : req.cursor_line]
        after = lines[req.cursor_line : req.cursor_line + 10]
        prompt = (
            "You are an AI code completion engine. Return only the code that should follow the current cursor.\n"
            "Do NOT repeat existing code. Avoid explanations. Provide up to a few logical lines.\n"
        )
        snippet = "\n".join(before) + "\n<cursor>\n" + "\n".join(after)
        model = settings.AI_MODEL or os.getenv("AI_MODEL", "gpt-4o-mini")
        logging.getLogger("ai").debug(
            "Calling OpenAI completion model=%s path=%s line=%d col=%d",
            model,
            req.path,
            req.cursor_line,
            req.cursor_col,
        )
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": snippet},
            ],
            max_tokens=min(256, req.max_tokens),
            temperature=0.2,
        )
        text = resp.choices[0].message.content or ""
        # Clean leading/trailing code fences
        text = text.strip()
        if text.startswith("```") and text.endswith("```"):
            lines = text.splitlines()
            if len(lines) > 2:
                text = "\n".join(lines[1:-1])
        return text + ("\n" if not text.endswith("\n") else "")
    except Exception as e:
        logging.getLogger("ai").exception("OpenAI suggest error: %s", e)
        return None


@router.post("/suggest", response_model=SuggestResponse)
async def suggest(req: SuggestRequest, user=Depends(get_current_user)):
    # Attempt LLM, fallback to heuristic
    llm = await _openai_suggest(req)
    if not llm:
        llm = _fallback_suggestion(req)
        model = "fallback"
    else:
        model = settings.AI_MODEL or os.getenv("AI_MODEL", "gpt-4o-mini")
    # Basic trimming for safety
    if len(llm) > req.max_tokens * 8:
        llm = llm[: req.max_tokens * 8]
    logging.getLogger("ai").debug(
        "/ai/suggest returning model=%s chars=%d", model, len(llm)
    )
    return SuggestResponse(items=[SuggestItem(completion=llm, score=None)], model=model)


from fastapi.responses import StreamingResponse
import json


@router.post("/suggest/stream")
async def suggest_stream(req: SuggestRequest, user=Depends(get_current_user)):
    async def event_gen():
        api_key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
        used_model = (
            (settings.AI_MODEL or os.getenv("AI_MODEL", "gpt-4o-mini"))
            if api_key
            else "fallback"
        )
        # Try streaming from OpenAI
        if api_key:
            try:
                from openai import AsyncOpenAI

                client = AsyncOpenAI(api_key=api_key)
                lines = req.content.splitlines()
                before = lines[max(0, req.cursor_line - 21) : req.cursor_line]
                after = lines[req.cursor_line : req.cursor_line + 10]
                snippet = "\n".join(before) + "\n<cursor>\n" + "\n".join(after)
                prompt = (
                    "You are an AI code completion engine. Stream ONLY code that should follow the cursor. "
                    "Avoid repeating existing code. Provide logical continuation, can span multiple lines."
                )
                stream = await client.chat.completions.create(
                    model=used_model,
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": snippet},
                    ],
                    stream=True,
                    max_tokens=min(256, req.max_tokens),
                    temperature=0.2,
                )
                async for part in stream:
                    delta = getattr(part.choices[0].delta, "content", None)
                    if delta:
                        yield f"data: {json.dumps({'delta': delta})}\n\n"
                yield f"data: {json.dumps({'done': True, 'model': used_model})}\n\n"
                return
            except Exception:
                pass
        # Fallback single chunk
        comp = _fallback_suggestion(req)
        yield f"data: {json.dumps({'delta': comp})}\n\n"
        yield f"data: {json.dumps({'done': True, 'model': 'fallback'})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")

# Coding Sandbox (VS Code-like Web IDE)

A full-stack interactive coding sandbox that mimics core VS Code behaviors in the browser. It provides multi-project management, hierarchical file explorer with full CRUD, multi-tab Monaco editor (manual save, inline AI completions, streaming suggestions), run execution with live stdout/stderr, and optional OpenAI-powered code suggestions.

## Features

- Projects: create/list, per-project file trees.
- File Explorer: VS Code style
  - Nested folders, create file/folder inline
  - Rename (F2), Delete (Del), context menu, keyboard navigation (arrows / Enter)
  - Persistent empty folder support via sentinel approach (TODO backend API enhancement)
- Editor:
  - Monaco, multi-tab, dirty indicator, manual save (Ctrl/Cmd+S)
  - Middle-click close, rename & delete propagate to tabs
  - Inline AI suggestions (heuristic + OpenAI) with Tab accept
  - Streaming multi-line completions fallback when immediate suggestion absent
- Runner:
  - Trigger execution (Play icon / Alt+E)
  - Separate scrollable stdout & stderr panels cleared on new run
  - WebSocket streaming output
- Auth: JWT-based, initial admin bootstrap via env (ADMIN_EMAIL / ADMIN_PASSWORD)
- AI Layer:
  - /api/ai/suggest (single-shot)
  - /api/ai/suggest/stream (SSE-style incremental deltas)
  - Fallback heuristic when no OPENAI_API_KEY
- Background Worker & Redis for queued tasks (run execution / future expansions)

## Architecture

| Layer            | Stack                       | Notes                                        |
| ---------------- | --------------------------- | -------------------------------------------- |
| Frontend         | React + Vite + Monaco       | VS Code-like UX, inline completions provider |
| Backend API      | FastAPI                     | Auth, projects, files, runs, AI routes       |
| DB               | Postgres (async SQLAlchemy) | Models in `backend/app/db`                   |
| Queue/Cache      | Redis                       | Future task orchestration                    |
| Worker           | Python (same image)         | Background execution consumer                |
| Runner (sandbox) | python:3.12-slim            | Isolated code execution environment          |

## Repository Layout

```
backend/
  app/
    main.py                # FastAPI app assembly
    api/routers/           # auth, projects, runs, ai, ws
    core/                  # config, logging, security
    db/                    # models, enums, session
    queues/redis.py        # redis client
    services/              # run + file helpers
    schemas/               # pydantic models
frontend/
  src/                     # React application
    components/            # FileExplorer, CodeEditor, RunConsole, etc.
runner/
  worker.py                # (example runner / placeholder)
```

## Environment Variables

Backend (docker-compose `backend.environment`):

- DATABASE_URL
- REDIS_URL
- JWT_SECRET (change in prod)
- ADMIN_EMAIL / ADMIN_PASSWORD (creates bootstrap admin if not present)
- OPENAI_API_KEY (optional; enables real LLM suggestions)
- AI_MODEL (default: gpt-4o-mini)
- ACCESS_TOKEN_EXPIRE_MINUTES (optional override)
- AI_DEBUG (optional, bool; logs internal AI flow)

Frontend:

- VITE_API_BASE (e.g. http://localhost:8000/api)
- VITE_WS_BASE (e.g. ws://localhost:8000/api)
- VITE_AI_DEBUG=true to see client-side AI decision logs

## Quick Start (Docker)

```bash
docker compose up --build
```

Then open: http://localhost:5173

If you want AI suggestions, export your key before building or set in compose:

```bash
export OPENAI_API_KEY=sk-...  # or set in docker-compose.yml
```

Recreate the backend service after adding the key.

## Local (Without Docker)

1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/ide
export REDIS_URL=redis://localhost:6379/0
export JWT_SECRET=dev-secret
uvicorn app.main:app --reload
```

2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Authentication Flow

1. Register (POST /api/auth/register?email=...&password=...)
2. Login (POST /api/auth/login?email=...&password=...) -> returns { access_token }
3. Use `Authorization: Bearer <token>` for all protected APIs (projects, files, runs, ai)

Tokens expire after `ACCESS_TOKEN_EXPIRE_MINUTES` (default 8h); request a new one by logging in again.

## AI Suggestion Behavior

Trigger criteria (frontend):

- At least 3 characters on current line before cursor
- Valid auth token + projectId
- Not previously cached for that line prefix
- If single-shot returns nothing, streaming starts

Endpoints:

- `POST /api/ai/suggest` -> `{ items:[{completion}], model }`
- `POST /api/ai/suggest/stream` -> `text/event-stream` with `data: {"delta": "..."}` chunks and final `data: {"done": true}`

Fallback heuristic builds a simple `# suggestion` + `pass` scaffold when LLM disabled.

## Running Code

- Select project
- Open a file (e.g., `main.py`)
- Edit, Ctrl+S to save
- Press Play button or Alt+E to execute
- Outputs stream into stdout / stderr panels (cleared each run)

## Development Tips

- Enable AI debug: set `VITE_AI_DEBUG=true` and `AI_DEBUG=True` to correlate frontend/backend logs.
- If suggestions always fallback: ensure `OPENAI_API_KEY` is available inside container (`docker compose exec backend env | grep OPENAI`)
- Token expired errors: re-login or increase `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Empty folder persistence: create sentinel `.keep` files (future improvement: API endpoint for folders).

## Extending

Ideas:

- Add refactor actions (rename symbol) via LSP
- Add run cancellation and timeout management
- Add file history / version snapshots
- Improve sandbox isolation (per-run container)
- Implement refresh tokens & UI model selection

## Security Notes

- Do **not** expose this environment publicly without hardening execution (currently runner is simplistic).
- Change `JWT_SECRET` and remove `ADMIN_PASSWORD` from compose in production.
- Consider rate limiting AI endpoints if exposed.

## Troubleshooting

| Issue                     | Cause                       | Fix                                   |
| ------------------------- | --------------------------- | ------------------------------------- |
| 401 on /projects          | Missing/expired token       | Re-login, update Authorization header |
| model = "fallback"        | No OPENAI_API_KEY           | Set key & restart backend             |
| Streaming stalls          | Network proxy buffering     | Use `curl -N` to verify raw stream    |
| Suggestions never appear  | Line prefix < 3 or no token | Type more chars / ensure login        |
| Token expired stack trace | Expired JWT                 | Re-login or extend expiration         |

## License

Internal / Custom (add license details here).

---

Happy hacking! PRs and improvements welcome.

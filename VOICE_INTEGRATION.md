# Voice integration

Sentinel v3 is based on commit `4ff03619949038d99aea0728aef7d6471e39cd28`.
The implementation draws UI/capture ideas from the read-only OpenWhispr reference
at `a7f22e07c3ad1053f4c409f83d0f05ab2f2760c8` and uses Open Interpreter only as
a read-only approval-flow reference at `6e7c4bb78bb1c349b82f584f7e21a529ec39a74f`.
Neither upstream application is embedded or given system access.

## Run

Install backend dependencies, build the frontend, then serve both from FastAPI:

```powershell
Set-Location backend
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 7000
```

For development, run the backend on port 8000 and `npm run dev` from `frontend`.
The Vite proxy forwards `/api/voice/*` to the backend.

`backend/.env.local` is ignored and contains `OPENAI_API_KEY`; it is read with
BOM-safe parsing. `frontend/.env.local` is ignored and may hold public map
provider settings. No browser bundle receives the OpenAI credential.

## Controls and safety

- Hold **Ctrl + Shift** to dictate into an editable Voice Thread draft; it never sends automatically.
- Hold **Ctrl + Shift + Q** for a top-centre recording overlay, then review and explicitly approve or reject the planned action.
- Escape or browser-window blur discards capture. Releasing Ctrl or Shift finishes capture.
- Only view navigation, Tracks toggling, map recentering, chat drafting, and chat sending are supported. The backend and browser validate every command; shell, file, browser, desktop, external-app, and malformed requests are rejected.

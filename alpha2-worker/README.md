# Sentinel Alpha.2 inference worker

This package isolates the supplied Sentinel Level 3 Alpha.2 research model
behind a stateless, non-authoritative inference boundary. Rust remains the
authority for mission epoch, track revision, history, freshness, group state,
commands and task execution.

The artifact is trusted project input and is loaded only with its frozen
Python 3.11 / scikit-learn 1.8.0 environment. `joblib` is pickle-based; never
load an artifact from an untrusted source.

```powershell
py -3.11 -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.lock.txt
$env:PYTHONPATH = 'src'
.venv/Scripts/python.exe -m sentinel_v3.service
```

The worker exposes `GET /health` and `POST /v1/infer`. It owns no rolling
mission state. Every inference request is an immutable, versioned track-history
snapshot. Alpha.2 coordination output is disabled because the supplied model
card reports that capability as experimental and unsuitable for integration.


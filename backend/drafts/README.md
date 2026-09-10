# Phase 0 backend domain draft

`domain.py` defines Pydantic data models only. It has no application entry point, simulator, transport or persistence. Review alongside [foundation contracts](../../contracts/sentinel/README.md).

From the repository root:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/drafts/requirements.txt
backend/.venv/Scripts/python.exe scripts/export_phase0_domain.py
backend/.venv/Scripts/python.exe scripts/verify_phase0.py
```

Verified using Python 3.10.11. The virtual environment is ignored. Do not promote these drafts into Phase 1 application modules without review.

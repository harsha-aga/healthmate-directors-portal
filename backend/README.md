# HealthMate Backend

FastAPI backend for user login, event creation, event listing, and attendance tracking.

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API starts on `http://127.0.0.1:8000`.

If you are using Python `3.14`, make sure you install from this updated `requirements.txt`. Earlier Pydantic versions fail to build on Python `3.14`.

## Demo Accounts

- Director: `director@healthmate.app` / `password123`
- Resident: `margaret@healthmate.app` / `password123`
- Resident: `arthur@healthmate.app` / `password123`

## HIPAA Note

This scaffold is not HIPAA compliant by itself. Real HIPAA readiness also needs encrypted data at rest and in transit, audit logging, access controls, secure hosting, backups, BAAs with vendors, and a production authentication strategy.

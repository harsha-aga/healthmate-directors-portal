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

## Firebase Firestore

The backend can use Firestore instead of local SQLite while keeping the same API routes for
the frontend.

1. Create a Firebase project and enable Firestore.
2. In Firebase Console, open Project settings > Service accounts and generate a private key.
3. Save the downloaded JSON outside the repo, then run:

```bash
cd backend
source .venv/bin/activate
export HEALTHMATE_STORE=firebase
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/firebase-service-account.json"
python -m uvicorn app.main:app --reload
```

You can also use `FIREBASE_SERVICE_ACCOUNT_FILE` instead of `GOOGLE_APPLICATION_CREDENTIALS`,
or set `FIREBASE_SERVICE_ACCOUNT_JSON` to the full JSON string in hosted environments.

On first startup, HealthMate seeds Firestore with the same demo users, events, and attendance
records as the SQLite version.

If you enable Firebase Authentication, the backend also creates matching Firebase Auth users
for HealthMate users when running with `HEALTHMATE_STORE=firebase`.

If you are using Python `3.14`, make sure you install from this updated `requirements.txt`. Earlier Pydantic versions fail to build on Python `3.14`.

## Demo Accounts

- Director: `director@healthmate.app` / `password123`
- Resident: `margaret@healthmate.app` / `password123`
- Resident: `arthur@healthmate.app` / `password123`

## HIPAA Note

This scaffold is not HIPAA compliant by itself. Real HIPAA readiness also needs encrypted data at rest and in transit, audit logging, access controls, secure hosting, backups, BAAs with vendors, and a production authentication strategy.

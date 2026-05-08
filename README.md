# HealthMate

HealthMate is a two-part calendar app for older adults and activity directors.

## Projects

- `frontend/`: React app with login, monthly calendar, director event creation, and resident attendance selection
- `backend/`: FastAPI app with SQLite-backed users, events, and attendance APIs

## Core Flows

- Directors log in, see the calendar, create events on any day, and view who is participating.
- Residents log in, browse all events, and select multiple events to attend.
- The current date is visually highlighted in the monthly calendar.

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload
```

To use Firebase Firestore instead of SQLite, set `HEALTHMATE_STORE=firebase` and point
`GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_FILE` at a Firebase service
account JSON file before starting the backend.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

- `POST /auth/login`
- `GET /users`
- `GET /events`
- `POST /events?director_id=<id>`
- `POST /events/{event_id}/attend`
- `DELETE /events/{event_id}/attend`

## Important Compliance Note

You mentioned HIPAA compliance. This scaffold helps with product structure, but it is not HIPAA compliant on its own. Production readiness would still need secure authentication, encrypted infrastructure, audit trails, role-based access enforcement across the full stack, vendor BAAs, secure backups, and privacy/legal review.

## Python Compatibility

The backend requirements are set up to work with modern Python versions, including Python `3.14`. If you created a virtual environment before this update, recreate it or reinstall dependencies after pulling the new `backend/requirements.txt`.

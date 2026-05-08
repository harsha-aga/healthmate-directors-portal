# HealthMate Frontend

React frontend for the HealthMate calendar experience.

## Run

```bash
cd frontend
npm install
npm run dev
```

The app expects the FastAPI backend at `http://127.0.0.1:8000`.

## Firebase Auth

Firebase Auth is enabled when the Firebase web app environment variables are present.
Without them, the app uses the backend email/password login.

1. In Firebase Console, open your project.
2. Go to Build > Authentication > Sign-in method.
3. Enable Email/Password.
4. Go to Project settings > General > Your apps.
5. Add or open a Web app and copy its Firebase config values.
6. Create `frontend/.env` from `.env.example` and fill in the `VITE_FIREBASE_*` values.

The FastAPI backend still controls HealthMate roles. Firebase Auth verifies the email/password,
then the backend maps the verified email to a HealthMate director or resident.

## Demo Accounts

- Director: `director@healthmate.app` / `password123`
- Resident: `margaret@healthmate.app` / `password123`

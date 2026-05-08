from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    AttendanceToggleRequest,
    CheckInCreateRequest,
    CheckInResponse,
    CheckInUpdateRequest,
    CommunityCreateRequest,
    CommunityResponse,
    EventCreateRequest,
    EventResponse,
    FirebaseLoginRequest,
    LoginRequest,
    ResidentNoteCreateRequest,
    ResidentNoteResponse,
    UserCreateRequest,
    UserResponse,
)
from .store import get_store


app = FastAPI(title="HealthMate API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    _init_firebase_admin()
    get_store().setup()


def _init_firebase_admin() -> None:
    """
    Initialize firebase_admin if credentials are available.

    We use Firebase Auth for verifying ID tokens even when the app's data store is SQLite,
    so token verification can't rely on FirestoreStore being active.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials
    except Exception:
        return

    if firebase_admin._apps:
        return

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    service_account_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

    try:
        if service_account_json:
            cert = credentials.Certificate(json.loads(service_account_json))
            firebase_admin.initialize_app(cert)
        elif service_account_file and os.path.exists(service_account_file):
            cert = credentials.Certificate(service_account_file)
            firebase_admin.initialize_app(cert)
        else:
            # No credentials available; leave Firebase uninitialized.
            return
    except Exception:
        # Don't fail app startup just because Firebase isn't configured.
        return


def _row_to_user(row: dict) -> UserResponse:
    return UserResponse(**row)


def _get_user(user_id: int) -> dict:
    user = get_store().get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _build_event_response(event: dict, viewer_id: Optional[int] = None) -> EventResponse:
    store = get_store()
    participants = store.list_participants(event["id"])
    attending = viewer_id is not None and store.is_attending(event["id"], viewer_id)

    participant_models = [_row_to_user(participant) for participant in participants]
    return EventResponse(
        **event,
        participants=participant_models,
        participant_count=len(participant_models),
        attending=attending,
    )


def _build_checkin_response(checkin: dict) -> CheckInResponse:
    resident = _get_user(int(checkin["resident_id"]))
    return CheckInResponse(
        id=int(checkin["id"]),
        community_id=int(checkin.get("community_id", 0) or 0),
        director_id=int(checkin["director_id"]),
        resident=_row_to_user(resident),
        scheduled_date=checkin["scheduled_date"],
        scheduled_time=checkin["scheduled_time"],
        notes=checkin.get("notes", "") or "",
        status=checkin.get("status", "scheduled") or "scheduled",
    )


def _build_resident_note_response(note: dict) -> ResidentNoteResponse:
    created_at = note.get("created_at", "")
    return ResidentNoteResponse(
        id=int(note["id"]),
        community_id=int(note.get("community_id", 0) or 0),
        director_id=int(note["director_id"]),
        resident_id=int(note["resident_id"]),
        note=str(note.get("note", "")),
        created_at=str(created_at or ""),
    )


def _require_same_community(user: dict, community_id: int) -> None:
    if int(user.get("community_id", 0)) != int(community_id):
        raise HTTPException(status_code=403, detail="User does not belong to this community")


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.post("/communities", status_code=status.HTTP_201_CREATED)
def create_community(payload: CommunityCreateRequest) -> CommunityResponse:
    created = get_store().create_community(payload.name)
    return CommunityResponse(**created)


@app.post("/communities/{community_id}/bootstrap-director", status_code=status.HTTP_201_CREATED)
def bootstrap_director(community_id: int, payload: UserCreateRequest) -> UserResponse:
    """
    Create the first director for a community.

    Normal user creation requires an existing director (to scope the community_id).
    This endpoint is intended only to bootstrap a new community with its first director.
    """
    if payload.role != "director":
        raise HTTPException(status_code=400, detail="Bootstrap can only create director accounts")

    existing_directors = get_store().list_users(role="director", community_id=int(community_id))
    if existing_directors:
        raise HTTPException(
            status_code=409,
            detail="This community already has a director. Use the director workspace to create more users.",
        )

    created = get_store().create_user(payload, int(community_id))
    return _row_to_user(created)


@app.post("/auth/login")
def login(payload: LoginRequest) -> UserResponse:
    user = get_store().login(str(payload.email), payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return _row_to_user(user)


@app.post("/auth/firebase-login")
def firebase_login(payload: FirebaseLoginRequest) -> UserResponse:
    try:
        import firebase_admin
        from firebase_admin import auth

        if not firebase_admin._apps:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Firebase Admin is not configured on the backend. "
                    "Set GOOGLE_APPLICATION_CREDENTIALS (or FIREBASE_SERVICE_ACCOUNT_FILE/JSON) "
                    "to a valid service account key file, then restart the backend."
                ),
            )

        decoded_token = auth.verify_id_token(payload.id_token)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Firebase session. Please sign in again.",
        ) from error

    email = decoded_token.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase account does not include an email address.",
        )

    user = get_store().get_user_by_email(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Firebase account is not registered in HealthMate.",
        )
    return _row_to_user(user)


@app.get("/users")
def list_users(director_id: int = Query(...), role: Optional[str] = Query(default=None)) -> list[UserResponse]:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can list users")
    community_id = int(director["community_id"])
    users = get_store().list_users(role=role, community_id=community_id)
    return [_row_to_user(user) for user in users]


@app.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest, director_id: int = Query(...)) -> UserResponse:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can create users")
    community_id = int(director["community_id"])
    return _row_to_user(get_store().create_user(payload, community_id))


@app.get("/events")
def list_events(viewer_id: Optional[int] = Query(default=None)) -> list[EventResponse]:
    if viewer_id is None:
        raise HTTPException(status_code=400, detail="viewer_id is required")
    viewer = _get_user(viewer_id)
    community_id = int(viewer["community_id"])
    events = get_store().list_events(community_id)
    return [_build_event_response(event, viewer_id=viewer_id) for event in events]


@app.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreateRequest, director_id: int = Query(...)) -> EventResponse:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can create events")

    community_id = int(director["community_id"])
    event = get_store().create_event(payload, director_id, community_id)
    return _build_event_response(event, viewer_id=director_id)


@app.post("/events/{event_id}/attend")
def attend_event(event_id: int, payload: AttendanceToggleRequest) -> EventResponse:
    user = _get_user(payload.user_id)
    if user["role"] != "resident":
        raise HTTPException(status_code=403, detail="Only residents can attend events")

    store = get_store()
    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    store.attend_event(event_id, payload.user_id)
    return _build_event_response(event, viewer_id=payload.user_id)


@app.delete("/events/{event_id}/attend")
def leave_event(event_id: int, payload: AttendanceToggleRequest) -> EventResponse:
    user = _get_user(payload.user_id)
    if user["role"] != "resident":
        raise HTTPException(status_code=403, detail="Only residents can update attendance")

    store = get_store()
    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    store.leave_event(event_id, payload.user_id)
    return _build_event_response(event, viewer_id=payload.user_id)


@app.get("/checkins")
def list_checkins(director_id: int = Query(...)) -> list[CheckInResponse]:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can view check-ins")

    community_id = int(director["community_id"])
    checkins = get_store().list_checkins(director_id, community_id)
    return [_build_checkin_response(checkin) for checkin in checkins]


@app.post("/checkins", status_code=status.HTTP_201_CREATED)
def create_checkin(payload: CheckInCreateRequest, director_id: int = Query(...)) -> CheckInResponse:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can schedule check-ins")
    community_id = int(director["community_id"])

    resident = _get_user(payload.resident_id)
    if resident["role"] != "resident":
        raise HTTPException(status_code=400, detail="Check-ins must be scheduled with a resident")
    _require_same_community(resident, community_id)

    created = get_store().create_checkin(director_id, payload, community_id)
    return _build_checkin_response(created)


@app.patch("/checkins/{checkin_id}")
def update_checkin(checkin_id: int, payload: CheckInUpdateRequest, director_id: int = Query(...)) -> CheckInResponse:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can update check-ins")

    existing = get_store().get_checkin(checkin_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Check-in not found")
    if int(existing["director_id"]) != director_id:
        raise HTTPException(status_code=403, detail="You can only update your own check-ins")

    updated = get_store().update_checkin(checkin_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Check-in not found")
    return _build_checkin_response(updated)


@app.delete("/checkins/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin(checkin_id: int, director_id: int = Query(...)) -> None:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can delete check-ins")

    existing = get_store().get_checkin(checkin_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Check-in not found")
    if int(existing["director_id"]) != director_id:
        raise HTTPException(status_code=403, detail="You can only delete your own check-ins")

    deleted = get_store().delete_checkin(checkin_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Check-in not found")


@app.get("/resident-notes")
def list_resident_notes(resident_id: int = Query(...), director_id: int = Query(...)) -> list[ResidentNoteResponse]:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can view resident notes")
    community_id = int(director["community_id"])

    resident = _get_user(resident_id)
    if resident["role"] != "resident":
        raise HTTPException(status_code=400, detail="Notes can only be attached to residents")
    _require_same_community(resident, community_id)

    notes = get_store().list_resident_notes(resident_id=resident_id, director_id=director_id, community_id=community_id)
    return [_build_resident_note_response(note) for note in notes]


@app.post("/resident-notes", status_code=status.HTTP_201_CREATED)
def create_resident_note(payload: ResidentNoteCreateRequest, director_id: int = Query(...)) -> ResidentNoteResponse:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can create resident notes")
    community_id = int(director["community_id"])

    resident = _get_user(payload.resident_id)
    if resident["role"] != "resident":
        raise HTTPException(status_code=400, detail="Notes can only be attached to residents")
    _require_same_community(resident, community_id)

    created = get_store().create_resident_note(director_id=director_id, payload=payload, community_id=community_id)
    return _build_resident_note_response(created)

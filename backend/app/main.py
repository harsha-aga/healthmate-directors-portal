from __future__ import annotations

import json
import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi import Header
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
    MobileEventResponse,
    MobilePortalStatusResponse,
    FirebaseLoginRequest,
    LoginRequest,
    FallReportCreateRequest,
    FallReportResponse,
    ResidentNoteCreateRequest,
    ResidentNoteResponse,
    UserCreateRequest,
    UserUpdateRequest,
    UserResponse,
)
from .store import get_store


app = FastAPI(title="HealthMate API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    # Dev-friendly: accept any localhost/127.0.0.1 port (Vite can move ports).
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
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


def _get_director(director_id: int) -> dict:
    director = get_store().get_director(director_id)
    if not director:
        raise HTTPException(status_code=404, detail="Director not found")
    return director


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


def _build_fall_report_response(report: dict) -> FallReportResponse:
    created_at = report.get("created_at")
    if hasattr(created_at, "isoformat"):
        created_at_value = created_at.isoformat()
    else:
        created_at_value = str(created_at or "")

    return FallReportResponse(
        id=int(report.get("id", 0)),
        community_id=int(report.get("community_id", 0) or 0),
        director_id=int(report.get("director_id", 0) or 0),
        resident_id=int(report["resident_id"]) if report.get("resident_id") is not None else None,
        incident_date=str(report.get("incident_date", "")),
        incident_time=str(report.get("incident_time", "")),
        location=str(report.get("location", "")),
        witnessed=bool(report.get("witnessed", False)),
        injuries=str(report.get("injuries", "") or ""),
        immediate_action=str(report.get("immediate_action", "") or ""),
        ems_called=bool(report.get("ems_called", False)),
        family_notified=bool(report.get("family_notified", False)),
        notes=str(report.get("notes", "") or ""),
        created_at=created_at_value,
    )


def _require_same_community(user: dict, community_id: int) -> None:
    if int(user.get("community_id", 0)) != int(community_id):
        raise HTTPException(status_code=403, detail="User does not belong to this community")


@app.get("/health")
def health_check() -> dict:
    store = os.getenv("HEALTHMATE_STORE", "sqlite").lower()
    firebase_ready = False
    firebase_project_id = ""
    credentials_project_id = ""
    try:
        import firebase_admin

        firebase_ready = bool(firebase_admin._apps)
        if firebase_ready:
            try:
                firebase_project_id = getattr(firebase_admin.get_app(), "project_id", "") or ""
            except Exception:
                firebase_project_id = ""
    except Exception:
        firebase_ready = False

    # Best-effort expose which service account project_id we loaded (helps debug mismatches).
    cred_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_file and os.path.exists(cred_file):
        try:
            with open(cred_file, "r", encoding="utf-8") as handle:
                credentials_project_id = json.load(handle).get("project_id", "") or ""
        except Exception:
            credentials_project_id = ""

    return {
        "status": "ok",
        "store": store,
        "firebase_admin_initialized": firebase_ready,
        "firebase_project_id": firebase_project_id,
        "credentials_project_id": credentials_project_id,
    }


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


def _get_user_from_bearer(
    authorization: Optional[str],
) -> tuple[Optional[dict], Optional[str], Optional[str], Optional[str]]:
    if not authorization:
        return None, "Missing Authorization header", None, None
    value = str(authorization).strip()
    if not value.lower().startswith("bearer "):
        return None, "Authorization header must be 'Bearer <token>'", None, None
    token = value.split(" ", 1)[1].strip()
    if not token:
        return None, "Authorization token is empty", None, None

    try:
        from firebase_admin import auth

        decoded = auth.verify_id_token(token)
    except Exception as error:
        return None, f"Token verification failed: {error}", None, None

    uid = decoded.get("uid")
    email = decoded.get("email")
    if not email:
        return None, "Token has no email claim", None, str(uid) if uid else None

    portal_user = get_store().get_portal_user_for_firebase(str(uid or ""), str(email))
    return portal_user, None, str(email), str(uid) if uid else None


@app.get("/mobile/events")
def list_mobile_events(
    start: Optional[str] = Query(default=None, description="Start date (YYYY-MM-DD)"),
    end: Optional[str] = Query(default=None, description="End date (YYYY-MM-DD)"),
    authorization: Optional[str] = Header(default=None),
) -> list[MobileEventResponse]:
    """
    Mobile-friendly events feed.

    Auth: pass Firebase ID token as `Authorization: Bearer <token>`.
    Returns events for the authenticated user's community.
    """
    viewer, auth_error, email, _uid = _get_user_from_bearer(authorization)
    if not viewer:
        if auth_error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_error)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This Firebase account ({email or 'unknown'}) is not registered in HealthMate.",
        )

    community_id = int(viewer["community_id"])
    events = get_store().list_events(community_id)
    if start:
        events = [event for event in events if event["event_date"] >= start]
    if end:
        events = [event for event in events if event["event_date"] <= end]

    store = get_store()
    viewer_id = int(viewer["id"])
    results: list[MobileEventResponse] = []
    for event in events:
        attending = store.is_attending(int(event["id"]), viewer_id)
        results.append(
            MobileEventResponse(
                id=int(event["id"]),
                community_id=int(event.get("community_id", 0) or 0),
                event_date=event["event_date"],
                event_time=event["event_time"],
                name=event["name"],
                description=event["description"],
                image_url=event.get("image_url", "") or "",
                created_by=int(event["created_by"]),
                attending=attending,
            )
        )
    return results


@app.get("/mobile/portal-status")
def mobile_portal_status(
    authorization: Optional[str] = Header(default=None),
) -> MobilePortalStatusResponse:
    """
    Whether the signed-in Firebase user is linked to a portal_users record.
    The iOS app should use this to show/hide the calendar.
    """
    viewer, auth_error, email, uid = _get_user_from_bearer(authorization)
    if not viewer:
        if auth_error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_error)
        return MobilePortalStatusResponse(allowed=False, email=email or "", uid=uid or "", portal_user=None)

    return MobilePortalStatusResponse(
        allowed=True,
        email=email or "",
        uid=uid or "",
        portal_user=_row_to_user(viewer),
    )


@app.post("/mobile/fall-reports", status_code=status.HTTP_201_CREATED)
def create_mobile_fall_report(
    payload: FallReportCreateRequest,
    authorization: Optional[str] = Header(default=None),
) -> FallReportResponse:
    """
    Mobile submission endpoint for fall reports.

    Auth: pass Firebase ID token as `Authorization: Bearer <token>`.
    Only allowed for Firebase users that are linked to a portal_users record.
    The report is routed to the community's director so it appears in the portal.
    """
    viewer, auth_error, email, _uid = _get_user_from_bearer(authorization)
    if not viewer:
        if auth_error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_error)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This Firebase account ({email or 'unknown'}) is not registered in HealthMate.",
        )

    community_id = int(viewer["community_id"])
    directors = get_store().list_users(role="director", community_id=community_id)
    if not directors:
        raise HTTPException(status_code=409, detail="No director is configured for this community yet.")
    director = min(directors, key=lambda entry: int(entry.get("id", 0) or 0))

    # Always tie the report to the authenticated portal user.
    payload.resident_id = int(viewer["id"])
    created = get_store().create_fall_report(int(director["id"]), payload, community_id)
    return _build_fall_report_response(created)


@app.get("/mobile/fall-reports")
def list_mobile_fall_reports(
    authorization: Optional[str] = Header(default=None),
) -> list[FallReportResponse]:
    """
    Mobile-friendly fall report history for the signed-in portal user.

    Auth: pass Firebase ID token as `Authorization: Bearer <token>`.
    Returns the reports submitted by this user (resident_id == portal user id).
    """
    viewer, auth_error, email, _uid = _get_user_from_bearer(authorization)
    if not viewer:
        if auth_error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=auth_error)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This Firebase account ({email or 'unknown'}) is not registered in HealthMate.",
        )

    community_id = int(viewer["community_id"])
    reports = get_store().list_fall_reports_for_resident(int(viewer["id"]), community_id)
    return [_build_fall_report_response(report) for report in reports]


@app.get("/users")
def list_users(director_id: int = Query(...), role: Optional[str] = Query(default=None)) -> list[UserResponse]:
    director = _get_director(director_id)
    community_id = int(director["community_id"])
    users = get_store().list_users(role=role, community_id=community_id)
    return [_row_to_user(user) for user in users]


@app.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest, director_id: int = Query(...)) -> UserResponse:
    director = _get_director(director_id)
    community_id = int(director["community_id"])
    return _row_to_user(get_store().create_user(payload, community_id))


@app.patch("/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateRequest, director_id: int = Query(...)) -> UserResponse:
    """
    Update the signed-in director's profile.
    For now we only allow updating your own name from the web app.
    """
    director = _get_director(director_id)
    if int(director["id"]) != int(user_id):
        raise HTTPException(status_code=403, detail="You can only update your own profile")

    updated = get_store().update_user(user_id=user_id, full_name=payload.full_name)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return _row_to_user(updated)


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
    director = _get_director(director_id)
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
    director = _get_director(director_id)
    community_id = int(director["community_id"])
    checkins = get_store().list_checkins(director_id, community_id)
    return [_build_checkin_response(checkin) for checkin in checkins]


@app.post("/checkins", status_code=status.HTTP_201_CREATED)
def create_checkin(payload: CheckInCreateRequest, director_id: int = Query(...)) -> CheckInResponse:
    director = _get_director(director_id)
    community_id = int(director["community_id"])

    resident = _get_user(payload.resident_id)
    if resident["role"] != "resident":
        raise HTTPException(status_code=400, detail="Check-ins must be scheduled with a resident")
    _require_same_community(resident, community_id)

    created = get_store().create_checkin(director_id, payload, community_id)
    return _build_checkin_response(created)


@app.patch("/checkins/{checkin_id}")
def update_checkin(checkin_id: int, payload: CheckInUpdateRequest, director_id: int = Query(...)) -> CheckInResponse:
    director = _get_director(director_id)

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
    director = _get_director(director_id)

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
    director = _get_director(director_id)
    community_id = int(director["community_id"])

    resident = _get_user(resident_id)
    if resident["role"] != "resident":
        raise HTTPException(status_code=400, detail="Notes can only be attached to residents")
    _require_same_community(resident, community_id)

    notes = get_store().list_resident_notes(resident_id=resident_id, director_id=director_id, community_id=community_id)
    return [_build_resident_note_response(note) for note in notes]


@app.post("/resident-notes", status_code=status.HTTP_201_CREATED)
def create_resident_note(payload: ResidentNoteCreateRequest, director_id: int = Query(...)) -> ResidentNoteResponse:
    director = _get_director(director_id)
    community_id = int(director["community_id"])

    resident = _get_user(payload.resident_id)
    if resident["role"] != "resident":
        raise HTTPException(status_code=400, detail="Notes can only be attached to residents")
    _require_same_community(resident, community_id)

    created = get_store().create_resident_note(director_id=director_id, payload=payload, community_id=community_id)
    return _build_resident_note_response(created)


@app.get("/fall-reports")
def list_fall_reports(director_id: int = Query(...)) -> list[FallReportResponse]:
    director = _get_director(director_id)
    community_id = int(director["community_id"])
    reports = get_store().list_fall_reports(int(director["id"]), community_id)
    return [_build_fall_report_response(report) for report in reports]


@app.post("/fall-reports", status_code=status.HTTP_201_CREATED)
def create_fall_report(payload: FallReportCreateRequest, director_id: int = Query(...)) -> FallReportResponse:
    director = _get_director(director_id)
    community_id = int(director["community_id"])

    if payload.resident_id is not None:
        resident = _get_user(int(payload.resident_id))
        _require_same_community(resident, community_id)

    created = get_store().create_fall_report(int(director["id"]), payload, community_id)
    return _build_fall_report_response(created)

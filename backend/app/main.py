from __future__ import annotations

import sqlite3
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from .database import get_connection, init_db, seed_db
from .schemas import (
    AttendanceToggleRequest,
    EventCreateRequest,
    EventResponse,
    LoginRequest,
    UserCreateRequest,
    UserResponse,
)


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
    init_db()
    seed_db()


def _row_to_user(row: dict) -> UserResponse:
    return UserResponse(**row)


def _get_user(user_id: int) -> dict:
    with get_connection() as connection:
        user = connection.execute(
            "SELECT id, full_name, email, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _build_event_response(event: dict, viewer_id: Optional[int] = None) -> EventResponse:
    with get_connection() as connection:
        participants = connection.execute(
            """
            SELECT u.id, u.full_name, u.email, u.role
            FROM attendance a
            JOIN users u ON u.id = a.user_id
            WHERE a.event_id = ?
            ORDER BY u.full_name
            """,
            (event["id"],),
        ).fetchall()

        attending = False
        if viewer_id is not None:
            attendance = connection.execute(
                "SELECT 1 FROM attendance WHERE event_id = ? AND user_id = ?",
                (event["id"], viewer_id),
            ).fetchone()
            attending = attendance is not None

    participant_models = [_row_to_user(participant) for participant in participants]
    return EventResponse(
        **event,
        participants=participant_models,
        participant_count=len(participant_models),
        attending=attending,
    )


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.post("/auth/login")
def login(payload: LoginRequest) -> UserResponse:
    with get_connection() as connection:
        user = connection.execute(
            """
            SELECT id, full_name, email, role
            FROM users
            WHERE email = ? AND password = ?
            """,
            (payload.email, payload.password),
        ).fetchone()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return _row_to_user(user)


@app.get("/users")
def list_users(role: Optional[str] = Query(default=None)) -> list[UserResponse]:
    query = "SELECT id, full_name, email, role FROM users"
    parameters: tuple = ()
    if role:
        query += " WHERE role = ?"
        parameters = (role,)
    query += " ORDER BY full_name"
    with get_connection() as connection:
        users = connection.execute(query, parameters).fetchall()
    return [_row_to_user(user) for user in users]


@app.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest) -> UserResponse:
    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (full_name, email, password, role)
                VALUES (?, ?, ?, ?)
                """,
                (payload.full_name, payload.email, payload.password, payload.role),
            )
            user_id = cursor.lastrowid
            user = connection.execute(
                "SELECT id, full_name, email, role FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=400, detail="A user with that email already exists") from error

    return _row_to_user(user)


@app.get("/events")
def list_events(viewer_id: Optional[int] = Query(default=None)) -> list[EventResponse]:
    with get_connection() as connection:
        events = connection.execute(
            """
            SELECT id, event_date, event_time, name, description, image_url, created_by
            FROM events
            ORDER BY event_date, event_time, id
            """
        ).fetchall()
    return [_build_event_response(event, viewer_id=viewer_id) for event in events]


@app.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreateRequest, director_id: int = Query(...)) -> EventResponse:
    director = _get_user(director_id)
    if director["role"] != "director":
        raise HTTPException(status_code=403, detail="Only directors can create events")

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO events (event_date, event_time, name, description, image_url, created_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload.event_date,
                payload.event_time,
                payload.name,
                payload.description,
                payload.image_url or "",
                director_id,
            ),
        )
        event_id = cursor.lastrowid
        event = connection.execute(
            """
            SELECT id, event_date, event_time, name, description, image_url, created_by
            FROM events
            WHERE id = ?
            """,
            (event_id,),
        ).fetchone()
    return _build_event_response(event, viewer_id=director_id)


@app.post("/events/{event_id}/attend")
def attend_event(event_id: int, payload: AttendanceToggleRequest) -> EventResponse:
    user = _get_user(payload.user_id)
    if user["role"] != "resident":
        raise HTTPException(status_code=403, detail="Only residents can attend events")

    with get_connection() as connection:
        event = connection.execute(
            """
            SELECT id, event_date, event_time, name, description, image_url, created_by
            FROM events
            WHERE id = ?
            """,
            (event_id,),
        ).fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        connection.execute(
            "INSERT OR IGNORE INTO attendance (user_id, event_id) VALUES (?, ?)",
            (payload.user_id, event_id),
        )
    return _build_event_response(event, viewer_id=payload.user_id)


@app.delete("/events/{event_id}/attend")
def leave_event(event_id: int, payload: AttendanceToggleRequest) -> EventResponse:
    user = _get_user(payload.user_id)
    if user["role"] != "resident":
        raise HTTPException(status_code=403, detail="Only residents can update attendance")

    with get_connection() as connection:
        event = connection.execute(
            """
            SELECT id, event_date, event_time, name, description, image_url, created_by
            FROM events
            WHERE id = ?
            """,
            (event_id,),
        ).fetchone()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        connection.execute(
            "DELETE FROM attendance WHERE user_id = ? AND event_id = ?",
            (payload.user_id, event_id),
        )
    return _build_event_response(event, viewer_id=payload.user_id)

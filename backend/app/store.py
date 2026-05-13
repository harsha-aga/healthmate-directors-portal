from __future__ import annotations

import json
import os
import sqlite3
from abc import ABC, abstractmethod
from functools import lru_cache
from typing import Optional

from fastapi import HTTPException

from .database import get_connection, init_db, seed_db
from .schemas import (
    CheckInCreateRequest,
    CheckInUpdateRequest,
    EventCreateRequest,
    FallReportCreateRequest,
    ResidentNoteCreateRequest,
    UserCreateRequest,
)


EVENT_FIELDS = ("id", "community_id", "event_date", "event_time", "name", "description", "image_url", "created_by")
USER_FIELDS = ("id", "community_id", "full_name", "email", "role")


class AppStore(ABC):
    @abstractmethod
    def create_community(self, name: str) -> dict:
        pass

    @abstractmethod
    def setup(self) -> None:
        pass

    @abstractmethod
    def login(self, email: str, password: str) -> Optional[dict]:
        pass

    @abstractmethod
    def list_users(self, role: Optional[str] = None, community_id: Optional[int] = None) -> list[dict]:
        pass

    @abstractmethod
    def create_user(self, payload: UserCreateRequest, community_id: int) -> dict:
        pass

    @abstractmethod
    def get_user_by_email(self, email: str) -> Optional[dict]:
        pass

    @abstractmethod
    def get_portal_user_for_firebase(self, firebase_uid: str, email: str) -> Optional[dict]:
        """
        Bridge Firebase Auth users (mobile) to portal users (director portal) so we can gate access.
        Implementations may auto-link a portal user record to the Firebase UID on first successful match.
        """
        pass

    @abstractmethod
    def get_user(self, user_id: int) -> Optional[dict]:
        pass

    @abstractmethod
    def get_director(self, director_id: int) -> Optional[dict]:
        pass

    @abstractmethod
    def update_user(self, user_id: int, full_name: str) -> Optional[dict]:
        pass

    @abstractmethod
    def list_events(self, community_id: int) -> list[dict]:
        pass

    @abstractmethod
    def create_event(self, payload: EventCreateRequest, director_id: int, community_id: int) -> dict:
        pass

    @abstractmethod
    def get_event(self, event_id: int) -> Optional[dict]:
        pass

    @abstractmethod
    def list_participants(self, event_id: int) -> list[dict]:
        pass

    @abstractmethod
    def is_attending(self, event_id: int, user_id: int) -> bool:
        pass

    @abstractmethod
    def attend_event(self, event_id: int, user_id: int) -> None:
        pass

    @abstractmethod
    def leave_event(self, event_id: int, user_id: int) -> None:
        pass

    @abstractmethod
    def list_checkins(self, director_id: int, community_id: int) -> list[dict]:
        pass

    @abstractmethod
    def create_checkin(self, director_id: int, payload: CheckInCreateRequest, community_id: int) -> dict:
        pass

    @abstractmethod
    def get_checkin(self, checkin_id: int) -> Optional[dict]:
        pass

    @abstractmethod
    def update_checkin(self, checkin_id: int, payload: CheckInUpdateRequest) -> Optional[dict]:
        pass

    @abstractmethod
    def delete_checkin(self, checkin_id: int) -> bool:
        pass

    @abstractmethod
    def list_resident_notes(self, resident_id: int, director_id: int, community_id: int) -> list[dict]:
        pass

    @abstractmethod
    def create_resident_note(self, director_id: int, payload: ResidentNoteCreateRequest, community_id: int) -> dict:
        pass

    @abstractmethod
    def list_fall_reports(self, director_id: int, community_id: int) -> list[dict]:
        pass

    @abstractmethod
    def create_fall_report(self, director_id: int, payload, community_id: int) -> dict:
        pass


class SQLiteStore(AppStore):
    def create_community(self, name: str) -> dict:
        with get_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO communities (slug, name) VALUES (?, ?)",
                (f"tmp-{os.urandom(6).hex()}", name),
            )
            community_id = cursor.lastrowid
            connection.execute(
                "UPDATE communities SET slug = ? WHERE id = ?",
                (f"community-{community_id}", community_id),
            )
            return connection.execute(
                "SELECT id, slug, name FROM communities WHERE id = ?",
                (community_id,),
            ).fetchone()

    def setup(self) -> None:
        init_db()
        seed_db()

    def login(self, email: str, password: str) -> Optional[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT id, community_id, full_name, email, role
                FROM users
                WHERE email = ? AND password = ?
                """,
                (email, password),
            ).fetchone()

    def list_users(self, role: Optional[str] = None, community_id: Optional[int] = None) -> list[dict]:
        query = "SELECT id, community_id, full_name, email, role FROM users"
        clauses = []
        params: list = []
        if community_id is not None:
            clauses.append("community_id = ?")
            params.append(community_id)
        if role:
            clauses.append("role = ?")
            params.append(role)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY full_name"
        with get_connection() as connection:
            return connection.execute(query, tuple(params)).fetchall()

    def create_user(self, payload: UserCreateRequest, community_id: int) -> dict:
        try:
            with get_connection() as connection:
                password = payload.password or ""
                cursor = connection.execute(
                    """
                    INSERT INTO users (community_id, full_name, email, password, role)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (community_id, payload.full_name, payload.email, password, payload.role),
                )
                user_id = cursor.lastrowid

                if payload.role == "director":
                    # Keep a director-specific table for director portal needs.
                    connection.execute(
                        """
                        INSERT OR REPLACE INTO directors (id, community_id, full_name, email, password, role)
                        VALUES (?, ?, ?, ?, ?, 'director')
                        """,
                        (user_id, community_id, payload.full_name, payload.email, password),
                    )

                return connection.execute(
                    "SELECT id, community_id, full_name, email, role FROM users WHERE id = ?",
                    (user_id,),
                ).fetchone()
        except sqlite3.IntegrityError as error:
            raise HTTPException(status_code=400, detail="A user with that email already exists") from error

    def get_user_by_email(self, email: str) -> Optional[dict]:
        with get_connection() as connection:
            return connection.execute(
                "SELECT id, community_id, full_name, email, role FROM users WHERE email = ?",
                (email,),
            ).fetchone()

    def get_portal_user_for_firebase(self, firebase_uid: str, email: str) -> Optional[dict]:
        # SQLite mode doesn't integrate with Firebase Auth; treat email lookup as the bridge.
        return self.get_user_by_email(email)

    def get_user(self, user_id: int) -> Optional[dict]:
        with get_connection() as connection:
            return connection.execute(
                "SELECT id, community_id, full_name, email, role FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()

    def get_director(self, director_id: int) -> Optional[dict]:
        with get_connection() as connection:
            director = connection.execute(
                "SELECT id, community_id, full_name, email, 'director' AS role FROM directors WHERE id = ?",
                (director_id,),
            ).fetchone()
            if director:
                return director

            # Backwards-compat: if the directors table wasn't populated yet, fall back to users
            # and backfill the directors row.
            user = connection.execute(
                "SELECT id, community_id, full_name, email, password, role FROM users WHERE id = ?",
                (director_id,),
            ).fetchone()
            if not user or user.get("role") != "director":
                return None

            connection.execute(
                """
                INSERT OR REPLACE INTO directors (id, community_id, full_name, email, password, role)
                VALUES (?, ?, ?, ?, ?, 'director')
                """,
                (
                    user["id"],
                    user.get("community_id", 1) or 1,
                    user["full_name"],
                    user["email"],
                    user.get("password", "") or "",
                ),
            )
            return connection.execute(
                "SELECT id, community_id, full_name, email, 'director' AS role FROM directors WHERE id = ?",
                (director_id,),
            ).fetchone()

    def update_user(self, user_id: int, full_name: str) -> Optional[dict]:
        with get_connection() as connection:
            connection.execute("UPDATE users SET full_name = ? WHERE id = ?", (full_name, user_id))
            # If this user is a director, keep the directors table in sync.
            connection.execute("UPDATE directors SET full_name = ? WHERE id = ?", (full_name, user_id))
            return connection.execute(
                "SELECT id, community_id, full_name, email, role FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()

    def list_events(self, community_id: int) -> list[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT id, community_id, event_date, event_time, name, description, image_url, created_by
                FROM events
                WHERE community_id = ?
                ORDER BY event_date, event_time, id
                """,
                (community_id,),
            ).fetchall()

    def create_event(self, payload: EventCreateRequest, director_id: int, community_id: int) -> dict:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO events (community_id, event_date, event_time, name, description, image_url, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    community_id,
                    payload.event_date,
                    payload.event_time,
                    payload.name,
                    payload.description,
                    payload.image_url or "",
                    director_id,
                ),
            )
            event_id = cursor.lastrowid
            return connection.execute(
                """
                SELECT id, community_id, event_date, event_time, name, description, image_url, created_by
                FROM events
                WHERE id = ?
                """,
                (event_id,),
            ).fetchone()

    def get_event(self, event_id: int) -> Optional[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT id, community_id, event_date, event_time, name, description, image_url, created_by
                FROM events
                WHERE id = ?
                """,
                (event_id,),
            ).fetchone()

    def list_participants(self, event_id: int) -> list[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT u.id, u.community_id, u.full_name, u.email, u.role
                FROM attendance a
                JOIN users u ON u.id = a.user_id
                WHERE a.event_id = ?
                ORDER BY u.full_name
                """,
                (event_id,),
            ).fetchall()

    def is_attending(self, event_id: int, user_id: int) -> bool:
        with get_connection() as connection:
            attendance = connection.execute(
                "SELECT 1 FROM attendance WHERE event_id = ? AND user_id = ?",
                (event_id, user_id),
            ).fetchone()
            return attendance is not None

    def attend_event(self, event_id: int, user_id: int) -> None:
        with get_connection() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO attendance (user_id, event_id) VALUES (?, ?)",
                (user_id, event_id),
            )

    def leave_event(self, event_id: int, user_id: int) -> None:
        with get_connection() as connection:
            connection.execute(
                "DELETE FROM attendance WHERE user_id = ? AND event_id = ?",
                (user_id, event_id),
            )

    def list_checkins(self, director_id: int, community_id: int) -> list[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, scheduled_date, scheduled_time, notes, status
                FROM checkins
                WHERE community_id = ? AND director_id = ?
                ORDER BY scheduled_date, scheduled_time, id
                """,
                (community_id, director_id),
            ).fetchall()

    def create_checkin(self, director_id: int, payload: CheckInCreateRequest, community_id: int) -> dict:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO checkins (community_id, director_id, resident_id, scheduled_date, scheduled_time, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, 'scheduled')
                """,
                (
                    community_id,
                    director_id,
                    payload.resident_id,
                    payload.scheduled_date,
                    payload.scheduled_time,
                    payload.notes or "",
                ),
            )
            checkin_id = cursor.lastrowid
            return connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, scheduled_date, scheduled_time, notes, status
                FROM checkins
                WHERE id = ?
                """,
                (checkin_id,),
            ).fetchone()

    def get_checkin(self, checkin_id: int) -> Optional[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, scheduled_date, scheduled_time, notes, status
                FROM checkins
                WHERE id = ?
                """,
                (checkin_id,),
            ).fetchone()

    def update_checkin(self, checkin_id: int, payload: CheckInUpdateRequest) -> Optional[dict]:
        with get_connection() as connection:
            existing = connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, scheduled_date, scheduled_time, notes, status
                FROM checkins
                WHERE id = ?
                """,
                (checkin_id,),
            ).fetchone()
            if not existing:
                return None

            notes = payload.notes if payload.notes is not None else existing.get("notes", "")
            connection.execute(
                "UPDATE checkins SET status = ?, notes = ? WHERE id = ?",
                (payload.status, notes, checkin_id),
            )
            return connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, scheduled_date, scheduled_time, notes, status
                FROM checkins
                WHERE id = ?
                """,
                (checkin_id,),
            ).fetchone()

    def delete_checkin(self, checkin_id: int) -> bool:
        with get_connection() as connection:
            cursor = connection.execute("DELETE FROM checkins WHERE id = ?", (checkin_id,))
            return cursor.rowcount > 0

    def list_resident_notes(self, resident_id: int, director_id: int, community_id: int) -> list[dict]:
        with get_connection() as connection:
            return connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, note, created_at
                FROM resident_notes
                WHERE community_id = ? AND resident_id = ? AND director_id = ?
                ORDER BY created_at DESC, id DESC
                """,
                (community_id, resident_id, director_id),
            ).fetchall()

    def create_resident_note(self, director_id: int, payload: ResidentNoteCreateRequest, community_id: int) -> dict:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO resident_notes (community_id, director_id, resident_id, note)
                VALUES (?, ?, ?, ?)
                """,
                (community_id, director_id, payload.resident_id, payload.note),
            )
            note_id = cursor.lastrowid
            return connection.execute(
                """
                SELECT id, community_id, director_id, resident_id, note, created_at
                FROM resident_notes
                WHERE id = ?
                """,
                (note_id,),
            ).fetchone()

    def list_fall_reports(self, director_id: int, community_id: int) -> list[dict]:
        # SQLite mode doesn't currently support fall reports.
        return []

    def create_fall_report(self, director_id: int, payload, community_id: int) -> dict:
        raise HTTPException(status_code=501, detail="Fall reports are only supported in Firestore mode.")


class FirestoreStore(AppStore):
    USERS_COLLECTION = "portal_users"
    DIRECTORS_COLLECTION = "portal_directors"
    COMMUNITIES_COLLECTION = "portal_communities"
    EVENTS_COLLECTION = "portal_events"
    ATTENDANCE_COLLECTION = "portal_attendance"
    CHECKINS_COLLECTION = "portal_checkins"
    RESIDENT_NOTES_COLLECTION = "portal_resident_notes"
    FALL_REPORTS_COLLECTION = "portal_fall_reports"
    METADATA_COLLECTION = "portal_metadata"

    @staticmethod
    def _get_with_default(data: dict, key: str, default):
        value = data.get(key, default)
        return default if value is None else value

    def _normalize_user_snapshot(self, snapshot) -> dict:
        """
        Firestore documents created before we introduced multi-community may be missing community_id.
        Default them to 1 and best-effort backfill the field so future reads are consistent.
        """
        data = self._doc_to_dict(snapshot)
        if "community_id" not in data or data.get("community_id") is None:
            try:
                snapshot.reference.update({"community_id": 1})
            except Exception:
                pass
            data["community_id"] = 1

        # Return only the public fields we expose.
        return {
            "id": int(self._get_with_default(data, "id", 0)),
            "community_id": int(self._get_with_default(data, "community_id", 1)),
            "full_name": str(self._get_with_default(data, "full_name", "")),
            "email": str(self._get_with_default(data, "email", "")),
            "role": str(self._get_with_default(data, "role", "")),
        }

    def create_community(self, name: str) -> dict:
        community_id = self._next_id(self.COMMUNITIES_COLLECTION)
        community = {
            "id": community_id,
            "slug": f"community-{community_id}",
            "name": name,
            "created_at": self.firestore.SERVER_TIMESTAMP,
        }
        self._collection(self.COMMUNITIES_COLLECTION).document(str(community_id)).set(community)
        snapshot = self._collection(self.COMMUNITIES_COLLECTION).document(str(community_id)).get()
        return self._doc_to_dict(snapshot)

    def __init__(self) -> None:
        try:
            import firebase_admin
            from firebase_admin import auth, credentials, firestore
        except ImportError as error:
            raise RuntimeError(
                "Firebase storage is enabled, but firebase-admin is not installed. "
                "Run `pip install -r requirements.txt`."
            ) from error

        self.firestore = firestore
        self.auth = auth
        if not firebase_admin._apps:
            service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
            service_account_file = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE") or os.getenv(
                "GOOGLE_APPLICATION_CREDENTIALS"
            )

            if service_account_json:
                cert = credentials.Certificate(json.loads(service_account_json))
                firebase_admin.initialize_app(cert)
            elif service_account_file:
                cert = credentials.Certificate(service_account_file)
                firebase_admin.initialize_app(cert)
            else:
                firebase_admin.initialize_app()

        self.db = firestore.client()

    def setup(self) -> None:
        self._seed()

    def _collection(self, name: str):
        return self.db.collection(name)

    def _next_id(self, name: str) -> int:
        counter_ref = self._collection("metadata").document(f"{name}_counter")

        @self.firestore.transactional
        def increment(transaction):
            snapshot = counter_ref.get(transaction=transaction)
            current = snapshot.get("value") if snapshot.exists else 0
            next_value = int(current) + 1
            transaction.set(counter_ref, {"value": next_value})
            return next_value

        transaction = self.db.transaction()
        return increment(transaction)

    @staticmethod
    def _doc_to_dict(snapshot) -> dict:
        data = snapshot.to_dict() or {}
        return dict(data)

    def _find_user_by_email(self, email: str) -> Optional[dict]:
        users = self._collection(self.USERS_COLLECTION).where("email", "==", email).limit(1).stream()
        for user in users:
            return self._normalize_user_snapshot(user)
        # Backwards-compat: older data may exist in `users` from before we namespaced collections.
        legacy = self._collection("users").where("email", "==", email).limit(1).stream()
        for user in legacy:
            normalized = self._normalize_user_snapshot(user)
            try:
                self._collection(self.USERS_COLLECTION).document(str(normalized.get("id", ""))).set(
                    user.to_dict() or {}, merge=True
                )
            except Exception:
                pass
            return normalized
        return None

    def login(self, email: str, password: str) -> Optional[dict]:
        # NOTE: This path is only used in SQLite mode; Firestore mode uses Firebase Auth tokens.
        snapshot_stream = self._collection("users").where("email", "==", email).limit(1).stream()
        snapshot = None
        for doc in snapshot_stream:
            snapshot = doc
            break
        if not snapshot:
            return None
        raw = self._doc_to_dict(snapshot)
        if raw.get("password") != password:
            return None
        normalized = self._normalize_user_snapshot(snapshot)
        return {field: normalized[field] for field in USER_FIELDS}

    def list_users(self, role: Optional[str] = None, community_id: Optional[int] = None) -> list[dict]:
        query = self._collection(self.USERS_COLLECTION)
        if community_id is not None:
            query = query.where("community_id", "==", int(community_id))
        if role:
            query = query.where("role", "==", role)
        users = [{field: self._normalize_user_snapshot(user)[field] for field in USER_FIELDS} for user in query.stream()]
        return sorted(users, key=lambda user: user["full_name"])

    def create_user(self, payload: UserCreateRequest, community_id: int) -> dict:
        if self._find_user_by_email(str(payload.email)):
            raise HTTPException(status_code=400, detail="A user with that email already exists")

        user_id = self._next_id(self.USERS_COLLECTION)
        password = payload.password or ""
        user = {
            "id": user_id,
            "community_id": int(community_id),
            "full_name": payload.full_name,
            "email": str(payload.email),
            "password": password,
            "role": payload.role,
        }
        self._collection(self.USERS_COLLECTION).document(str(user_id)).set(user)
        if payload.role == "director":
            self._collection(self.DIRECTORS_COLLECTION).document(str(user_id)).set(dict(user))
            # Directors sign in via Firebase Auth (Email/Password), so ensure an auth user exists.
            self._ensure_auth_user(user["email"], user["password"], user["full_name"])
        return {field: user[field] for field in USER_FIELDS}

    def get_user_by_email(self, email: str) -> Optional[dict]:
        normalized = self._find_user_by_email(email)
        if not normalized:
            return None
        return {field: normalized[field] for field in USER_FIELDS}

    def get_portal_user_for_firebase(self, firebase_uid: str, email: str) -> Optional[dict]:
        """
        Bridge a Firebase Auth user (mobile) to a portal user row.

        We accept any of:
        - portal_users doc id == firebase UID
        - portal_users.firebase_uid == firebase UID
        - portal_users.email == email (and then we backfill firebase_uid for future lookups)
        """
        firebase_uid = str(firebase_uid or "").strip()
        email = str(email or "").strip()
        if not firebase_uid or not email:
            return None

        # Fast path: doc id is the UID.
        direct = self._collection(self.USERS_COLLECTION).document(firebase_uid).get()
        if direct.exists:
            normalized = self._normalize_user_snapshot(direct)
            return {field: normalized[field] for field in USER_FIELDS}

        # Next: explicit firebase_uid field.
        matches = (
            self._collection(self.USERS_COLLECTION)
            .where("firebase_uid", "==", firebase_uid)
            .limit(1)
            .stream()
        )
        for snapshot in matches:
            normalized = self._normalize_user_snapshot(snapshot)
            return {field: normalized[field] for field in USER_FIELDS}

        # Fallback: email match; if found, backfill firebase_uid so future checks are stable.
        email_matches = (
            self._collection(self.USERS_COLLECTION)
            .where("email", "==", email)
            .limit(1)
            .stream()
        )
        for snapshot in email_matches:
            try:
                snapshot.reference.set({"firebase_uid": firebase_uid}, merge=True)
            except Exception:
                pass
            normalized = self._normalize_user_snapshot(snapshot)
            return {field: normalized[field] for field in USER_FIELDS}

        return None

    def get_user(self, user_id: int) -> Optional[dict]:
        snapshot = self._collection(self.USERS_COLLECTION).document(str(user_id)).get()
        if not snapshot.exists:
            # Backwards-compat: migrate on read from legacy users collection.
            legacy = self._collection("users").document(str(user_id)).get()
            if not legacy.exists:
                return None
            raw = legacy.to_dict() or {}
            try:
                self._collection(self.USERS_COLLECTION).document(str(user_id)).set(raw, merge=True)
            except Exception:
                pass
            snapshot = legacy
        normalized = self._normalize_user_snapshot(snapshot)
        return {field: normalized[field] for field in USER_FIELDS}

    def get_director(self, director_id: int) -> Optional[dict]:
        snapshot = self._collection(self.DIRECTORS_COLLECTION).document(str(director_id)).get()
        if snapshot.exists:
            normalized = self._normalize_user_snapshot(snapshot)
            # Ensure role stays director.
            normalized["role"] = "director"
            return {field: normalized[field] for field in USER_FIELDS}

        # Backwards-compat: if director isn't in `directors` yet, fall back to users and backfill.
        user_snapshot = self._collection(self.USERS_COLLECTION).document(str(director_id)).get()
        if not user_snapshot.exists:
            legacy = self._collection("users").document(str(director_id)).get()
            if not legacy.exists:
                return None
            try:
                self._collection(self.USERS_COLLECTION).document(str(director_id)).set(legacy.to_dict() or {}, merge=True)
            except Exception:
                pass
            user_snapshot = legacy
        raw = self._doc_to_dict(user_snapshot)
        if str(raw.get("role", "")) != "director":
            return None

        normalized = self._normalize_user_snapshot(user_snapshot)
        try:
            self._collection(self.DIRECTORS_COLLECTION).document(str(director_id)).set(dict(raw), merge=True)
        except Exception:
            pass
        normalized["role"] = "director"
        return {field: normalized[field] for field in USER_FIELDS}

    def update_user(self, user_id: int, full_name: str) -> Optional[dict]:
        ref = self._collection("users").document(str(user_id))
        snapshot = ref.get()
        if not snapshot.exists:
            return None
        current = self._doc_to_dict(snapshot)
        ref.update({"full_name": full_name})
        if str(current.get("role", "")) == "director":
            try:
                self._collection("directors").document(str(user_id)).set(
                    {**current, "full_name": full_name}, merge=True
                )
            except Exception:
                pass
        refreshed = ref.get()
        normalized = self._normalize_user_snapshot(refreshed)
        return {field: normalized[field] for field in USER_FIELDS}

    def list_events(self, community_id: int) -> list[dict]:
        query = self._collection(self.EVENTS_COLLECTION).where("community_id", "==", int(community_id))
        events = [{field: event.to_dict()[field] for field in EVENT_FIELDS} for event in query.stream()]
        return sorted(events, key=lambda event: (event["event_date"], event["event_time"], event["id"]))

    def create_event(self, payload: EventCreateRequest, director_id: int, community_id: int) -> dict:
        event_id = self._next_id(self.EVENTS_COLLECTION)
        event = {
            "id": event_id,
            "community_id": int(community_id),
            "event_date": payload.event_date,
            "event_time": payload.event_time,
            "name": payload.name,
            "description": payload.description,
            "image_url": payload.image_url or "",
            "created_by": director_id,
        }
        self._collection(self.EVENTS_COLLECTION).document(str(event_id)).set(event)
        return event

    def get_event(self, event_id: int) -> Optional[dict]:
        snapshot = self._collection(self.EVENTS_COLLECTION).document(str(event_id)).get()
        if not snapshot.exists:
            return None
        event = self._doc_to_dict(snapshot)
        return {field: event[field] for field in EVENT_FIELDS}

    def list_participants(self, event_id: int) -> list[dict]:
        attendance = self._collection(self.ATTENDANCE_COLLECTION).where("event_id", "==", event_id).stream()
        users = []
        for entry in attendance:
            user = self.get_user(self._doc_to_dict(entry)["user_id"])
            if user:
                users.append(user)
        return sorted(users, key=lambda user: user["full_name"])

    def is_attending(self, event_id: int, user_id: int) -> bool:
        return self._collection(self.ATTENDANCE_COLLECTION).document(f"{user_id}_{event_id}").get().exists

    def attend_event(self, event_id: int, user_id: int) -> None:
        self._collection(self.ATTENDANCE_COLLECTION).document(f"{user_id}_{event_id}").set(
            {"user_id": user_id, "event_id": event_id}
        )

    def leave_event(self, event_id: int, user_id: int) -> None:
        self._collection(self.ATTENDANCE_COLLECTION).document(f"{user_id}_{event_id}").delete()

    def _seed(self) -> None:
        default_community_id = 1
        if not list(self._collection(self.COMMUNITIES_COLLECTION).limit(1).stream()):
            self._collection(self.COMMUNITIES_COLLECTION).document(str(default_community_id)).set(
                {
                    "id": default_community_id,
                    "slug": "default",
                    "name": "Default Community",
                    "created_at": self.firestore.SERVER_TIMESTAMP,
                }
            )
            self._collection(self.METADATA_COLLECTION).document(f"{self.COMMUNITIES_COLLECTION}_counter").set({"value": default_community_id})

        if list(self._collection(self.USERS_COLLECTION).limit(1).stream()):
            for user in self._collection(self.USERS_COLLECTION).stream():
                data = self._doc_to_dict(user)
                if data.get("email") and data.get("password"):
                    self._ensure_auth_user(data["email"], data["password"], data.get("full_name", ""))
            return

        users = [
            UserCreateRequest(
                full_name="Grace Director",
                email="director@healthmate.app",
                password="password123",
                role="director",
            ),
            UserCreateRequest(
                full_name="Margaret Johnson",
                email="margaret@healthmate.app",
                password="password123",
                role="resident",
            ),
            UserCreateRequest(
                full_name="Arthur Miles",
                email="arthur@healthmate.app",
                password="password123",
                role="resident",
            ),
            UserCreateRequest(
                full_name="Helen Carter",
                email="helen@healthmate.app",
                password="password123",
                role="resident",
            ),
        ]
        created_users = [self.create_user(user, default_community_id) for user in users]
        director_id = next(user["id"] for user in created_users if user["role"] == "director")
        resident_ids = [user["id"] for user in created_users if user["role"] == "resident"]

        events = [
            self.create_event(
                EventCreateRequest(
                    event_date="2026-04-22",
                    event_time="09:00",
                    name="Chair Yoga",
                    description="A gentle movement class focused on stretching, breathing, and balance.",
                    image_url="",
                ),
                director_id,
                default_community_id,
            ),
            self.create_event(
                EventCreateRequest(
                    event_date="2026-04-22",
                    event_time="14:00",
                    name="Garden Walk",
                    description="A supervised outdoor walk through the community garden.",
                    image_url=(
                        "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735"
                        "?auto=format&fit=crop&w=800&q=80"
                    ),
                ),
                director_id,
                default_community_id,
            ),
            self.create_event(
                EventCreateRequest(
                    event_date="2026-04-24",
                    event_time="11:30",
                    name="Music Hour",
                    description="Residents can sing along with familiar favorites and request songs.",
                    image_url="",
                ),
                director_id,
                default_community_id,
            ),
        ]

        self.attend_event(events[0]["id"], resident_ids[0])
        self.attend_event(events[1]["id"], resident_ids[0])
        self.attend_event(events[1]["id"], resident_ids[1])

    def _ensure_auth_user(self, email: str, password: str, full_name: str) -> None:
        """
        Ensure a Firebase Auth user exists for this email.

        For this project we also keep a (dev/demo) password in Firestore. If the Auth user
        already exists, we best-effort sync its password + display name so directors can
        sign in with the password shown in the portal seed data.
        """
        email = str(email or "").strip()
        password = str(password or "")
        full_name = str(full_name or "").strip()
        if not email:
            return

        try:
            existing = self.auth.get_user_by_email(email)
        except self.auth.UserNotFoundError:
            if password:
                self.auth.create_user(email=email, password=password, display_name=full_name or None)
            else:
                self.auth.create_user(email=email, display_name=full_name or None)
            return

        # Best-effort sync for existing accounts.
        try:
            updates: dict = {}
            if full_name and existing.display_name != full_name:
                updates["display_name"] = full_name
            # Only update password if we have one on record (avoids clobbering accounts that
            # were intentionally created without a password in this portal DB).
            if password:
                updates["password"] = password
            if updates:
                self.auth.update_user(existing.uid, **updates)
        except Exception:
            # Never block app startup on Auth sync.
            pass

    def list_checkins(self, director_id: int, community_id: int) -> list[dict]:
        checkins = (
            self._collection(self.CHECKINS_COLLECTION)
            .where("community_id", "==", int(community_id))
            .where("director_id", "==", director_id)
            .stream()
        )
        results = [self._doc_to_dict(entry) for entry in checkins]
        return sorted(results, key=lambda entry: (entry.get("scheduled_date", ""), entry.get("scheduled_time", ""), entry.get("id", 0)))

    def create_checkin(self, director_id: int, payload: CheckInCreateRequest, community_id: int) -> dict:
        checkin_id = self._next_id(self.CHECKINS_COLLECTION)
        checkin = {
            "id": checkin_id,
            "community_id": int(community_id),
            "director_id": director_id,
            "resident_id": payload.resident_id,
            "scheduled_date": payload.scheduled_date,
            "scheduled_time": payload.scheduled_time,
            "notes": payload.notes or "",
            "status": "scheduled",
        }
        self._collection(self.CHECKINS_COLLECTION).document(str(checkin_id)).set(checkin)
        return dict(checkin)

    def get_checkin(self, checkin_id: int) -> Optional[dict]:
        snapshot = self._collection(self.CHECKINS_COLLECTION).document(str(checkin_id)).get()
        if not snapshot.exists:
            return None
        return self._doc_to_dict(snapshot)

    def update_checkin(self, checkin_id: int, payload: CheckInUpdateRequest) -> Optional[dict]:
        ref = self._collection(self.CHECKINS_COLLECTION).document(str(checkin_id))
        snapshot = ref.get()
        if not snapshot.exists:
            return None
        existing = self._doc_to_dict(snapshot)
        update = {"status": payload.status}
        if payload.notes is not None:
            update["notes"] = payload.notes
        else:
            update["notes"] = existing.get("notes", "")
        ref.update(update)
        refreshed = ref.get()
        return self._doc_to_dict(refreshed)

    def delete_checkin(self, checkin_id: int) -> bool:
        ref = self._collection(self.CHECKINS_COLLECTION).document(str(checkin_id))
        snapshot = ref.get()
        if not snapshot.exists:
            return False
        ref.delete()
        return True

    def list_resident_notes(self, resident_id: int, director_id: int, community_id: int) -> list[dict]:
        notes = (
            self._collection(self.RESIDENT_NOTES_COLLECTION)
            .where("community_id", "==", int(community_id))
            .where("resident_id", "==", resident_id)
            .where("director_id", "==", director_id)
            .stream()
        )
        results = [self._doc_to_dict(entry) for entry in notes]
        return sorted(results, key=lambda entry: (entry.get("created_at", ""), entry.get("id", 0)), reverse=True)

    def create_resident_note(self, director_id: int, payload: ResidentNoteCreateRequest, community_id: int) -> dict:
        note_id = self._next_id(self.RESIDENT_NOTES_COLLECTION)
        note = {
            "id": note_id,
            "community_id": int(community_id),
            "director_id": director_id,
            "resident_id": payload.resident_id,
            "note": payload.note,
            # ISO-ish string so we can sort easily without extra client formatting.
            "created_at": self.firestore.SERVER_TIMESTAMP,
        }
        self._collection(self.RESIDENT_NOTES_COLLECTION).document(str(note_id)).set(note)
        # Resolve server timestamp.
        snapshot = self._collection(self.RESIDENT_NOTES_COLLECTION).document(str(note_id)).get()
        return self._doc_to_dict(snapshot)

    def list_fall_reports(self, director_id: int, community_id: int) -> list[dict]:
        reports = (
            self._collection(self.FALL_REPORTS_COLLECTION)
            .where("community_id", "==", int(community_id))
            .where("director_id", "==", director_id)
            .stream()
        )
        results = [self._doc_to_dict(entry) for entry in reports]
        # created_at may be a timestamp; sort by string conversion fallback.
        return sorted(
            results,
            key=lambda entry: (str(entry.get("incident_date", "")), str(entry.get("incident_time", "")), int(entry.get("id", 0))),
            reverse=True,
        )

    def create_fall_report(self, director_id: int, payload: FallReportCreateRequest, community_id: int) -> dict:
        report_id = self._next_id(self.FALL_REPORTS_COLLECTION)
        report = {
            "id": report_id,
            "community_id": int(community_id),
            "director_id": director_id,
            "resident_id": int(payload.resident_id) if payload.resident_id is not None else None,
            "incident_date": payload.incident_date,
            "incident_time": payload.incident_time,
            "location": payload.location,
            "witnessed": bool(payload.witnessed),
            "injuries": payload.injuries or "",
            "immediate_action": payload.immediate_action or "",
            "ems_called": bool(payload.ems_called),
            "family_notified": bool(payload.family_notified),
            "notes": payload.notes or "",
            "created_at": self.firestore.SERVER_TIMESTAMP,
        }
        self._collection(self.FALL_REPORTS_COLLECTION).document(str(report_id)).set(report)
        snapshot = self._collection(self.FALL_REPORTS_COLLECTION).document(str(report_id)).get()
        return self._doc_to_dict(snapshot)


@lru_cache
def get_store() -> AppStore:
    backend = os.getenv("HEALTHMATE_STORE", "sqlite").lower()
    if backend == "firebase":
        return FirestoreStore()
    return SQLiteStore()

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "healthmate.db"


def _dict_factory(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict:
    return {column[0]: row[index] for index, column in enumerate(cursor.description)}


@contextmanager
def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = _dict_factory
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('director', 'resident'))
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_date TEXT NOT NULL,
                event_time TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                image_url TEXT,
                created_by INTEGER NOT NULL,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS attendance (
                user_id INTEGER NOT NULL,
                event_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, event_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(event_id) REFERENCES events(id)
            );
            """
        )


def seed_db() -> None:
    with get_connection() as connection:
        existing_users = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()
        if existing_users["count"] == 0:
            connection.executemany(
                """
                INSERT INTO users (full_name, email, password, role)
                VALUES (?, ?, ?, ?)
                """,
                [
                    ("Grace Director", "director@healthmate.app", "password123", "director"),
                    ("Margaret Johnson", "margaret@healthmate.app", "password123", "resident"),
                    ("Arthur Miles", "arthur@healthmate.app", "password123", "resident"),
                    ("Helen Carter", "helen@healthmate.app", "password123", "resident"),
                ],
            )

        existing_events = connection.execute("SELECT COUNT(*) AS count FROM events").fetchone()
        if existing_events["count"] == 0:
            director_id = connection.execute(
                "SELECT id FROM users WHERE role = 'director' ORDER BY id LIMIT 1"
            ).fetchone()["id"]
            connection.executemany(
                """
                INSERT INTO events (event_date, event_time, name, description, image_url, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        "2026-04-22",
                        "09:00",
                        "Chair Yoga",
                        "A gentle movement class focused on stretching, breathing, and balance.",
                        "",
                        director_id,
                    ),
                    (
                        "2026-04-22",
                        "14:00",
                        "Garden Walk",
                        "A supervised outdoor walk through the community garden.",
                        "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=800&q=80",
                        director_id,
                    ),
                    (
                        "2026-04-24",
                        "11:30",
                        "Music Hour",
                        "Residents can sing along with familiar favorites and request songs.",
                        "",
                        director_id,
                    ),
                ],
            )

        existing_attendance = connection.execute(
            "SELECT COUNT(*) AS count FROM attendance"
        ).fetchone()
        if existing_attendance["count"] == 0:
            residents = connection.execute(
                "SELECT id FROM users WHERE role = 'resident' ORDER BY id"
            ).fetchall()
            events = connection.execute("SELECT id FROM events ORDER BY id").fetchall()
            if residents and events:
                connection.executemany(
                    "INSERT OR IGNORE INTO attendance (user_id, event_id) VALUES (?, ?)",
                    [
                        (residents[0]["id"], events[0]["id"]),
                        (residents[0]["id"], events[1]["id"]),
                        (residents[1]["id"], events[1]["id"]),
                    ],
                )

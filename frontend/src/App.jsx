import { useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";

import { auth, isFirebaseAuthConfigured } from "./firebase";
import { IoSettingsSharp } from "react-icons/io5";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const EXPERIENCE_COPY = {
  director: {
    eyebrow: "HealthMate Director",
    title: "Coordinate the community calendar with clarity.",
    description:
      "Set up the monthly activity schedule, add events for any day, and keep an eye on participation in one calm workspace.",
    dashboardEyebrow: "Director Workspace",
    dashboardTitle: "Community Schedule Manager",
    dashboardDescription: "Plan activities, manage residents, and monitor attendance across the month."
  },
  resident: {
    eyebrow: "HealthMate Resident",
    title: "A friendlier way to choose today’s activities.",
    description:
      "Residents can browse the calendar, open any day, and join multiple events with bigger visual cues and warmer colors.",
    dashboardEyebrow: "Resident Calendar",
    dashboardTitle: "My Activity Calendar",
    dashboardDescription: "Browse the month, see what is happening, and tap into any activities you want to join."
  }
};

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric"
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short"
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric"
});

const noteDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

function toDateInputValue(date) {
  return date.toISOString().split("T")[0];
}

function formatLongDate(dateString) {
  return longDateFormatter.format(new Date(`${dateString}T00:00:00`));
}

function formatIncidentDateTime(dateString, timeString) {
  if (!dateString || !timeString) {
    return "";
  }

  const normalizedTime = String(timeString).trim().slice(0, 5);
  const parsed = new Date(`${dateString}T${normalizedTime}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return `${dateString} ${normalizedTime}`;
  }
  return noteDateFormatter.format(parsed);
}

function formatNoteDate(value) {
  if (!value) {
    return "";
  }
  const raw = String(value).trim();
  if (!raw) {
    return "";
  }

  // Accept common server formats like:
  // - 2026-05-08T19:25:08.808000+00:00
  // - 2026-05-08 19:25:08.808000+00:00
  let normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  // JS Date parsing is inconsistent with microseconds; keep at most milliseconds.
  normalized = normalized.replace(/\.(\d{3})\d+/, ".$1");
  // Some backends may emit a space before the timezone.
  normalized = normalized.replace(/\s([+-]\d{2}:\d{2}|Z)$/, "$1");

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    // Fallback: if it looks like "YYYY-MM-DD HH:MM:SS", format just the first 16 chars.
    const compact = raw.replace("T", " ").replace(/\.\d+.*/, "");
    const match = compact.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (match) {
      const date = new Date(`${match[1]}T${match[2]}:00`);
      if (!Number.isNaN(date.getTime())) {
        return noteDateFormatter.format(date);
      }
      return `${match[1]} ${match[2]}`;
    }
    return raw;
  }
  return noteDateFormatter.format(parsed);
}

function buildMonthGrid(referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function isSameDay(left, right) {
  return left.toDateString() === right.toDateString();
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
  } catch (error) {
    // Network errors (backend down, wrong port, blocked by browser) surface as TypeError: Failed to fetch.
    const hint = `Could not reach the backend at ${API_BASE_URL}. Is the backend running?`;
    throw new Error(hint);
  }

  if (!response.ok) {
    let message = "Something went wrong.";
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function LandingScreen({ onChooseMode, onCreateUser }) {
  return (
    <div className="auth-shell auth-shell--landing">
      <section className="landing-card">
        <div className="landing-copy">
          <p className="eyebrow">HealthMate</p>
          <h1>Director Workspace</h1>
          <p className="lede">
            Sign in to manage the community schedule, residents, and one-on-one check-ins.
          </p>
        </div>

        <div className="landing-actions">
          <button type="button" className="portal-card portal-card--director" onClick={() => onChooseMode("director-login")}>
            <span className="portal-label">Director Login</span>
            <strong>Manage the community schedule</strong>
            <p>Create events, review attendance, and add residents.</p>
          </button>

          <button type="button" className="secondary-button secondary-button--wide" onClick={onCreateUser}>
            Create a New User
          </button>
        </div>
      </section>
    </div>
  );
}

function LoginScreen({ role, onLogin, onBack, onGoToCreateUser, loading, error }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const copy = EXPERIENCE_COPY[role];

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin(form, role);
  };

  return (
    <div className={`auth-shell auth-shell--${role}`}>
      <section className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="lede">{copy.description}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-header">
            <h2>{role === "director" ? "Director Sign In" : "Resident Sign In"}</h2>
            <p>Use the matching portal for the correct role.</p>
          </div>

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@healthmate.app"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="password"
              required
            />
          </label>

          {error ? <p className="error-banner">{error}</p> : null}

          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "Signing in..." : role === "director" ? "Enter Director Workspace" : "Enter My Calendar"}
          </button>

          <div className="auth-actions">
            <button type="button" className="secondary-button" onClick={onGoToCreateUser}>
              Create User
            </button>
            <button type="button" className="text-button" onClick={onBack}>
              Back
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CreateUserForm({
  embedded = false,
  defaultRole = "resident",
  onSubmit,
  onBack,
  loading,
  error,
  successMessage
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: defaultRole
  });

  useEffect(() => {
    setForm((current) => ({ ...current, role: defaultRole }));
  }, [defaultRole]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = { ...form };
    if (payload.role !== "director") {
      delete payload.password;
    }
    const created = await onSubmit(payload);
    if (created) {
      setForm({
        full_name: "",
        email: "",
        password: "",
        role: defaultRole
      });
    }
  };

  return (
    <section className={embedded ? "stack-form" : "auth-card auth-card--create"}>
      {!embedded ? (
        <div className="auth-copy auth-copy--create">
          <p className="eyebrow">Create User</p>
          <h1>Set up a new account</h1>
          <p className="lede">Create a director or resident account before signing in.</p>
        </div>
      ) : null}

      <form className={embedded ? "stack-form" : "auth-form"} onSubmit={handleSubmit}>
        <div className="auth-form-header">
          <h2>{embedded ? "Create User" : "New Account"}</h2>
          <p>{embedded ? "Add a resident or director without leaving the calendar." : "Choose the role and add the account details."}</p>
        </div>

        <label>
          Full Name
          <input
            type="text"
            value={form.full_name}
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            placeholder="Margaret Johnson"
            required
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="margaret@healthmate.app"
            required
          />
        </label>

        <label>
          Password
          {form.role === "director" ? (
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="At least 8 characters"
              required
            />
          ) : (
            <input type="text" value="Not required for residents" disabled />
          )}
        </label>

        <label>
          Role
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="resident">Resident</option>
            <option value="director">Director</option>
          </select>
        </label>

        {error ? <p className="error-banner">{error}</p> : null}
        {successMessage ? <p className="success-banner">{successMessage}</p> : null}

        <div className="auth-actions">
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? "Creating..." : "Create User"}
          </button>
          {!embedded ? (
            <button type="button" className="text-button" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function CreateUserScreen(props) {
  return (
    <div className="auth-shell auth-shell--create">
      <CreateUserForm {...props} />
    </div>
  );
}

function EventForm({ selectedDate, onCreate, loading }) {
  const [form, setForm] = useState({
    event_date: selectedDate,
    event_time: "09:00",
    name: "",
    description: "",
    image_url: ""
  });

  useEffect(() => {
    setForm((current) => ({ ...current, event_date: selectedDate }));
  }, [selectedDate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const created = await onCreate(form);
    if (created) {
      setForm({
        event_date: selectedDate,
        event_time: "09:00",
        name: "",
        description: "",
        image_url: ""
      });
    }
  };

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      <label>
        Date
        <input
          type="date"
          value={form.event_date}
          onChange={(event) => setForm({ ...form, event_date: event.target.value })}
          required
        />
      </label>

      <label>
        Time
        <input
          type="time"
          value={form.event_time}
          onChange={(event) => setForm({ ...form, event_time: event.target.value })}
          required
        />
      </label>

      <label>
        Event Name
        <input
          type="text"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          placeholder="Morning Stretch"
          required
        />
      </label>

      <label>
        Description
        <textarea
          rows="4"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          placeholder="Describe the activity and anything residents should know."
          required
        />
      </label>

      <label>
        Image URL (Optional)
        <input
          type="url"
          value={form.image_url}
          onChange={(event) => setForm({ ...form, image_url: event.target.value })}
          placeholder="https://example.com/photo.jpg"
        />
      </label>

      <button type="submit" className="primary-button" disabled={loading}>
        {loading ? "Saving..." : "Create Event"}
      </button>
    </form>
  );
}

function EventCard({ event, user, onToggleAttendance, attendanceLoading }) {
  return (
    <article className={`event-card ${event.attending ? "event-card--attending" : ""}`}>
      {event.image_url ? <img src={event.image_url} alt={event.name} className="event-image" /> : null}

      <div className="event-meta">
        <span className="event-time">{event.event_time}</span>
        <h4>{event.name}</h4>
        <p>{event.description}</p>
      </div>

      <div className="event-footer">
        <span className="attendance-pill">
          {event.participant_count} participant{event.participant_count !== 1 ? "s" : ""}
        </span>

        {user.role === "resident" ? (
          <button
            type="button"
            className={event.attending ? "secondary-button" : "primary-button"}
            onClick={() => onToggleAttendance(event)}
            disabled={attendanceLoading === event.id}
          >
            {attendanceLoading === event.id ? "Updating..." : event.attending ? "Cancel Attendance" : "Attend Event"}
          </button>
        ) : null}
      </div>

      {user.role === "director" ? (
        <div className="participants">
          <strong>Participants</strong>
          <ul>
            {event.participants.length === 0 ? (
              <li>No residents joined yet.</li>
            ) : (
              event.participants.map((participant) => <li key={participant.id}>{participant.full_name}</li>)
            )}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function DayPanel({ user, selectedDate, events, onCreateEvent, onToggleAttendance, createLoading, attendanceLoading }) {
  const [tab, setTab] = useState("events");
  const dayEvents = useMemo(
    () =>
      events
        .filter((event) => event.event_date === selectedDate)
        .sort((a, b) => a.event_time.localeCompare(b.event_time)),
    [events, selectedDate]
  );

  useEffect(() => {
    setTab("events");
  }, [selectedDate]);

  return (
    <div className="drawer-stack">
      <div className="drawer-header">
        <p className="eyebrow">Selected Day</p>
        <h2>{formatLongDate(selectedDate)}</h2>
        <p className="lede">
          {dayEvents.length === 0
            ? "No events are scheduled yet for this day."
            : `${dayEvents.length} event${dayEvents.length > 1 ? "s are" : " is"} scheduled for this day.`}
        </p>
      </div>

      <div className="drawer-tabs">
        <button
          type="button"
          className={`drawer-tab ${tab === "events" ? "drawer-tab--active" : ""}`}
          onClick={() => setTab("events")}
        >
          Events
        </button>
        {user.role === "director" ? (
          <button
            type="button"
            className={`drawer-tab ${tab === "add-event" ? "drawer-tab--active" : ""}`}
            onClick={() => setTab("add-event")}
          >
            Add Event
          </button>
        ) : null}
      </div>

      {tab === "events" ? (
        <div className="drawer-section">
          {dayEvents.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing planned yet</h3>
              <p>{user.role === "director" ? "Use the Add Event tab to schedule something for this day." : "Check another day on the calendar to browse activities."}</p>
            </div>
          ) : (
            <div className="event-list">
              {dayEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  user={user}
                  onToggleAttendance={onToggleAttendance}
                  attendanceLoading={attendanceLoading}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="drawer-section">
          <EventForm selectedDate={selectedDate} onCreate={onCreateEvent} loading={createLoading} />
        </div>
      )}
    </div>
  );
}

function ManageUsersPanel({ users, loading, onOpenResidentNotes }) {
  const directors = users.filter((entry) => entry.role === "director");
  const residents = users.filter((entry) => entry.role === "resident");

  return (
    <div className="drawer-stack">
      <div className="drawer-header">
        <p className="eyebrow">Manage Users</p>
        <h2>People in HealthMate</h2>
        <p className="lede">Review who can access the system and which role they have.</p>
      </div>

      {loading ? <p className="muted-copy">Loading users...</p> : null}

      <div className="user-groups">
        <section className="user-group-card">
          <h3>Directors</h3>
          <ul className="user-list">
            {directors.map((entry) => (
              <li key={entry.id} className="user-row">
                <strong>{entry.full_name}</strong>
                <span>{entry.email}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="user-group-card">
          <h3>Residents</h3>
          <ul className="user-list">
            {residents.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="user-row user-row--clickable"
                  onClick={() => onOpenResidentNotes?.(entry)}
                  aria-label={`Open notes for ${entry.full_name}`}
                  title="Open resident notes"
                >
                  <strong>{entry.full_name}</strong>
                  <span>{entry.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ResidentNotesModal({ resident, notes, loading, error, onClose, onSaveNote }) {
  const [draft, setDraft] = useState("");
  const maxNoteLength = 10000;

  useEffect(() => {
    setDraft("");
  }, [resident?.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!resident) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Resident notes">
      <div className="modal-surface">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Resident Notes</p>
            <h2>{resident.full_name}</h2>
            <p className="muted-copy">{resident.email}</p>
          </div>

          <button type="button" className="icon-button modal-close" onClick={onClose} aria-label="Close" title="Close">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <form
          className="stack-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!draft.trim()) {
              return;
            }
            const saved = await onSaveNote({ resident_id: resident.id, note: draft.trim() });
            if (saved) {
              setDraft("");
            }
          }}
        >
          <label>
            New Note
            <textarea
              rows={4}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a private note about this resident."
              maxLength={maxNoteLength}
            />
          </label>
          <p className="muted-copy muted-copy--right">
            {draft.length.toLocaleString()} / {maxNoteLength.toLocaleString()}
          </p>
          <div className="modal-actions">
            <button type="submit" className="primary-button" disabled={loading || !draft.trim()}>
              {loading ? "Saving..." : "Save Note"}
            </button>
            <button type="button" className="secondary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
        {loading ? <p className="muted-copy">Loading notes...</p> : null}

        {!loading && notes.length === 0 ? (
          <div className="empty-state">
            <h3>No notes yet</h3>
            <p>Start with a quick note above and you will see the history here.</p>
          </div>
        ) : null}

        {notes.length > 0 ? (
          <div className="event-list modal-notes-list">
            {notes.map((entry) => (
              <article key={entry.id} className="event-card">
                <div className="event-body">
                  <div className="event-time">
                    <strong>Note</strong>
                    <span className="muted-copy">{formatNoteDate(entry.created_at)}</span>
                  </div>
                  <p className="event-description">{entry.note}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close modal" />
    </div>
  );
}

function CheckInsPanel({
  residents,
  checkins,
  loading,
  error,
  onCreateCheckIn,
  onUpdateCheckIn,
  onDeleteCheckIn,
  notes,
  notesLoading,
  notesError,
  selectedResidentId,
  onSelectResidentForNotes,
  onCreateResidentNote
}) {
  const [tab, setTab] = useState("upcoming");
  const [form, setForm] = useState({
    resident_id: residents[0]?.id || "",
    scheduled_date: toDateInputValue(new Date()),
    scheduled_time: "10:00",
    notes: ""
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      resident_id: residents[0]?.id || ""
    }));
  }, [residents]);

  const todayString = useMemo(() => toDateInputValue(new Date()), []);

  const upcoming = useMemo(() => {
    return checkins.filter(
      (entry) => entry.status === "scheduled" && String(entry.scheduled_date) >= todayString
    );
  }, [checkins, todayString]);

  const previous = useMemo(() => {
    return checkins
      .filter((entry) => entry.status !== "scheduled" || String(entry.scheduled_date) < todayString)
      .sort((a, b) => {
        const dateCompare = String(b.scheduled_date).localeCompare(String(a.scheduled_date));
        if (dateCompare !== 0) return dateCompare;
        return String(b.scheduled_time).localeCompare(String(a.scheduled_time));
      });
  }, [checkins, todayString]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const created = await onCreateCheckIn({
        resident_id: Number(form.resident_id),
        scheduled_date: form.scheduled_date,
        scheduled_time: form.scheduled_time,
        notes: form.notes
      });
      if (created) {
        setForm((current) => ({
          ...current,
          scheduled_time: current.scheduled_time,
          notes: ""
        }));
        setTab("upcoming");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="drawer-stack">
      <div className="drawer-header">
        <p className="eyebrow">1:1 Check-ins</p>
        <h2>Schedule resident check-ins</h2>
        <p className="lede">Plan one-on-one time with residents and track follow-ups.</p>
      </div>

      <div className="drawer-tabs">
        <button
          type="button"
          className={`drawer-tab ${tab === "upcoming" ? "drawer-tab--active" : ""}`}
          onClick={() => setTab("upcoming")}
        >
          Upcoming
        </button>
        <button
          type="button"
          className={`drawer-tab ${tab === "previous" ? "drawer-tab--active" : ""}`}
          onClick={() => setTab("previous")}
        >
          Previous
        </button>
        <button
          type="button"
          className={`drawer-tab ${tab === "schedule" ? "drawer-tab--active" : ""}`}
          onClick={() => setTab("schedule")}
        >
          Schedule
        </button>
        <button
          type="button"
          className={`drawer-tab ${tab === "notes" ? "drawer-tab--active" : ""}`}
          onClick={() => {
            setTab("notes");
            const nextResidentId = selectedResidentId || residents[0]?.id || "";
            if (nextResidentId) {
              onSelectResidentForNotes(Number(nextResidentId));
            }
          }}
        >
          Resident Notes
        </button>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {loading ? <p className="muted-copy">Loading check-ins...</p> : null}

      {tab === "upcoming" ? (
        <div className="drawer-section">
          {upcoming.length === 0 ? (
            <div className="empty-state">
              <h3>No check-ins scheduled yet</h3>
              <p>Use the Schedule tab to plan your first one-on-one.</p>
            </div>
          ) : (
            <div className="event-list">
              {upcoming.map((entry) => (
                <article key={entry.id} className="event-card">
                  <div className="event-body">
                    <div className="event-time">
                      <strong>
                        {entry.scheduled_date} at {entry.scheduled_time}
                      </strong>
                      <span className="muted-copy">{entry.resident.full_name}</span>
                    </div>
                    {entry.notes ? <p className="event-description">{entry.notes}</p> : null}
                  </div>
                  <div className="event-footer">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onUpdateCheckIn(entry, { status: "completed" })}
                    >
                      Mark Completed
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onUpdateCheckIn(entry, { status: "canceled" })}
                    >
                      Cancel
                    </button>
                    <button type="button" className="text-button" onClick={() => onDeleteCheckIn(entry)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : tab === "previous" ? (
        <div className="drawer-section">
          {previous.length === 0 ? (
            <div className="empty-state">
              <h3>No previous check-ins yet</h3>
              <p>Completed and canceled check-ins will show up here.</p>
            </div>
          ) : (
            <div className="event-list">
              {previous.map((entry) => (
                <article key={entry.id} className="event-card">
                  <div className="event-body">
                    <div className="event-time">
                      <strong>
                        {entry.scheduled_date} at {entry.scheduled_time}
                      </strong>
                      <span className="muted-copy">
                        {entry.resident.full_name} · {entry.status}
                      </span>
                    </div>
                    {entry.notes ? <p className="event-description">{entry.notes}</p> : null}
                  </div>
                  <div className="event-footer">
                    {entry.status !== "scheduled" ? null : (
                      <>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onUpdateCheckIn(entry, { status: "completed" })}
                        >
                          Mark Completed
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onUpdateCheckIn(entry, { status: "canceled" })}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button type="button" className="text-button" onClick={() => onDeleteCheckIn(entry)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : tab === "notes" ? (
        <div className="drawer-section">
          {residents.length === 0 ? (
            <div className="empty-state">
              <h3>No residents yet</h3>
              <p>Create residents first so you can store personal notes.</p>
            </div>
          ) : (
            <div className="drawer-stack">
              <label>
                Resident
                <select
                  value={selectedResidentId || residents[0]?.id || ""}
                  onChange={(event) => onSelectResidentForNotes(Number(event.target.value))}
                >
                  {residents.map((resident) => (
                    <option key={resident.id} value={resident.id}>
                      {resident.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <form
                className="stack-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const residentId = Number(selectedResidentId || residents[0]?.id || 0);
                  if (!residentId || !noteDraft.trim()) {
                    return;
                  }
                  const created = await onCreateResidentNote({ resident_id: residentId, note: noteDraft.trim() });
                  if (created) {
                    setNoteDraft("");
                  }
                }}
              >
                <label>
                  New Note
                  <textarea
                    rows={4}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Add a private note about this resident."
                  />
                </label>
                <button type="submit" className="primary-button" disabled={notesLoading || !noteDraft.trim()}>
                  {notesLoading ? "Saving..." : "Save Note"}
                </button>
              </form>

              {notesError ? <p className="error-banner">{notesError}</p> : null}
              {notesLoading ? <p className="muted-copy">Loading notes...</p> : null}

              {!notesLoading && notes.length === 0 ? (
                <div className="empty-state">
                  <h3>No notes yet for this resident</h3>
                  <p>Add the first note above to start keeping a private record.</p>
                </div>
              ) : null}

              {notes.length > 0 ? (
                <div className="event-list">
                  {notes.map((entry) => (
                    <article key={entry.id} className="event-card">
                      <div className="event-body">
                        <div className="event-time">
                          <strong>Note</strong>
                          <span className="muted-copy">{formatNoteDate(entry.created_at)}</span>
                        </div>
                        <p className="event-description">{entry.note}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="drawer-section">
          {residents.length === 0 ? (
            <div className="empty-state">
              <h3>No residents yet</h3>
              <p>Create residents first so you can schedule check-ins.</p>
            </div>
          ) : (
            <form className="stack-form" onSubmit={handleSubmit}>
              <label>
                Resident
                <select
                  value={form.resident_id}
                  onChange={(event) => setForm((current) => ({ ...current, resident_id: event.target.value }))}
                >
                  {residents.map((resident) => (
                    <option key={resident.id} value={resident.id}>
                      {resident.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Date
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(event) => setForm((current) => ({ ...current, scheduled_date: event.target.value }))}
                  required
                />
              </label>

              <label>
                Time
                <input
                  type="time"
                  value={form.scheduled_time}
                  onChange={(event) => setForm((current) => ({ ...current, scheduled_time: event.target.value }))}
                  required
                />
              </label>

              <label>
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional notes for the check-in."
                />
              </label>

              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? "Scheduling..." : "Schedule Check-in"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function FallReportsPanel({ residents, reports, loading, error, onCreateReport }) {
  const [tab, setTab] = useState("new");
  const [submitting, setSubmitting] = useState(false);
  const residentsListId = "fall-report-residents";
  const [form, setForm] = useState(() => {
    const now = new Date();
    return {
      resident_id: "",
      resident_label: "",
      incident_date: toDateInputValue(now),
      incident_time: now.toTimeString().slice(0, 5),
      location: "",
      witnessed: false,
      injuries: "",
      immediate_action: "",
      ems_called: false,
      family_notified: false,
      notes: ""
    };
  });

  const optionLabelForResident = (resident) => `${resident.full_name} (${resident.email})`;
  const residentLabelById = useMemo(() => {
    const map = new Map();
    (residents || []).forEach((resident) => {
      map.set(String(resident.id), optionLabelForResident(resident));
    });
    return map;
  }, [residents]);

  useEffect(() => {
    if (!residents?.length) {
      return;
    }
    setForm((current) =>
      current.resident_id ? current : { ...current, resident_id: String(residents[0]?.id || "") }
    );
  }, [residents]);

  useEffect(() => {
    if (!residents?.length) {
      return;
    }
    setForm((current) => {
      if (!current.resident_id) {
        return current;
      }
      const resident = residents.find((entry) => String(entry.id) === String(current.resident_id));
      if (!resident) {
        return current;
      }
      const nextLabel = optionLabelForResident(resident);
      return current.resident_label === nextLabel ? current : { ...current, resident_label: nextLabel };
    });
  }, [residents]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const created = await onCreateReport({
        resident_id: form.resident_id ? Number(form.resident_id) : null,
        incident_date: form.incident_date,
        incident_time: form.incident_time,
        location: form.location,
        witnessed: form.witnessed,
        injuries: form.injuries,
        immediate_action: form.immediate_action,
        ems_called: form.ems_called,
        family_notified: form.family_notified,
        notes: form.notes
      });
      if (created) {
        setForm((current) => ({
          ...current,
          location: "",
          witnessed: false,
          injuries: "",
          immediate_action: "",
          ems_called: false,
          family_notified: false,
          notes: ""
        }));
        setTab("history");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="drawer-stack">
      <div className="drawer-header">
        <p className="eyebrow">Incident Reports</p>
        <h2>Fall report</h2>
        <p className="lede">Document a fall, record the immediate response, and keep a searchable history.</p>
      </div>

      <div className="drawer-tabs">
        <button
          type="button"
          className={`drawer-tab ${tab === "new" ? "drawer-tab--active" : ""}`}
          onClick={() => setTab("new")}
        >
          New Report
        </button>
        <button
          type="button"
          className={`drawer-tab ${tab === "history" ? "drawer-tab--active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {loading ? <p className="muted-copy">Loading reports...</p> : null}

      {tab === "new" ? (
        <div className="drawer-section">
          <form className="stack-form" onSubmit={handleSubmit}>
            <label>
              Resident (Optional)
              <input
                type="text"
                list={residentsListId}
                value={form.resident_label}
                onChange={(event) => {
                  const nextLabel = event.target.value;
                  const match = residents.find((entry) => optionLabelForResident(entry) === nextLabel);
                  setForm((current) => ({
                    ...current,
                    resident_label: nextLabel,
                    resident_id: match ? String(match.id) : ""
                  }));
                }}
                placeholder={residents.length ? "Start typing a resident name..." : "No residents available"}
                autoComplete="off"
              />
              <datalist id={residentsListId}>
                {residents.map((resident) => (
                  <option key={resident.id} value={optionLabelForResident(resident)} />
                ))}
              </datalist>
              <p className="muted-copy" style={{ marginTop: 6 }}>
                Leave blank if the report is not tied to a specific resident.
              </p>
            </label>

            <label>
              Incident Date
              <input
                type="date"
                value={form.incident_date}
                onChange={(event) => setForm((current) => ({ ...current, incident_date: event.target.value }))}
                required
              />
            </label>

            <label>
              Incident Time
              <input
                type="time"
                value={form.incident_time}
                onChange={(event) => setForm((current) => ({ ...current, incident_time: event.target.value }))}
                required
              />
            </label>

            <label>
              Location
              <input
                type="text"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                placeholder="Dining room, hallway, resident room..."
                required
              />
            </label>

            <div className="form-row form-row--checks">
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.witnessed}
                  onChange={(event) => setForm((current) => ({ ...current, witnessed: event.target.checked }))}
                />
                Witnessed
              </label>

              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.ems_called}
                  onChange={(event) => setForm((current) => ({ ...current, ems_called: event.target.checked }))}
                />
                EMS called
              </label>

              <label className="checkline">
                <input
                  type="checkbox"
                  checked={form.family_notified}
                  onChange={(event) => setForm((current) => ({ ...current, family_notified: event.target.checked }))}
                />
                Family notified
              </label>
            </div>

            <label>
              Injuries (Optional)
              <textarea
                rows="3"
                value={form.injuries}
                onChange={(event) => setForm((current) => ({ ...current, injuries: event.target.value }))}
                placeholder="Visible bruising, complaints of pain..."
              />
            </label>

            <label>
              Immediate Action (Optional)
              <textarea
                rows="3"
                value={form.immediate_action}
                onChange={(event) => setForm((current) => ({ ...current, immediate_action: event.target.value }))}
                placeholder="Assisted back to chair, vital signs taken..."
              />
            </label>

            <label>
              Notes (Optional)
              <textarea
                rows="4"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Additional context that will help with follow-up."
              />
            </label>

            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Saving..." : "Save Report"}
            </button>
          </form>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="drawer-section">
          {!loading && reports.length === 0 ? (
            <div className="empty-state">
              <h3>No reports yet</h3>
              <p>When you save a fall report, it will appear here for quick reference.</p>
            </div>
          ) : null}

          {reports.length > 0 ? (
            <div className="event-list">
              {reports.map((report) => (
                <article key={report.id} className="event-card">
                  <div className="event-body">
                    <div className="event-time">
                      <strong>Fall</strong>
                      <span className="muted-copy">
                        {formatIncidentDateTime(report.incident_date, report.incident_time)}
                      </span>
                    </div>
                    <h4 className="event-title">{report.location}</h4>
                    <p className="event-description">
                      {report.resident_id
                        ? `Resident: ${residentLabelById.get(String(report.resident_id)) || `#${report.resident_id}`}.`
                        : "Resident not specified."}{" "}
                      {report.witnessed ? "Witnessed." : "Unwitnessed."} {report.ems_called ? "EMS called." : "EMS not called."}{" "}
                      {report.family_notified ? "Family notified." : "Family not notified."}
                    </p>
                    {report.injuries ? (
                      <p className="event-description">
                        <strong>Injuries:</strong> {report.injuries}
                      </p>
                    ) : null}
                    {report.immediate_action ? (
                      <p className="event-description">
                        <strong>Immediate action:</strong> {report.immediate_action}
                      </p>
                    ) : null}
                    {report.notes ? (
                      <p className="event-description">
                        <strong>Notes:</strong> {report.notes}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SettingsPanel({ user, onUpdateProfile }) {
  const [fullName, setFullName] = useState(user.full_name || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setFullName(user.full_name || "");
    setEditing(false);
    setError("");
    setSuccess("");
  }, [user.id, user.full_name]);

  return (
    <div className="drawer-stack">
      <div className="drawer-header">
        <p className="eyebrow">Settings</p>
        <h2>Profile</h2>
        <p className="lede">Update your name for the director workspace.</p>
      </div>

      {!editing ? (
        <div className="setting-card">
          <strong>Display name</strong>
          <span>{user.full_name}</span>
          <button
            type="button"
            className="secondary-button secondary-button--compact"
            onClick={() => {
              setError("");
              setSuccess("");
              setFullName(user.full_name || "");
              setEditing(true);
            }}
          >
            Edit
          </button>
        </div>
      ) : (
        <form
          className="stack-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setSuccess("");
            const nextName = fullName.trim();
            if (nextName.length < 2) {
              setError("Name must be at least 2 characters.");
              return;
            }
            setSaving(true);
            try {
              await onUpdateProfile({ full_name: nextName });
              setSuccess("Profile updated.");
              setEditing(false);
            } catch (err) {
              setError(err?.message || "Unable to update profile.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Display name
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Grace Director"
              required
              autoFocus
            />
          </label>

          {error ? <p className="error-banner">{error}</p> : null}
          {success ? <p className="success-banner">{success}</p> : null}

          <div className="auth-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setError("");
                setSuccess("");
                setFullName(user.full_name || "");
                setEditing(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="settings-list">
        <div className="setting-card">
          <strong>Email</strong>
          <span>{user.email}</span>
        </div>
        <div className="setting-card">
          <strong>Role</strong>
          <span>{user.role}</span>
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({ currentMonth, selectedDate, events, onSelectDate, onPreviousMonth, onNextMonth }) {
  const today = new Date();
  const days = buildMonthGrid(currentMonth);
  const selected = new Date(`${selectedDate}T00:00:00`);

  return (
    <section className="calendar-board">
      <div className="calendar-nav calendar-nav--top">
        <button
          type="button"
          className="icon-button"
          onClick={onPreviousMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onNextMonth}
          aria-label="Next month"
          title="Next month"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div className="calendar-board__header">
        <div>
          <h2>{monthFormatter.format(currentMonth)}</h2>
          <p>The full month is the main canvas. Click any day to open its detail view.</p>
        </div>
      </div>

      <div className="weekdays">
        {Array.from({ length: 7 }, (_, index) => {
          const date = new Date(2026, 3, 19 + index);
          return <span key={index}>{weekdayFormatter.format(date)}</span>;
        })}
      </div>

      <div className="calendar-grid calendar-grid--large">
        {days.map((day) => {
          const dayString = toDateInputValue(day);
          const dayEvents = events.filter((event) => event.event_date === dayString);
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selected);

          return (
            <button
              key={dayString}
              type="button"
              onClick={() => onSelectDate(dayString)}
              className={`calendar-day calendar-day--large ${isCurrentMonth ? "" : "calendar-day--muted"} ${
                isToday ? "calendar-day--today" : ""
              } ${isSelected ? "calendar-day--selected" : ""}`}
            >
              <div className="calendar-day-topline">
                <span className="calendar-day-number">{day.getDate()}</span>
                {dayEvents.length > 0 ? <span className="calendar-dot" /> : null}
              </div>

              <div className="calendar-day-preview">
                {dayEvents.slice(0, 2).map((event) => (
                  <span key={event.id} className={`calendar-preview-pill ${event.attending ? "calendar-preview-pill--attending" : ""}`}>
                    {event.event_time} {event.name}
                  </span>
                ))}
                {dayEvents.length > 2 ? <span className="calendar-more">+{dayEvents.length - 2} more</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="calendar-nav calendar-nav--bottom">
        <button
          type="button"
          className="icon-button"
          onClick={onPreviousMonth}
          aria-label="Previous month"
          title="Previous month"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onNextMonth}
          aria-label="Next month"
          title="Next month"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  );
}

function Dashboard({
  user,
  events,
  users,
  usersLoading,
  checkins,
  checkinsLoading,
  checkinsError,
  fallReports,
  fallReportsLoading,
  fallReportsError,
  notes,
  notesLoading,
  notesError,
  selectedResidentId,
  residentNotesModalOpen,
  residentNotesModalResident,
  createUserError,
  createUserSuccess,
  onLogout,
  onOpenManageUsers,
  onOpenCreateUser,
  onOpenSettings,
  onUpdateProfile,
  onCreateEvent,
  onCreateUser,
  onToggleAttendance,
  onCreateCheckIn,
  onUpdateCheckIn,
  onDeleteCheckIn,
  onSelectResidentForNotes,
  onCreateResidentNote,
  onCreateFallReport,
  onOpenResidentNotesModal,
  onCloseResidentNotesModal,
  createLoading,
  userCreateLoading,
  attendanceLoading,
  apiError
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));
  const [drawerView, setDrawerView] = useState("day");
  const copy = EXPERIENCE_COPY[user.role];

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const openDayDrawer = (date) => {
    setSelectedDate(date);
    setDrawerView("day");
  };

  return (
    <div className={`app-shell app-shell--${user.role}`}>
      <header className="topbar topbar--calendar">
        <div>
          <p className="eyebrow">{copy.dashboardEyebrow}</p>
          <h1>{copy.dashboardTitle}</h1>
          <p className="lede">
            Signed in as {user.full_name}.
            <br />
            Role: <strong>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</strong>.
            <br />
            {copy.dashboardDescription}
          </p>
        </div>

        <div className="topbar-actions topbar-actions--stacked">
          <div className="topbar-utility">
            <button
              type="button"
              className="secondary-button secondary-button--compact icon-button"
              onClick={() => {
                onOpenSettings();
                setDrawerView("settings");
              }}
              aria-label="Settings"
              title="Settings"
            >
              <IoSettingsSharp aria-hidden="true" focusable="false" />
            </button>
            <button
              type="button"
              className="secondary-button secondary-button--compact"
              onClick={onLogout}
            >
              Log Out
            </button>
          </div>
          <nav className="navbar-actions">
            <button type="button" className="secondary-button" onClick={() => setDrawerView("day")}>
              Day View
            </button>
            {user.role === "director" ? (
              <>
                <button type="button" className="secondary-button" onClick={() => setDrawerView("checkins")}>
                  1:1 Check-ins
                </button>
                <button type="button" className="secondary-button" onClick={() => setDrawerView("fall-reports")}>
                  Fall Reports
                </button>
                <button type="button" className="secondary-button" onClick={() => {
                  onOpenManageUsers();
                  setDrawerView("manage-users");
                }}>
                  Manage Users
                </button>
                <button type="button" className="secondary-button" onClick={() => {
                  onOpenCreateUser();
                  setDrawerView("create-user");
                }}>
                  Create User
                </button>
              </>
            ) : null}
          </nav>
        </div>
      </header>

      {apiError ? <p className="error-banner error-banner--page">{apiError}</p> : null}

      <main className="calendar-layout">
        <CalendarGrid
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          events={events}
          onSelectDate={openDayDrawer}
          onPreviousMonth={previousMonth}
          onNextMonth={nextMonth}
        />

        <aside className="side-drawer">
          {drawerView === "day" ? (
            <DayPanel
              user={user}
              selectedDate={selectedDate}
              events={events}
              onCreateEvent={onCreateEvent}
              onToggleAttendance={onToggleAttendance}
              createLoading={createLoading}
              attendanceLoading={attendanceLoading}
            />
          ) : null}

          {drawerView === "manage-users" && user.role === "director" ? (
            <ManageUsersPanel users={users} loading={usersLoading} onOpenResidentNotes={onOpenResidentNotesModal} />
          ) : null}

          {drawerView === "checkins" && user.role === "director" ? (
            <CheckInsPanel
              residents={users.filter((entry) => entry.role === "resident")}
              checkins={checkins}
              loading={checkinsLoading}
              error={checkinsError}
              onCreateCheckIn={onCreateCheckIn}
              onUpdateCheckIn={onUpdateCheckIn}
              onDeleteCheckIn={onDeleteCheckIn}
              notes={notes}
              notesLoading={notesLoading}
              notesError={notesError}
              selectedResidentId={selectedResidentId}
              onSelectResidentForNotes={onSelectResidentForNotes}
              onCreateResidentNote={onCreateResidentNote}
            />
          ) : null}

          {drawerView === "fall-reports" && user.role === "director" ? (
            <FallReportsPanel
              residents={users.filter((entry) => entry.role === "resident")}
              reports={fallReports}
              loading={fallReportsLoading}
              error={fallReportsError}
              onCreateReport={onCreateFallReport}
            />
          ) : null}

          {drawerView === "create-user" && user.role === "director" ? (
            <div className="drawer-stack">
              <div className="drawer-header">
                <p className="eyebrow">Create User</p>
                <h2>Add a new person</h2>
                <p className="lede">Create a resident or another director from the top navigation.</p>
              </div>
              <CreateUserForm
                embedded
                defaultRole="resident"
                onSubmit={onCreateUser}
                loading={userCreateLoading}
                error={createUserError}
                successMessage={createUserSuccess}
              />
            </div>
          ) : null}

          {drawerView === "settings" ? <SettingsPanel user={user} onUpdateProfile={onUpdateProfile} /> : null}
        </aside>
      </main>

      {residentNotesModalOpen ? (
        <ResidentNotesModal
          resident={residentNotesModalResident}
          notes={notes}
          loading={notesLoading}
          error={notesError}
          onClose={onCloseResidentNotesModal}
          onSaveNote={onCreateResidentNote}
        />
      ) : null}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [checkinsLoading, setCheckinsLoading] = useState(false);
  const [checkinsError, setCheckinsError] = useState("");
  const [fallReports, setFallReports] = useState([]);
  const [fallReportsLoading, setFallReportsLoading] = useState(false);
  const [fallReportsError, setFallReportsError] = useState("");
  const [selectedResidentId, setSelectedResidentId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [residentNotesModalOpen, setResidentNotesModalOpen] = useState(false);
  const [residentNotesModalResident, setResidentNotesModalResident] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [userCreateLoading, setUserCreateLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(null);
  const [authError, setAuthError] = useState("");
  const [apiError, setApiError] = useState("");
  const [createUserError, setCreateUserError] = useState("");
  const [createUserSuccess, setCreateUserSuccess] = useState("");

  useEffect(() => {
    // This app doesn't use URL routing; normalize any stray paths (like `/1`) back to `/`.
    if (typeof window !== "undefined" && window.location?.pathname && window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const fetchEvents = async (currentUser) => {
    const data = await apiRequest(`/events?viewer_id=${currentUser.id}`);
    setEvents(data);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      if (!user) {
        setUsers([]);
        return;
      }
      const data = await apiRequest(`/users?director_id=${user.id}`);
      setUsers(data);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchCheckIns = async (currentUser) => {
    if (!currentUser || currentUser.role !== "director") {
      setCheckins([]);
      return;
    }

    setCheckinsLoading(true);
    setCheckinsError("");
    try {
      const data = await apiRequest(`/checkins?director_id=${currentUser.id}`);
      setCheckins(data);
    } catch (error) {
      setCheckinsError(error.message);
    } finally {
      setCheckinsLoading(false);
    }
  };

  const fetchFallReports = async (currentUser) => {
    if (!currentUser || currentUser.role !== "director") {
      setFallReports([]);
      return;
    }

    setFallReportsLoading(true);
    setFallReportsError("");
    try {
      const data = await apiRequest(`/fall-reports?director_id=${currentUser.id}`);
      setFallReports(data);
    } catch (error) {
      setFallReportsError(error.message);
    } finally {
      setFallReportsLoading(false);
    }
  };

  const fetchResidentNotes = async (currentUser, residentId) => {
    if (!currentUser || currentUser.role !== "director" || !residentId) {
      setNotes([]);
      return;
    }

    setNotesLoading(true);
    setNotesError("");
    try {
      const data = await apiRequest(
        `/resident-notes?resident_id=${residentId}&director_id=${currentUser.id}`
      );
      setNotes(data);
    } catch (error) {
      setNotesError(error.message);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleOpenResidentNotesModal = async (resident) => {
    if (!resident) {
      return;
    }
    setResidentNotesModalResident(resident);
    setResidentNotesModalOpen(true);
    setSelectedResidentId(resident.id);
    await fetchResidentNotes(user, resident.id);
  };

  const handleCloseResidentNotesModal = () => {
    setResidentNotesModalOpen(false);
  };

  const handleLogin = async (credentials, expectedRole) => {
    setAuthLoading(true);
    setAuthError("");

    try {
      let currentUser;

      if (isFirebaseAuthConfigured) {
        let firebaseSession;
        try {
          firebaseSession = await signInWithEmailAndPassword(
            auth,
            credentials.email,
            credentials.password
          );
        } catch (error) {
          const code = error?.code || "";
          const message = error?.message || "";

          if (code.includes("api-key-not-valid") || code.includes("invalid-api-key") || message.includes("api-key")) {
            throw new Error(
              "Firebase Auth is misconfigured (invalid API key). Update frontend/.env with the Web app config values from Firebase Console, then restart `npm run dev`."
            );
          }

          throw error;
        }
        const idToken = await firebaseSession.user.getIdToken();

        currentUser = await apiRequest("/auth/firebase-login", {
          method: "POST",
          body: JSON.stringify({ id_token: idToken })
        });
      } else {
        currentUser = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify(credentials)
        });
      }

      if (currentUser.role !== expectedRole) {
        throw new Error(
          expectedRole === "director"
            ? "This account is not a director account. Please use the resident login page instead."
            : "This account is not a resident account. Please use the director login page instead."
        );
      }

      setUser(currentUser);
      setCreateUserSuccess("");
      await fetchEvents(currentUser);
      if (currentUser.role === "director") {
        await fetchUsers();
        await fetchCheckIns(currentUser);
        await fetchFallReports(currentUser);
      }
    } catch (error) {
      if (isFirebaseAuthConfigured) {
        await signOut(auth);
      }
      setAuthError(error?.message || "Sign in failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateEvent = async (payload) => {
    if (!user) {
      return false;
    }

    setCreateLoading(true);
    setApiError("");

    try {
      await apiRequest(`/events?director_id=${user.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await fetchEvents(user);
      return true;
    } catch (error) {
      setApiError(error.message);
      return false;
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateUser = async (payload) => {
    setUserCreateLoading(true);
    setCreateUserError("");
    setCreateUserSuccess("");
    setApiError("");

    try {
      if (!user) {
        throw new Error("Please sign in as a director first.");
      }
      const createdUser = await apiRequest(`/users?director_id=${user.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const successMessage = `${createdUser.full_name} was created successfully.`;
      setCreateUserSuccess(successMessage);
      if (user?.role === "director") {
        await fetchUsers();
        await fetchCheckIns(user);
        await fetchFallReports(user);
      }
      return true;
    } catch (error) {
      if (user) {
        setCreateUserError(error.message);
        setApiError(error.message);
      } else {
        setCreateUserError(error.message);
      }
      return false;
    } finally {
      setUserCreateLoading(false);
    }
  };

  const handleCreateCheckIn = async (payload) => {
    if (!user || user.role !== "director") {
      return false;
    }

    setApiError("");
    setCheckinsError("");
    try {
      await apiRequest(`/checkins?director_id=${user.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await fetchCheckIns(user);
      return true;
    } catch (error) {
      setCheckinsError(error.message);
      setApiError(error.message);
      return false;
    }
  };

  const handleCreateFallReport = async (payload) => {
    if (!user || user.role !== "director") {
      return false;
    }

    setApiError("");
    setFallReportsError("");
    try {
      await apiRequest(`/fall-reports?director_id=${user.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await fetchFallReports(user);
      return true;
    } catch (error) {
      setFallReportsError(error.message);
      setApiError(error.message);
      return false;
    }
  };

  const handleSelectResidentForNotes = async (residentId) => {
    setSelectedResidentId(residentId);
    setNotes([]);
    setNotesError("");
    if (residentId && user?.role === "director") {
      await fetchResidentNotes(user, residentId);
    }
  };

  const handleCreateResidentNote = async (payload) => {
    if (!user || user.role !== "director") {
      return false;
    }

    setApiError("");
    setNotesError("");
    try {
      await apiRequest(`/resident-notes?director_id=${user.id}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await fetchResidentNotes(user, payload.resident_id);
      return true;
    } catch (error) {
      setNotesError(error.message);
      setApiError(error.message);
      return false;
    }
  };

  const handleUpdateCheckIn = async (entry, patch) => {
    if (!user || user.role !== "director") {
      return;
    }

    setApiError("");
    setCheckinsError("");
    try {
      await apiRequest(`/checkins/${entry.id}?director_id=${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: patch.status })
      });
      await fetchCheckIns(user);
    } catch (error) {
      setCheckinsError(error.message);
      setApiError(error.message);
    }
  };

  const handleDeleteCheckIn = async (entry) => {
    if (!user || user.role !== "director") {
      return;
    }

    setApiError("");
    setCheckinsError("");
    try {
      await apiRequest(`/checkins/${entry.id}?director_id=${user.id}`, {
        method: "DELETE"
      });
      await fetchCheckIns(user);
    } catch (error) {
      setCheckinsError(error.message);
      setApiError(error.message);
    }
  };

  const handleToggleAttendance = async (event) => {
    if (!user) {
      return;
    }

    setAttendanceLoading(event.id);
    setApiError("");

    try {
      await apiRequest(`/events/${event.id}/attend`, {
        method: event.attending ? "DELETE" : "POST",
        body: JSON.stringify({ user_id: user.id })
      });
      await fetchEvents(user);
    } catch (error) {
      setApiError(error.message);
    } finally {
      setAttendanceLoading(null);
    }
  };

  const handleUpdateProfile = async (payload) => {
    if (!user || user.role !== "director") {
      throw new Error("Please sign in as a director first.");
    }

    const updated = await apiRequest(`/users/${user.id}?director_id=${user.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    setUser(updated);
    // Refresh lists where the director's name may appear.
    await fetchUsers();
    await fetchCheckIns(updated);
    await fetchFallReports(updated);
    return updated;
  };

  const handleLogout = async () => {
    if (isFirebaseAuthConfigured) {
      await signOut(auth);
    }
    setUser(null);
    setEvents([]);
    setUsers([]);
    setCheckins([]);
    setCheckinsLoading(false);
    setCheckinsError("");
    setFallReports([]);
    setFallReportsLoading(false);
    setFallReportsError("");
    setSelectedResidentId(null);
    setNotes([]);
    setNotesLoading(false);
    setNotesError("");
    setResidentNotesModalOpen(false);
    setResidentNotesModalResident(null);
    setAuthError("");
    setApiError("");
    setCreateUserError("");
    setCreateUserSuccess("");
    setScreen("landing");
  };

  if (!user) {
    if (screen === "director-login") {
      return (
        <LoginScreen
          role="director"
          onLogin={handleLogin}
          onBack={() => {
            setAuthError("");
            setScreen("landing");
          }}
          onGoToCreateUser={() => {
            setAuthError("");
            setScreen("create-user");
          }}
          loading={authLoading}
          error={authError}
        />
      );
    }

    if (screen === "resident-login") {
      // Web portal is director-only; residents use the mobile app.
      setScreen("landing");
      return null;
    }

    if (screen === "create-user") {
      return (
        <CreateUserScreen
          defaultRole="resident"
          onSubmit={handleCreateUser}
          onBack={() => {
            setCreateUserError("");
            setCreateUserSuccess("");
            setScreen("landing");
          }}
          loading={userCreateLoading}
          error={createUserError}
          successMessage={createUserSuccess}
        />
      );
    }

    return (
      <LandingScreen
        onChooseMode={(nextScreen) => {
          setAuthError("");
          setCreateUserError("");
          setCreateUserSuccess("");
          setScreen(nextScreen);
        }}
        onCreateUser={() => {
          setAuthError("");
          setCreateUserError("");
          setCreateUserSuccess("");
          setScreen("create-user");
        }}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      events={events}
      users={users}
      usersLoading={usersLoading}
      checkins={checkins}
      checkinsLoading={checkinsLoading}
      checkinsError={checkinsError}
      fallReports={fallReports}
      fallReportsLoading={fallReportsLoading}
      fallReportsError={fallReportsError}
      notes={notes}
      notesLoading={notesLoading}
      notesError={notesError}
      selectedResidentId={selectedResidentId}
      residentNotesModalOpen={residentNotesModalOpen}
      residentNotesModalResident={residentNotesModalResident}
      createUserError={createUserError}
      createUserSuccess={createUserSuccess}
      onLogout={handleLogout}
      onOpenManageUsers={fetchUsers}
      onOpenCreateUser={() => {
        setCreateUserError("");
        setCreateUserSuccess("");
      }}
      onOpenSettings={() => {}}
      onUpdateProfile={handleUpdateProfile}
      onCreateEvent={handleCreateEvent}
      onCreateUser={handleCreateUser}
      onToggleAttendance={handleToggleAttendance}
      onCreateCheckIn={handleCreateCheckIn}
      onUpdateCheckIn={handleUpdateCheckIn}
      onDeleteCheckIn={handleDeleteCheckIn}
      onCreateFallReport={handleCreateFallReport}
      onSelectResidentForNotes={handleSelectResidentForNotes}
      onCreateResidentNote={handleCreateResidentNote}
      onOpenResidentNotesModal={handleOpenResidentNotesModal}
      onCloseResidentNotesModal={handleCloseResidentNotesModal}
      createLoading={createLoading}
      userCreateLoading={userCreateLoading}
      attendanceLoading={attendanceLoading}
      apiError={apiError}
    />
  );
}

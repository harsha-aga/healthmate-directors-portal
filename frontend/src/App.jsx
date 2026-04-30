import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const DEMO_CREDENTIALS = {
  director: {
    email: "director@healthmate.app",
    password: "password123"
  },
  resident: {
    email: "margaret@healthmate.app",
    password: "password123"
  }
};

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

function toDateInputValue(date) {
  return date.toISOString().split("T")[0];
}

function formatLongDate(dateString) {
  return longDateFormatter.format(new Date(`${dateString}T00:00:00`));
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

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
          <h1>Pick the right entrance for the person using the app.</h1>
          <p className="lede">
            Directors and residents now have separate sign-in experiences so the interface
            feels more tailored from the first screen onward.
          </p>
        </div>

        <div className="landing-actions">
          <button type="button" className="portal-card portal-card--director" onClick={() => onChooseMode("director-login")}>
            <span className="portal-label">Director Login</span>
            <strong>Manage the community schedule</strong>
            <p>Create events, review attendance, and add residents.</p>
          </button>

          <button type="button" className="portal-card portal-card--resident" onClick={() => onChooseMode("resident-login")}>
            <span className="portal-label">Resident Login</span>
            <strong>Browse and join activities</strong>
            <p>See what is happening each day and select multiple events to attend.</p>
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
  const [form, setForm] = useState(DEMO_CREDENTIALS[role]);
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
            <button type="button" className="secondary-button" onClick={() => setForm(DEMO_CREDENTIALS[role])}>
              Use Demo Login
            </button>
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
    const created = await onSubmit(form);
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
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="At least 8 characters"
            required
          />
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

function ManageUsersPanel({ users, loading }) {
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
              <li key={entry.id} className="user-row">
                <strong>{entry.full_name}</strong>
                <span>{entry.email}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SettingsPanel({ user }) {
  return (
    <div className="drawer-stack">
      <div className="drawer-header">
        <p className="eyebrow">Settings</p>
        <h2>Workspace Preferences</h2>
        <p className="lede">A simple placeholder for account and app settings while we shape the main experience.</p>
      </div>

      <div className="settings-list">
        <div className="setting-card">
          <strong>Signed In User</strong>
          <span>{user.full_name}</span>
        </div>
        <div className="setting-card">
          <strong>Role</strong>
          <span>{user.role}</span>
        </div>
        <div className="setting-card">
          <strong>Current Theme</strong>
          <span>{user.role === "director" ? "Director planning palette" : "Resident warm palette"}</span>
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({ currentMonth, selectedDate, events, onSelectDate }) {
  const today = new Date();
  const days = buildMonthGrid(currentMonth);
  const selected = new Date(`${selectedDate}T00:00:00`);

  return (
    <section className="calendar-board">
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
    </section>
  );
}

function Dashboard({
  user,
  events,
  users,
  usersLoading,
  createUserError,
  createUserSuccess,
  onLogout,
  onOpenManageUsers,
  onOpenCreateUser,
  onOpenSettings,
  onCreateEvent,
  onCreateUser,
  onToggleAttendance,
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
            Signed in as {user.full_name}. Role: <strong>{user.role}</strong>. {copy.dashboardDescription}
          </p>
        </div>

        <div className="topbar-actions topbar-actions--stacked">
          <div className="month-controls">
            <button type="button" className="secondary-button" onClick={previousMonth}>
              Previous
            </button>
            <button type="button" className="secondary-button" onClick={nextMonth}>
              Next
            </button>
          </div>

          <nav className="navbar-actions">
            <button type="button" className="secondary-button" onClick={() => setDrawerView("day")}>
              Day View
            </button>
            {user.role === "director" ? (
              <>
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
            <button type="button" className="secondary-button" onClick={() => {
              onOpenSettings();
              setDrawerView("settings");
            }}>
              Settings
            </button>
            <button type="button" className="secondary-button" onClick={onLogout}>
              Log Out
            </button>
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
            <ManageUsersPanel users={users} loading={usersLoading} />
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

          {drawerView === "settings" ? <SettingsPanel user={user} /> : null}
        </aside>
      </main>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [userCreateLoading, setUserCreateLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(null);
  const [authError, setAuthError] = useState("");
  const [apiError, setApiError] = useState("");
  const [createUserError, setCreateUserError] = useState("");
  const [createUserSuccess, setCreateUserSuccess] = useState("");

  const fetchEvents = async (currentUser) => {
    const data = await apiRequest(`/events?viewer_id=${currentUser.id}`);
    setEvents(data);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const data = await apiRequest("/users");
      setUsers(data);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleLogin = async (credentials, expectedRole) => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const currentUser = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials)
      });

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
      }
    } catch (error) {
      setAuthError(error.message);
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
      const createdUser = await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const successMessage = `${createdUser.full_name} was created successfully.`;
      setCreateUserSuccess(successMessage);
      if (user?.role === "director") {
        await fetchUsers();
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

  const handleLogout = () => {
    setUser(null);
    setEvents([]);
    setUsers([]);
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
      return (
        <LoginScreen
          role="resident"
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
      createUserError={createUserError}
      createUserSuccess={createUserSuccess}
      onLogout={handleLogout}
      onOpenManageUsers={fetchUsers}
      onOpenCreateUser={() => {
        setCreateUserError("");
        setCreateUserSuccess("");
      }}
      onOpenSettings={() => {}}
      onCreateEvent={handleCreateEvent}
      onCreateUser={handleCreateUser}
      onToggleAttendance={handleToggleAttendance}
      createLoading={createLoading}
      userCreateLoading={userCreateLoading}
      attendanceLoading={attendanceLoading}
      apiError={apiError}
    />
  );
}

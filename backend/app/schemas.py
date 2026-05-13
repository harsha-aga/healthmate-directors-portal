from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field
from pydantic import model_validator


class CommunityCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class CommunityResponse(BaseModel):
    id: int
    slug: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)


class FirebaseLoginRequest(BaseModel):
    id_token: str = Field(min_length=10)


class UserResponse(BaseModel):
    id: int
    community_id: int
    full_name: str
    email: EmailStr
    role: Literal["director", "resident"]


class UserCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: Optional[str] = Field(default=None, min_length=8, max_length=120)
    role: Literal["director", "resident"]

    @model_validator(mode="after")
    def validate_password_for_role(self):
        if self.role == "director":
            if not self.password:
                raise ValueError("Password is required for director accounts.")
        return self


class UserUpdateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)


class EventCreateRequest(BaseModel):
    event_date: str
    event_time: str
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=5, max_length=500)
    image_url: Optional[str] = ""


class EventResponse(BaseModel):
    id: int
    community_id: int
    event_date: str
    event_time: str
    name: str
    description: str
    image_url: Optional[str] = ""
    created_by: int
    participants: list[UserResponse]
    participant_count: int
    attending: bool = False


class MobileEventResponse(BaseModel):
    id: int
    community_id: int
    event_date: str
    event_time: str
    name: str
    description: str
    image_url: Optional[str] = ""
    created_by: int
    attending: bool = False


class MobilePortalStatusResponse(BaseModel):
    allowed: bool
    email: str = ""
    uid: str = ""
    portal_user: Optional[UserResponse] = None


class AttendanceToggleRequest(BaseModel):
    user_id: int


class CheckInCreateRequest(BaseModel):
    resident_id: int
    scheduled_date: str
    scheduled_time: str
    notes: Optional[str] = ""


class CheckInUpdateRequest(BaseModel):
    status: Literal["scheduled", "completed", "canceled"]
    notes: Optional[str] = None


class CheckInResponse(BaseModel):
    id: int
    community_id: int
    director_id: int
    resident: UserResponse
    scheduled_date: str
    scheduled_time: str
    notes: Optional[str] = ""
    status: Literal["scheduled", "completed", "canceled"] = "scheduled"


class ResidentNoteCreateRequest(BaseModel):
    resident_id: int
    note: str = Field(min_length=1, max_length=10000)


class ResidentNoteResponse(BaseModel):
    id: int
    community_id: int
    director_id: int
    resident_id: int
    note: str
    created_at: str


class FallReportCreateRequest(BaseModel):
    resident_id: Optional[int] = None
    incident_date: str = Field(description="YYYY-MM-DD")
    incident_time: str = Field(description="HH:MM (24h)")
    location: str = Field(min_length=2, max_length=200)
    witnessed: bool = False
    injuries: Optional[str] = Field(default="", max_length=500)
    immediate_action: Optional[str] = Field(default="", max_length=500)
    ems_called: bool = False
    family_notified: bool = False
    notes: Optional[str] = Field(default="", max_length=5000)


class FallReportResponse(BaseModel):
    id: int
    community_id: int
    director_id: int
    resident_id: Optional[int] = None
    incident_date: str
    incident_time: str
    location: str
    witnessed: bool
    injuries: str = ""
    immediate_action: str = ""
    ems_called: bool
    family_notified: bool
    notes: str = ""
    created_at: str

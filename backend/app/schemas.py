from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


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
    password: str = Field(min_length=8, max_length=120)
    role: Literal["director", "resident"]


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

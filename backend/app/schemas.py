from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: Literal["director", "resident"]


class UserCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=120)
    role: Literal["director", "resident"]


class EventCreateRequest(BaseModel):
    event_date: str
    event_time: str
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=5, max_length=500)
    image_url: Optional[str] = ""


class EventResponse(BaseModel):
    id: int
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

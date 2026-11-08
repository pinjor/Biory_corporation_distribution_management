"""Super Admin creates Sales Officers and resets the password they can see."""

from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import Ctx, get_ctx
from app.errors import ApiError, postgres_error
from app.security import hash_password

router = APIRouter(prefix="/staff", tags=["staff"])


class SalesOfficerIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    territory_id: UUID | None = None


class PasswordIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def _super(ctx: Ctx) -> None:
    if "super_admin" not in ctx.roles:
        raise ApiError("Only Super Admin can manage Sales Officers", 403, "forbidden")


def _email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ApiError("Enter a valid email", 400, "invalid_email")
    return email


@router.post("/sales-officers")
async def create_sales_officer(body: SalesOfficerIn, ctx: Ctx = Depends(get_ctx)) -> dict:
    _super(ctx)
    email = _email(body.email)
    try:
        user_id = await ctx.conn.fetchval(
            "select public.create_sales_officer($1, $2, $3, $4, $5, $6)",
            email,
            hash_password(body.password),
            body.password,
            body.full_name.strip(),
            (body.phone or "").strip() or None,
            body.territory_id,
        )
    except asyncpg.PostgresError as exc:
        raise postgres_error(exc) from exc
    return {"data": {"id": str(user_id)}}


@router.post("/users/{user_id}/password")
async def set_user_password(user_id: UUID, body: PasswordIn, ctx: Ctx = Depends(get_ctx)) -> dict:
    _super(ctx)
    try:
        await ctx.conn.execute(
            "select public.set_user_password($1, $2, $3)",
            user_id,
            hash_password(body.password),
            body.password,
        )
    except asyncpg.PostgresError as exc:
        raise postgres_error(exc) from exc
    return {"data": {"ok": True}}


@router.post("/sales-officers/{user_id}/password")
async def reset_sales_officer_password(user_id: UUID, body: PasswordIn, ctx: Ctx = Depends(get_ctx)) -> dict:
    _super(ctx)
    try:
        await ctx.conn.execute(
            "select public.reset_sales_officer_password($1, $2, $3)",
            user_id,
            hash_password(body.password),
            body.password,
        )
    except asyncpg.PostgresError as exc:
        raise postgres_error(exc) from exc
    return {"data": {"ok": True}}

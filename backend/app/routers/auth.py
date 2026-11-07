from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.deps import Ctx, get_ctx
from app.errors import ApiError
from app.security import encode_access, hash_password, needs_rehash, new_refresh_token, token_hash, verify_password

log = logging.getLogger("biory.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_PREFIX = "refresh:"
USER_REFRESH_PREFIX = "userref:"
RESET_PREFIX = "reset:"


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=128)


class SignupIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=120)


class EmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)


class RefreshIn(BaseModel):
    refresh_token: str


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class PasswordIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def _email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ApiError("Enter a valid email", 400, "invalid_email")
    return email


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _limit(request: Request, action: str, maximum: int) -> None:
    key = f"rl:{action}:{_client_ip(request)}"
    count = await request.app.state.redis.incr(key)
    if count == 1:
        await request.app.state.redis.expire(key, 60)
    if count > maximum:
        raise ApiError("Too many attempts. Wait a minute and try again.", 429, "rate_limited")


async def _issue(request: Request, user_id: UUID, email: str) -> dict:
    access, expires_at = encode_access(user_id, email)
    raw, digest = new_refresh_token()
    ttl = settings.refresh_token_days * 24 * 60 * 60
    redis = request.app.state.redis
    await redis.set(REFRESH_PREFIX + digest, f"{user_id}|{email}", ex=ttl)
    await redis.sadd(USER_REFRESH_PREFIX + str(user_id), digest)
    await redis.expire(USER_REFRESH_PREFIX + str(user_id), ttl)
    return {
        "access_token": access,
        "refresh_token": raw,
        "expires_at": expires_at,
        "expires_in": settings.access_token_minutes * 60,
        "token_type": "bearer",
        "user": {"id": str(user_id), "email": email},
    }


async def _revoke(redis, user_id: str, digest: str | None = None) -> None:
    if digest:
        await redis.delete(REFRESH_PREFIX + digest)
        await redis.srem(USER_REFRESH_PREFIX + user_id, digest)
        return
    members = await redis.smembers(USER_REFRESH_PREFIX + user_id)
    if members:
        await redis.delete(*[REFRESH_PREFIX + item for item in members])
    await redis.delete(USER_REFRESH_PREFIX + user_id)


@router.post("/login")
async def login(body: LoginIn, request: Request) -> dict:
    await _limit(request, "login", 20)
    email = _email(body.email)
    async with request.app.state.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            select u.id, u.email, u.password_hash, u.email_confirmed_at, p.active
            from public.users u
            left join public.profiles p on p.id = u.id
            where u.email = $1
            """,
            email,
        )
    if row is None or not verify_password(row["password_hash"], body.password):
        raise ApiError("Invalid login credentials", 401, "invalid_credentials")
    if row["email_confirmed_at"] is None:
        raise ApiError("Email is not confirmed", 403, "email_not_confirmed")
    if row["active"] is False:
        raise ApiError("This account is disabled", 403, "inactive")
    if needs_rehash(row["password_hash"]):
        async with request.app.state.pool.acquire() as conn:
            await conn.execute(
                "update public.users set password_hash = $2 where id = $1",
                row["id"],
                hash_password(body.password),
            )
    return await _issue(request, row["id"], row["email"])


@router.post("/signup")
async def signup(body: SignupIn, request: Request) -> dict:
    if not settings.allow_signup:
        raise ApiError("Sign-up is closed", 403, "signup_closed")
    await _limit(request, "signup", 10)
    email = _email(body.email)
    full_name = body.full_name.strip()
    try:
        async with request.app.state.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                insert into public.users (email, password_hash, full_name, email_confirmed_at)
                values ($1, $2, $3, now())
                returning id, email
                """,
                email,
                hash_password(body.password),
                full_name,
            )
    except Exception as exc:
        if getattr(exc, "sqlstate", None) == "23505":
            raise ApiError("User already registered", 409, "user_exists") from exc
        raise
    return await _issue(request, row["id"], row["email"])


@router.post("/refresh")
async def refresh(body: RefreshIn, request: Request) -> dict:
    digest = token_hash(body.refresh_token)
    stored = await request.app.state.redis.get(REFRESH_PREFIX + digest)
    if not stored:
        raise ApiError("Not signed in", 401, "not_authenticated")
    user_id, _, email = stored.partition("|")
    await _revoke(request.app.state.redis, user_id, digest)
    return await _issue(request, UUID(user_id), email)


@router.post("/logout")
async def logout(body: RefreshIn, request: Request) -> dict:
    digest = token_hash(body.refresh_token)
    stored = await request.app.state.redis.get(REFRESH_PREFIX + digest)
    if stored:
        user_id, _, _email = stored.partition("|")
        await _revoke(request.app.state.redis, user_id, digest)
    return {"ok": True}


@router.post("/forgot")
async def forgot(body: EmailIn, request: Request) -> dict:
    await _limit(request, "forgot", 5)
    email = _email(body.email)
    async with request.app.state.pool.acquire() as conn:
        row = await conn.fetchrow("select id from public.users where email = $1", email)
    if row is not None:
        raw, digest = new_refresh_token()
        await request.app.state.redis.set(RESET_PREFIX + digest, str(row["id"]), ex=3600)
        link = f"{settings.public_app_url.rstrip('/')}/reset-password?token={raw}"
        await _send_reset(email, link)
    return {"ok": True}


@router.post("/password")
async def change_password(body: PasswordIn, request: Request, ctx: Ctx = Depends(get_ctx)) -> dict:
    await ctx.conn.execute(
        "update public.users set password_hash = $2 where id = $1",
        ctx.user_id,
        hash_password(body.password),
    )
    await ctx.conn.execute("select public.forget_displayed_password($1)", ctx.user_id)
    await _revoke(request.app.state.redis, str(ctx.user_id))
    return await _issue(request, ctx.user_id, ctx.email)


@router.post("/reset")
async def reset_password(body: ResetIn, request: Request) -> dict:
    digest = token_hash(body.token)
    user_id = await request.app.state.redis.get(RESET_PREFIX + digest)
    if not user_id:
        raise ApiError("This reset link is invalid or has expired", 400, "invalid_token")
    async with request.app.state.pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("select set_config('app.user_id', $1, true)", user_id)
            row = await conn.fetchrow(
                """
                update public.users set password_hash = $2 where id = $1
                returning id, email
                """,
                UUID(user_id),
                hash_password(body.password),
            )
            if row is not None:
                await conn.execute("select public.forget_displayed_password($1)", UUID(user_id))
    await request.app.state.redis.delete(RESET_PREFIX + digest)
    if row is None:
        raise ApiError("This reset link is invalid or has expired", 400, "invalid_token")
    await _revoke(request.app.state.redis, user_id)
    return await _issue(request, row["id"], row["email"])


def _send_sync(email: str, link: str) -> None:
    message = EmailMessage()
    message["Subject"] = "Reset your BIORY password"
    message["From"] = settings.smtp_from
    message["To"] = email
    message.set_content(
        "A password reset was requested for your BIORY Corporation account.\n\n"
        f"Set a new password: {link}\n\n"
        "This link expires in one hour. If you did not ask for it, ignore this email.\n"
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_tls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


async def _send_reset(email: str, link: str) -> None:
    if not settings.smtp_host:
        log.warning("SMTP is not configured; password reset email was not sent")
        return
    try:
        await asyncio.to_thread(_send_sync, email, link)
    except Exception:
        log.exception("password reset email failed")

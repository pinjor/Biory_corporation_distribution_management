from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import AsyncIterator
from uuid import UUID

import asyncpg
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import ApiError
from app.security import decode_access

bearer = HTTPBearer(auto_error=False)


async def init_connection(conn: asyncpg.Connection) -> None:
    for typename in ("json", "jsonb"):
        await conn.set_type_codec(
            typename,
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
            format="text",
        )


class Ctx:
    def __init__(self, conn: asyncpg.Connection, user_id: UUID, email: str, roles: list[str]):
        self.conn = conn
        self.user_id = user_id
        self.email = email
        self.roles = roles

    def has_any(self, *roles: str) -> bool:
        return any(role in self.roles for role in roles)


@asynccontextmanager
async def user_connection(pool: asyncpg.Pool, user_id: UUID) -> AsyncIterator[asyncpg.Connection]:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("select set_config('app.user_id', $1, true)", str(user_id))
            yield conn


async def get_ctx(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> AsyncIterator[Ctx]:
    if credentials is None or not credentials.credentials:
        raise ApiError("Not signed in", 401, "not_authenticated")
    try:
        payload = decode_access(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise ApiError("Not signed in", 401, "not_authenticated") from exc
    if payload.get("typ") != "access":
        raise ApiError("Not signed in", 401, "not_authenticated")
    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise ApiError("Not signed in", 401, "not_authenticated") from exc
    email = str(payload.get("email") or "")
    async with user_connection(request.app.state.pool, user_id) as conn:
        rows = await conn.fetch("select role::text as role from public.user_roles where user_id = $1", user_id)
        yield Ctx(conn, user_id, email, [row["role"] for row in rows])

from __future__ import annotations

import logging
from uuid import UUID

import asyncpg

from app.config import settings
from app.security import hash_password

log = logging.getLogger("biory.seed")


async def _ensure_user(conn: asyncpg.Connection, email: str, password: str, full_name: str) -> UUID:
    email = email.strip().lower()
    existing = await conn.fetchrow("select id from public.users where email = $1", email)
    if existing:
        return existing["id"]
    created = await conn.fetchrow(
        """
        insert into public.users (email, password_hash, full_name, email_confirmed_at)
        values ($1, $2, $3, now())
        returning id
        """,
        email,
        hash_password(password),
        full_name,
    )
    log.info("created account %s", email)
    return created["id"]


async def seed(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("select pg_advisory_lock(8675309)")
        try:
            if settings.bootstrap_admin_email and settings.bootstrap_admin_password:
                await _ensure_user(
                    conn,
                    settings.bootstrap_admin_email,
                    settings.bootstrap_admin_password,
                    settings.bootstrap_admin_name,
                )
        finally:
            await conn.execute("select pg_advisory_unlock(8675309)")

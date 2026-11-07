from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import settings

_hasher = PasswordHasher()
_DUMMY = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        _hasher.verify(password_hash or _DUMMY, password)
        return password_hash is not None
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def encode_access(user_id: UUID, email: str) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.access_token_minutes)
    token = jwt.encode(
        {"sub": str(user_id), "email": email, "typ": "access", "iat": int(now.timestamp()), "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )
    return token, int(exp.timestamp())


def decode_access(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, token_hash(raw)


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def sign_file(bucket: str, path: str, exp: int) -> str:
    message = f"{bucket}\n{path}\n{exp}".encode()
    return hmac.new(settings.file_secret.encode(), message, hashlib.sha256).hexdigest()


def file_signature_ok(bucket: str, path: str, exp: int, signature: str) -> bool:
    expected = sign_file(bucket, path, exp)
    return hmac.compare_digest(expected, signature)

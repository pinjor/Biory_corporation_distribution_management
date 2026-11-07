"""JSON values into the Python types asyncpg binds for Postgres."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.errors import ApiError


def coerce_pg(type_name: str, value: Any) -> Any:
    if value is None:
        return None
    array = type_name.endswith("[]")
    base = type_name[:-2] if array else type_name
    if array:
        if not isinstance(value, list):
            raise ApiError(f"Expected a list for {type_name}", 400)
        return [coerce_pg(base, item) for item in value]
    if base in {"json", "jsonb"}:
        return value
    if base == "date":
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value)[:10])
    if "timestamp" in base:
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if base == "uuid":
        return value if isinstance(value, UUID) else UUID(str(value))
    if base in {"numeric", "decimal"}:
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))
    if base in {"integer", "bigint", "smallint", "int", "int2", "int4", "int8"}:
        return int(value)
    if base == "boolean" and isinstance(value, str):
        return value.lower() in {"1", "true", "t", "yes"}
    return value

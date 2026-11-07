import logging
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.deps import Ctx, get_ctx
from app.errors import ApiError, postgres_error
from app.query.engine import Filter, OrderBy, query_rows, write_rows
from app.rpc import call_rpc
from app.serialize import jsonable

log = logging.getLogger("biory.data")
router = APIRouter(tags=["data"])


class FilterIn(BaseModel):
    column: str
    op: str
    value: Any = None


class OrderIn(BaseModel):
    column: str
    ascending: bool = True


class QueryIn(BaseModel):
    table: str
    select: str = "*"
    filters: list[FilterIn] = Field(default_factory=list)
    or_filters: list[list[FilterIn]] = Field(default_factory=list)
    order: list[OrderIn] = Field(default_factory=list)
    limit: int | None = None
    single: bool = False
    maybe_single: bool = False


class WriteIn(BaseModel):
    table: str
    op: Literal["insert", "update"]
    values: dict[str, Any]
    filters: list[FilterIn] = Field(default_factory=list)


class RpcIn(BaseModel):
    fn: str
    args: dict[str, Any] = Field(default_factory=dict)


def _filters(items: list[FilterIn]) -> list[Filter]:
    return [Filter(item.column, item.op, item.value) for item in items]


def _translate(exc: Exception) -> Exception:
    if isinstance(exc, ApiError):
        return exc
    if isinstance(exc, asyncpg.PostgresError):
        translated = postgres_error(exc)
        if translated.status >= 500:
            log.exception("database error")
        return translated
    log.exception("request failed")
    return ApiError("Something went wrong", 500, "internal")


@router.post("/query")
async def query(body: QueryIn, request: Request, ctx: Ctx = Depends(get_ctx)) -> dict:
    try:
        data = await query_rows(
            ctx.conn,
            request.app.state.catalog,
            body.table,
            body.select,
            _filters(body.filters),
            [_filters(group) for group in body.or_filters],
            [OrderBy(item.column, item.ascending) for item in body.order],
            body.limit,
            body.single,
            body.maybe_single,
        )
    except Exception as exc:
        raise _translate(exc) from exc
    return {"data": jsonable(data)}


@router.post("/write")
async def write(body: WriteIn, request: Request, ctx: Ctx = Depends(get_ctx)) -> dict:
    try:
        rows = await write_rows(
            ctx.conn,
            request.app.state.catalog,
            body.table,
            body.op,
            body.values,
            _filters(body.filters),
        )
    except Exception as exc:
        raise _translate(exc) from exc
    return {"data": jsonable(rows)}


@router.post("/rpc")
async def rpc(body: RpcIn, ctx: Ctx = Depends(get_ctx)) -> dict:
    try:
        data = await call_rpc(ctx.conn, body.fn, body.args)
    except Exception as exc:
        raise _translate(exc) from exc
    return {"data": data}

"""Call allowlisted Postgres functions with the request's user id already set."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import asyncpg

from app.coerce import coerce_pg
from app.errors import ApiError
from app.rpc_allow import RPC_ALLOW
from app.serialize import jsonable


@dataclass
class Arg:
    name: str
    type_name: str


@dataclass
class Signature:
    returns_set: bool
    return_type: str
    args: list[Arg]


async def signature(conn: asyncpg.Connection, name: str) -> Signature:
    rows = await conn.fetch(
        """
        select p.proretset,
               pg_catalog.format_type(p.prorettype, null) as return_type,
               a.argname,
               pg_catalog.format_type(a.argtype, null) as argtype,
               a.argmode
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        left join lateral (
          select names.name as argname,
                 types.type as argtype,
                 modes.mode as argmode,
                 names.ord
          from unnest(p.proargnames) with ordinality as names(name, ord)
          join unnest(coalesce(p.proallargtypes, p.proargtypes)) with ordinality as types(type, ord) using (ord)
          left join unnest(p.proargmodes) with ordinality as modes(mode, ord) using (ord)
        ) a on true
        where n.nspname = 'public' and p.proname = $1 and p.prokind = 'f'
        order by a.ord nulls first
        """,
        name,
    )
    if not rows:
        raise ApiError("Unknown operation", 404, "unknown_rpc")
    args: list[Arg] = []
    for row in rows:
        mode = row["argmode"]
        if isinstance(mode, (bytes, bytearray)):
            mode = mode.decode()
        if mode is not None:
            mode = str(mode)
        if row["argname"] and mode not in ("o", "t"):
            args.append(Arg(row["argname"], row["argtype"]))
    return Signature(bool(rows[0]["proretset"]), rows[0]["return_type"], args)


def _bind(arg: Arg, value: Any, params: list[Any]) -> str:
    if value is None:
        return f"{arg.name} := null::{arg.type_name}"
    if "json" in arg.type_name:
        params.append(value)
        return f"{arg.name} := ${len(params)}::jsonb"
    params.append(coerce_pg(arg.type_name, value))
    return f"{arg.name} := ${len(params)}::{arg.type_name}"


async def call_rpc(conn: asyncpg.Connection, name: str, args: dict[str, Any]) -> Any:
    if name not in RPC_ALLOW:
        raise ApiError("Unknown operation", 404, "unknown_rpc")
    meta = await signature(conn, name)
    params: list[Any] = []
    pieces = []
    known = {arg.name for arg in meta.args}
    for key in args:
        if key not in known:
            continue
    for arg in meta.args:
        if arg.name not in args:
            continue
        pieces.append(_bind(arg, args[arg.name], params))
    call = f"public.{name}({', '.join(pieces)})"
    if meta.returns_set:
        rows = await conn.fetch(f"select * from {call}", *params)
        return jsonable([dict(row) for row in rows])
    row = await conn.fetchrow(f"select {call} as result", *params)
    result = row["result"] if row else None
    if isinstance(result, str) and "json" in meta.return_type:
        result = json.loads(result)
    return jsonable(result)

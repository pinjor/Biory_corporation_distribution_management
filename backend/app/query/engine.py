"""Parameterized reads and writes. Row visibility is still Postgres RLS."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import asyncpg

from app.coerce import coerce_pg
from app.errors import ApiError
from app.query.parser import IDENT, Embed, Selection, parse_selection

HIDDEN_TABLES = frozenset({"users", "doc_counters", "so_credentials"})
WRITABLE_TABLES = frozenset({"products", "chemists", "doctors", "app_settings", "notifications", "master_values", "territories", "geo_places"})
MAX_LIMIT = 5000
OPS = frozenset({"eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "like", "ilike"})
OP_SQL = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}


@dataclass
class Column:
    name: str
    data_type: str
    udt_name: str
    generated: bool


@dataclass
class ForeignKey:
    name: str
    from_table: str
    from_col: str
    to_table: str
    to_col: str


@dataclass
class Table:
    name: str
    kind: str
    columns: dict[str, Column] = field(default_factory=dict)
    primary_key: list[str] = field(default_factory=list)


@dataclass
class Catalog:
    tables: dict[str, Table]
    foreign_keys: list[ForeignKey]

    def table(self, name: str) -> Table:
        if not IDENT.match(name) or name in HIDDEN_TABLES or name not in self.tables:
            raise ApiError("Unknown table", 404, "unknown_table")
        return self.tables[name]


@dataclass
class Filter:
    column: str
    op: str
    value: Any = None


@dataclass
class OrderBy:
    column: str
    ascending: bool = True


@dataclass
class Relation:
    many_to_one: bool
    foreign_key: ForeignKey


class Binder:
    def __init__(self) -> None:
        self.params: list[Any] = []

    def add(self, value: Any) -> str:
        self.params.append(value)
        return f"${len(self.params)}"


def quote(name: str) -> str:
    if not IDENT.match(name):
        raise ApiError("Invalid identifier", 400)
    return f'"{name}"'


def cast_for(column: Column, array: bool = False) -> str:
    if column.udt_name == "app_role":
        base = "public.app_role"
    elif column.data_type == "uuid" or column.udt_name == "uuid":
        base = "uuid"
    elif column.data_type == "date":
        base = "date"
    elif "timestamp" in column.data_type:
        base = "timestamptz"
    elif column.data_type in {"integer", "bigint", "smallint"}:
        base = "bigint"
    elif column.data_type == "numeric":
        base = "numeric"
    elif column.data_type == "boolean":
        base = "boolean"
    elif column.data_type in {"json", "jsonb"}:
        base = column.data_type
    elif column.data_type == "ARRAY":
        base = {
            "_uuid": "uuid[]",
            "_text": "text[]",
            "_varchar": "text[]",
            "_int4": "int[]",
            "_int8": "bigint[]",
        }.get(column.udt_name, "text[]")
        return f"::{base}"
    else:
        base = "text"
    return f"::{base}[]" if array else f"::{base}"


async def load_catalog(conn: asyncpg.Connection) -> Catalog:
    tables: dict[str, Table] = {}
    for row in await conn.fetch(
        """
        select c.relname as name, c.relkind
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v')
        """
    ):
        kind = row["relkind"]
        if isinstance(kind, bytes):
            kind = kind.decode()
        tables[row["name"]] = Table(name=row["name"], kind=kind)

    for row in await conn.fetch(
        """
        select table_name, column_name, data_type, udt_name, is_generated
        from information_schema.columns
        where table_schema = 'public'
        """
    ):
        table = tables.get(row["table_name"])
        if table is None:
            continue
        table.columns[row["column_name"]] = Column(
            name=row["column_name"],
            data_type=row["data_type"],
            udt_name=row["udt_name"],
            generated=row["is_generated"] == "ALWAYS",
        )

    keys: dict[str, list[str]] = {}
    for row in await conn.fetch(
        """
        select c.relname as table_name, a.attname as column_name, k.ord
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        join unnest(i.indkey) with ordinality as k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
        where i.indisprimary and n.nspname = 'public' and k.attnum > 0
        order by c.relname, k.ord
        """
    ):
        keys.setdefault(row["table_name"], []).append(row["column_name"])
    for name, cols in keys.items():
        if name in tables:
            tables[name].primary_key = cols

    grouped: dict[str, ForeignKey] = {}
    for row in await conn.fetch(
        """
        select c.conname,
               src.relname as from_table,
               dst.relname as to_table,
               a.attname as from_col,
               af.attname as to_col
        from pg_constraint c
        join pg_class src on src.oid = c.conrelid
        join pg_class dst on dst.oid = c.confrelid
        join pg_namespace n on n.oid = src.relnamespace
        join unnest(c.conkey) with ordinality as k(attnum, ord) on true
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        join unnest(c.confkey) with ordinality as fk(attnum, ord) on fk.ord = k.ord
        join pg_attribute af on af.attrelid = c.confrelid and af.attnum = fk.attnum
        where c.contype = 'f' and n.nspname = 'public'
        """
    ):
        existing = grouped.get(row["conname"])
        if existing is not None:
            continue
        grouped[row["conname"]] = ForeignKey(
            name=row["conname"],
            from_table=row["from_table"],
            from_col=row["from_col"],
            to_table=row["to_table"],
            to_col=row["to_col"],
        )
    return Catalog(tables=tables, foreign_keys=list(grouped.values()))


def resolve(catalog: Catalog, parent: str, embed: Embed) -> Relation:
    if embed.hint:
        match = next((fk for fk in catalog.foreign_keys if fk.name == embed.hint), None)
        if match is None:
            raise ApiError(f"Unknown relationship {embed.hint}", 400)
        if match.from_table == parent and match.to_table == embed.key:
            return Relation(True, match)
        if match.to_table == parent and match.from_table == embed.key:
            return Relation(False, match)
        raise ApiError(f"Relationship {embed.hint} does not link {parent} to {embed.key}", 400)

    outgoing = [
        fk for fk in catalog.foreign_keys if fk.from_table == parent and fk.to_table == embed.key
    ]
    incoming = [
        fk for fk in catalog.foreign_keys if fk.to_table == parent and fk.from_table == embed.key
    ]
    if len(outgoing) == 1 and not incoming:
        return Relation(True, outgoing[0])
    if len(incoming) == 1 and not outgoing:
        return Relation(False, incoming[0])
    if len(outgoing) + len(incoming) == 0:
        raise ApiError(f"No relationship from {parent} to {embed.key}", 400)
    raise ApiError(f"Relationship {embed.key} on {parent} is ambiguous", 400)


def _coerce(value: Any, column: Column, array: bool = False) -> Any:
    if array:
        if not isinstance(value, list):
            raise ApiError("in filters need a list", 400)
        return [_coerce(item, column) for item in value]
    if value is None or isinstance(value, (int, float, bool)) and column.data_type not in {"integer", "bigint", "smallint", "numeric"}:
        return value
    if column.data_type == "uuid" or column.udt_name == "uuid":
        return UUID(str(value))
    if column.data_type in {"integer", "bigint", "smallint"}:
        return int(value)
    if column.data_type == "numeric":
        return coerce_pg("numeric", value)
    if column.data_type == "date":
        return coerce_pg("date", value)
    if "timestamp" in column.data_type:
        return coerce_pg("timestamptz", value)
    if column.data_type in {"json", "jsonb"}:
        return value
    if column.data_type == "boolean" and isinstance(value, str):
        return value.lower() in {"1", "true", "t", "yes"}
    return value


def _predicate(alias: str, column: Column, op: str, value: Any, binder: Binder) -> str:
    if op not in OPS:
        raise ApiError(f"Unsupported filter {op}", 400)
    ref = f"{alias}.{quote(column.name)}"
    if op == "is":
        if value is not None:
            raise ApiError("Only null checks are supported", 400)
        return f"{ref} is null"
    if op == "in":
        values = _coerce(value, column, array=True)
        if len(values) == 0:
            return "false"
        placeholder = binder.add(values)
        return f"{ref} = any({placeholder}{cast_for(column, array=True)})"
    if op in {"like", "ilike"}:
        placeholder = binder.add(str(value))
        keyword = "ilike" if op == "ilike" else "like"
        return f"{ref} {keyword} {placeholder}"
    placeholder = binder.add(_coerce(value, column))
    return f"{ref} {OP_SQL[op]} {placeholder}{cast_for(column)}"


def _exists(
    catalog: Catalog,
    parent: Table,
    relation_name: str,
    filters: list[Filter],
    binder: Binder,
) -> str:
    relation = resolve(catalog, parent.name, Embed(relation_name, None, True, ["*"]))
    fk = relation.foreign_key
    child = catalog.table(fk.to_table if relation.many_to_one else fk.from_table)
    clauses: list[str] = []
    if relation.many_to_one:
        clauses.append(f"e.{quote(fk.to_col)} = t.{quote(fk.from_col)}")
    else:
        clauses.append(f"e.{quote(fk.from_col)} = t.{quote(fk.to_col)}")
    for item in filters:
        column = child.columns.get(item.column)
        if column is None:
            raise ApiError(f"Unknown column {relation_name}.{item.column}", 400)
        clauses.append(_predicate("e", column, item.op, item.value, binder))
    joined = " and ".join(clauses)
    return f"exists (select 1 from public.{quote(child.name)} e where {joined})"


def _local(table: Table, item: Filter, binder: Binder) -> str:
    if not IDENT.match(item.column):
        raise ApiError("Invalid column", 400)
    column = table.columns.get(item.column)
    if column is None:
        raise ApiError(f"Unknown column {item.column}", 400)
    return _predicate("t", column, item.op, item.value, binder)


def _where(
    catalog: Catalog,
    table: Table,
    filters: list[Filter],
    or_groups: list[list[Filter]],
    binder: Binder,
) -> str:
    local: list[Filter] = []
    embedded: dict[str, list[Filter]] = {}
    for item in filters:
        if "." in item.column:
            relation, column = item.column.split(".", 1)
            if not IDENT.match(relation) or not IDENT.match(column):
                raise ApiError("Invalid column", 400)
            embedded.setdefault(relation, []).append(Filter(column, item.op, item.value))
        else:
            local.append(item)
    parts = [_local(table, item, binder) for item in local]
    parts.extend(_exists(catalog, table, name, group, binder) for name, group in embedded.items())
    for group in or_groups:
        if not group:
            continue
        for item in group:
            if "." in item.column:
                raise ApiError("or filters cannot cross relationships", 400)
        parts.append("(" + " or ".join(_local(table, item, binder) for item in group) + ")")
    return " and ".join(parts)


def _select_list(table: Table, selection: Selection, embed_columns: set[str]) -> tuple[str, set[str] | None]:
    if selection.star:
        return "t.*", None
    wanted = set(selection.columns)
    unknown = wanted - set(table.columns)
    if unknown:
        raise ApiError(f"Unknown column {sorted(unknown)[0]}", 400)
    names = list(dict.fromkeys([*selection.columns, *embed_columns]))
    sql = ", ".join(f"t.{quote(name)}" for name in names)
    return sql, wanted


def _embed_columns(catalog: Catalog, table: Table, selection: Selection) -> set[str]:
    needed: set[str] = set()
    if table.primary_key:
        needed.update(table.primary_key)
    for embed in selection.embeds:
        relation = resolve(catalog, table.name, embed)
        if relation.many_to_one:
            needed.add(relation.foreign_key.from_col)
        elif table.primary_key:
            needed.update(table.primary_key)
    return {name for name in needed if name in table.columns}


async def _attach(
    conn: asyncpg.Connection,
    catalog: Catalog,
    table: Table,
    rows: list[dict[str, Any]],
    selection: Selection,
) -> None:
    for embed in selection.embeds:
        relation = resolve(catalog, table.name, embed)
        fk = relation.foreign_key
        child_table = catalog.table(fk.to_table if relation.many_to_one else fk.from_table)
        child_selection = Selection(embed.columns, embed.embeds)
        if relation.many_to_one:
            ids = [row.get(fk.from_col) for row in rows if row.get(fk.from_col) is not None]
            children = await _fetch_where(conn, catalog, child_table, child_selection, fk.to_col, ids)
            index = {}
            pk = fk.to_col
            for child in children:
                index[child.get(pk)] = child
            for row in rows:
                row[embed.key] = index.get(row.get(fk.from_col))
            continue
        parent_pk = fk.to_col
        ids = [row.get(parent_pk) for row in rows if row.get(parent_pk) is not None]
        children = await _fetch_where(conn, catalog, child_table, child_selection, fk.from_col, ids)
        grouped: dict[Any, list[dict[str, Any]]] = {}
        for child in children:
            grouped.setdefault(child.get(fk.from_col), []).append(child)
        for row in rows:
            row[embed.key] = grouped.get(row.get(parent_pk), [])


async def _fetch_where(
    conn: asyncpg.Connection,
    catalog: Catalog,
    table: Table,
    selection: Selection,
    fk_column: str,
    ids: list[Any],
) -> list[dict[str, Any]]:
    if not ids:
        return []
    column = table.columns.get(fk_column)
    if column is None:
        raise ApiError(f"Unknown column {fk_column}", 400)
    binder = Binder()
    placeholder = binder.add(list(dict.fromkeys(ids)))
    where = f"t.{quote(fk_column)} = any({placeholder}{cast_for(column, array=True)})"
    return await _fetch(conn, catalog, table, selection, where, binder, None, None, {fk_column})


async def _fetch(
    conn: asyncpg.Connection,
    catalog: Catalog,
    table: Table,
    selection: Selection,
    where: str,
    binder: Binder,
    order: list[OrderBy] | None,
    limit: int | None,
    always: set[str] | None = None,
) -> list[dict[str, Any]]:
    extras = _embed_columns(catalog, table, selection) | (always or set())
    chosen, _wanted = _select_list(table, selection, extras)
    sql = f"select {chosen} from public.{quote(table.name)} t"
    if where:
        sql += f" where {where}"
    if order:
        pieces = []
        for item in order:
            if item.column not in table.columns:
                raise ApiError(f"Unknown column {item.column}", 400)
            direction = "asc" if item.ascending else "desc"
            pieces.append(f"t.{quote(item.column)} {direction}")
        sql += " order by " + ", ".join(pieces)
    if limit is not None:
        sql += f" limit {int(limit)}"
    records = await conn.fetch(sql, *binder.params)
    rows = [dict(record) for record in records]
    await _attach(conn, catalog, table, rows, selection)
    return rows


async def query_rows(
    conn: asyncpg.Connection,
    catalog: Catalog,
    table_name: str,
    select: str,
    filters: list[Filter],
    or_groups: list[list[Filter]],
    order: list[OrderBy],
    limit: int | None,
    single: bool,
    maybe_single: bool,
) -> Any:
    try:
        selection = parse_selection(select or "*")
    except ValueError as exc:
        raise ApiError(str(exc), 400) from exc
    table = catalog.table(table_name)
    if limit is None:
        limit = MAX_LIMIT
    if limit < 1 or limit > MAX_LIMIT:
        raise ApiError(f"Limit must be between 1 and {MAX_LIMIT}", 400)
    binder = Binder()
    where = _where(catalog, table, filters, or_groups, binder)
    rows = await _fetch(conn, catalog, table, selection, where, binder, order, limit)
    if single or maybe_single:
        if len(rows) > 1:
            raise ApiError("Multiple rows returned", 406, "PGRST116")
        if len(rows) == 0:
            if maybe_single:
                return None
            raise ApiError("No rows found", 406, "PGRST116")
        return rows[0]
    return rows


async def write_rows(
    conn: asyncpg.Connection,
    catalog: Catalog,
    table_name: str,
    op: str,
    values: dict[str, Any],
    filters: list[Filter],
) -> list[dict[str, Any]]:
    table = catalog.table(table_name)
    if table_name not in WRITABLE_TABLES or table.kind != "r":
        raise ApiError("This table cannot be changed from the API", 403, "read_only")
    if op == "delete":
        if not filters:
            raise ApiError("Refusing to delete every row", 400)
        binder = Binder()
        where = _where(catalog, table, filters, [], binder)
        sql = f"delete from public.{quote(table.name)} t where {where} returning *"
        records = await conn.fetch(sql, *binder.params)
        return [dict(record) for record in records]
    if not values:
        raise ApiError("Nothing to save", 400)
    clean: dict[str, Any] = {}
    for key, value in values.items():
        column = table.columns.get(key)
        if column is None:
            raise ApiError(f"Unknown column {key}", 400)
        if column.generated:
            continue
        clean[key] = value
    if not clean:
        raise ApiError("Nothing to save", 400)
    binder = Binder()
    assignments = []
    for key, value in clean.items():
        column = table.columns[key]
        placeholder = binder.add(_coerce(value, column))
        assignments.append(f"{quote(key)} = {placeholder}{cast_for(column)}")
    if op == "insert":
        columns = ", ".join(quote(key) for key in clean)
        values_sql = ", ".join(item.split("=", 1)[1].strip() for item in assignments)
        sql = f"insert into public.{quote(table.name)} ({columns}) values ({values_sql}) returning *"
        records = await conn.fetch(sql, *binder.params)
        return [dict(record) for record in records]
    if op != "update":
        raise ApiError("Unsupported write", 400)
    if not filters:
        raise ApiError("Refusing to update every row", 400)
    where = _where(catalog, table, filters, [], binder)
    sql = f"update public.{quote(table.name)} t set {', '.join(assignments)} where {where} returning *"
    records = await conn.fetch(sql, *binder.params)
    return [dict(record) for record in records]

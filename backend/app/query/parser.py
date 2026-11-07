"""Parse the PostgREST-style select lists the field app already sends."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


@dataclass
class Embed:
    key: str
    hint: str | None
    inner: bool
    columns: list[str]
    embeds: list[Embed] = field(default_factory=list)


@dataclass
class Selection:
    columns: list[str]
    embeds: list[Embed] = field(default_factory=list)

    @property
    def star(self) -> bool:
        return "*" in self.columns


def split_top(source: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    for ch in source:
        if ch == "," and depth == 0:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                raise ValueError("Unbalanced select list")
        buf.append(ch)
    if depth != 0:
        raise ValueError("Unbalanced select list")
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def parse_selection(source: str) -> Selection:
    columns: list[str] = []
    embeds: list[Embed] = []
    for part in split_top(source.strip()):
        if part == "*":
            columns.append("*")
            continue
        if "(" not in part:
            if not IDENT.match(part):
                raise ValueError(f"Invalid column {part}")
            columns.append(part)
            continue
        name, rest = part.split("(", 1)
        if not rest.endswith(")"):
            raise ValueError(f"Invalid embed {part}")
        name = name.strip()
        hint: str | None = None
        inner = False
        if "!" in name:
            base, hint_raw = name.split("!", 1)
            name = base.strip()
            hint_raw = hint_raw.strip()
            if hint_raw == "inner":
                inner = True
            else:
                if not IDENT.match(hint_raw):
                    raise ValueError(f"Invalid relationship {hint_raw}")
                hint = hint_raw
        if not IDENT.match(name):
            raise ValueError(f"Invalid relationship {name}")
        inner_src = rest[:-1].strip()
        child = parse_selection(inner_src) if inner_src else Selection(columns=["*"])
        if not child.columns and not child.embeds:
            child.columns = ["*"]
        embeds.append(Embed(key=name, hint=hint, inner=inner, columns=child.columns, embeds=child.embeds))
    if not columns and not embeds:
        columns = ["*"]
    return Selection(columns=columns, embeds=embeds)

import time
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.deps import Ctx, get_ctx
from app.errors import ApiError
from app.security import file_signature_ok, sign_file

router = APIRouter(prefix="/files", tags=["files"])

BUCKETS = {
    "expense-receipts": {"super_admin", "admin", "finance_admin"},
    "deposit-proofs": {"super_admin", "admin", "finance_admin"},
}
ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}


def _safe_path(bucket: str, path: str) -> Path:
    if bucket not in BUCKETS:
        raise ApiError("Unknown file bucket", 404)
    if not path or path.startswith("/") or "\\" in path or ".." in path.split("/"):
        raise ApiError("Invalid file path", 400)
    if not all(part and part not in {".", ".."} for part in path.split("/")):
        raise ApiError("Invalid file path", 400)
    root = (Path(settings.upload_dir) / bucket).resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise ApiError("Invalid file path", 400)
    return target


def _can_read(ctx: Ctx, bucket: str, path: str) -> None:
    owner = path.split("/", 1)[0]
    if owner == str(ctx.user_id):
        return
    if ctx.has_any(*BUCKETS[bucket]):
        return
    raise ApiError("Not authorized", 403, "forbidden")


@router.post("/{bucket}")
async def upload(
    bucket: str,
    request: Request,
    path: str = Form(...),
    file: UploadFile = File(...),
    ctx: Ctx = Depends(get_ctx),
) -> dict:
    del request
    if not path.startswith(f"{ctx.user_id}/"):
        raise ApiError("Files must be stored in your own folder", 403, "forbidden")
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise ApiError("Upload a JPG, PNG, WEBP image or a PDF", 400, "invalid_type")
    target = _safe_path(bucket, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with target.open("wb") as handle:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise ApiError("File is too large", 400, "too_large")
                handle.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return {"data": {"path": path}}


class SignIn(BaseModel):
    path: str | None = None
    paths: list[str] | None = None
    expires_in: int = Field(default=300, ge=30, le=3600)


@router.post("/{bucket}/sign")
async def sign(bucket: str, body: SignIn, ctx: Ctx = Depends(get_ctx)) -> dict:
    expires_in = body.expires_in
    exp = int(time.time()) + expires_in
    items = body.paths if body.paths is not None else [body.path]
    signed = []
    for item in items:
        if not isinstance(item, str) or not item:
            raise ApiError("Missing file path", 400)
        _safe_path(bucket, item)
        _can_read(ctx, bucket, item)
        signature = sign_file(bucket, item, exp)
        url = f"/api/v1/files/{bucket}/{item}?exp={exp}&sig={signature}"
        signed.append({"path": item, "signedUrl": url})
    if body.paths is not None:
        return {"data": signed}
    return {"data": signed[0]}


@router.get("/{bucket}/{path:path}")
async def download(bucket: str, path: str, exp: int = Query(...), sig: str = Query(...)) -> FileResponse:
    if exp < int(time.time()):
        raise ApiError("This link has expired", 401, "expired")
    if not file_signature_ok(bucket, path, exp, sig):
        raise ApiError("Invalid file link", 401, "invalid_signature")
    target = _safe_path(bucket, path)
    if not target.is_file():
        raise ApiError("File not found", 404, "not_found")
    return FileResponse(target)

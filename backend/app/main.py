import asyncio
import logging
from contextlib import asynccontextmanager

import asyncpg
import redis.asyncio as redis
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.deps import init_connection
from app.errors import ApiError
from app.query.engine import load_catalog
from app.routers import auth, data, files, staff
from app.seed import seed

log = logging.getLogger("biory")


def _check_production() -> None:
    if not settings.production:
        return
    secret = settings.jwt_secret
    if len(secret) < 32 or "change-me" in secret or secret.startswith("replace-"):
        raise RuntimeError("Set a JWT_SECRET of at least 32 characters")
    weak = {"", "change-me", "change-me-now", "replace-this-password"}
    if settings.bootstrap_admin_email and settings.bootstrap_admin_password in weak:
        raise RuntimeError("Set a real BOOTSTRAP_ADMIN_PASSWORD")


async def _pool() -> asyncpg.Pool:
    last: Exception | None = None
    for _ in range(30):
        try:
            pool = await asyncpg.create_pool(
                settings.database_url,
                min_size=1,
                max_size=10,
                command_timeout=60,
                init=init_connection,
            )
            async with pool.acquire() as conn:
                await conn.fetchval("select 1")
            return pool
        except Exception as exc:
            last = exc
            log.warning("waiting for postgres: %s", exc)
            await asyncio.sleep(1)
    raise RuntimeError("postgres is not reachable") from last


@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_production()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    pool = await _pool()
    client = redis.from_url(settings.redis_url, decode_responses=True)
    for _ in range(30):
        try:
            await client.ping()
            break
        except Exception as exc:
            log.warning("waiting for redis: %s", exc)
            await asyncio.sleep(1)
    else:
        raise RuntimeError("redis is not reachable")
    async with pool.acquire() as conn:
        app.state.catalog = await load_catalog(conn)
    await seed(pool)
    app.state.pool = pool
    app.state.redis = client
    log.info("BIORY API ready")
    yield
    await client.aclose()
    await pool.close()


app = FastAPI(
    title="BIORY Corporation API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.production else "/api/docs",
    redoc_url=None,
    openapi_url=None if settings.production else "/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(ApiError)
async def api_error(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse({"data": None, "error": {"message": exc.message, "code": exc.code}}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    message = "Check the form and try again"
    errors = exc.errors()
    if errors:
        message = errors[0].get("msg", message)
    return JSONResponse({"data": None, "error": {"message": message, "code": "validation"}}, status_code=422)


app.include_router(auth.router, prefix="/api/v1")
app.include_router(data.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(staff.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/v1/ready")
async def ready(request: Request):
    pool = getattr(request.app.state, "pool", None)
    client = getattr(request.app.state, "redis", None)
    if pool is None or client is None:
        return JSONResponse({"status": "starting"}, status_code=503)
    await pool.fetchval("select 1")
    await client.ping()
    return {"status": "ready"}

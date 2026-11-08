class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "error"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def postgres_error(exc: Exception) -> ApiError:
    message = getattr(exc, "message", None) or str(exc)
    message = message.split("\n", 1)[0].strip()
    code = getattr(exc, "sqlstate", None) or "error"
    public = {"P0001", "23505", "23514", "23503", "23502", "23514", "42501", "22023", "22P02"}
    if code == "23505":
        return ApiError(message or "That value is already in use", 409, code)
    if code == "23503":
        return ApiError("This is used elsewhere and cannot be deleted", 409, code)
    if code == "42501":
        return ApiError(message or "Not authorized", 403, code)
    if code in {"40001", "40P01", "57014", "53300"} or code.startswith("08"):
        return ApiError(message or "Database is busy", 503, code)
    if code in public:
        return ApiError(message or "Request rejected", 400, code)
    return ApiError("Something went wrong", 500, "internal")

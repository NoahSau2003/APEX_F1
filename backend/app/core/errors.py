from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    status = 500
    code = "internal_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(ApiError):
    status = 404
    code = "not_found"


class BadRequest(ApiError):
    status = 400
    code = "bad_request"


class DataUnavailable(ApiError):
    """The requested dataset does not exist for this session at the provider."""

    status = 404
    code = "data_unavailable"


class UpstreamError(ApiError):
    """A provider could not be reached or returned an error."""

    status = 502
    code = "upstream_error"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})

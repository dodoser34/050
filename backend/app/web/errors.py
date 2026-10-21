"""Ошибки валидации в виде {detail, errors: {поле: сообщение}} — так их удобно показывать под полями формы."""
import re

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

FIELD_MESSAGES = {"email": "Введите корректный адрес электронной почты"}


class FieldError(Exception):
    """Ошибки отдельных полей из обработчика: {поле: сообщение} → 422 в формате ошибок валидации."""

    def __init__(self, errors: dict[str, str], detail: str = "Проверьте поля формы"):
        super().__init__(detail)
        self.errors, self.detail = errors, detail


def _chars(n: int) -> str:
    """Склонение: 1 символ, 2 символа, 5 символов."""
    if n % 10 == 1 and n % 100 != 11:
        return "символ"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return "символа"
    return "символов"


def _message(field: str, err: dict) -> str:
    """Человекочитаемый текст ошибки на русском для любого типа ошибки pydantic."""
    kind, ctx = err.get("type", ""), err.get("ctx") or {}
    if field in FIELD_MESSAGES:
        return FIELD_MESSAGES[field]
    if kind == "missing":
        return "Обязательное поле"
    if kind == "string_too_short":
        n = ctx.get("min_length", 1)
        if field == "name":
            return "Укажите имя"
        if n <= 1 or not str(err.get("input") or "").strip():
            return "Обязательное поле"
        return f"Минимум {n} {_chars(n)}"
    if kind == "string_too_long":
        n = ctx.get("max_length", 0)
        return f"Максимум {n} {_chars(n)}"
    if kind in ("too_long", "list_too_long"):
        return f"Не больше {ctx.get('max_length')} значений"
    if kind in ("bool_type", "bool_parsing"):
        return "Неверное значение"
    if kind == "value_error":
        return re.sub(r"^Value error, ", "", err.get("msg", ""))
    return "Проверьте значение"


async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, str] = {}
    for err in exc.errors():
        field = str(err["loc"][-1]) if err.get("loc") else "form"
        errors.setdefault(field, _message(field, err))
    return JSONResponse(status_code=422, content={"detail": "Проверьте поля формы", "errors": errors})


async def field_error_handler(_: Request, exc: FieldError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.detail, "errors": exc.errors})


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_handler)
    app.add_exception_handler(FieldError, field_error_handler)

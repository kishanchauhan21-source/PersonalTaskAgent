from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .planner import PlanRequest, PlanResponse, build_plan, parse_tasks

BASE_DIR = Path(__file__).resolve().parent
app = FastAPI(
    title="Daymark · Personal Task Planner",
    description="Turn a natural-language task list into a practical daily plan.",
    version="0.1.0",
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class ParseRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/parse")
def parse(request: ParseRequest) -> dict[str, list]:
    return {"tasks": [task.model_dump(mode="json") for task in parse_tasks(request.message)]}


@app.post("/api/plan", response_model=PlanResponse)
def plan(request: PlanRequest) -> PlanResponse:
    try:
        return build_plan(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

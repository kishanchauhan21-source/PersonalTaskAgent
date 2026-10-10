from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Priority = Literal["high", "medium", "low"]


class Task(BaseModel):
    id: str
    title: str = Field(min_length=1, max_length=120)
    duration_minutes: int = Field(default=45, ge=15, le=480)
    priority: Priority = "medium"
    due_date: date | None = None
    due_label: str | None = None
    fixed_start: time | None = None
    fixed_end: time | None = None
    is_fixed: bool = False

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        return value.strip()


class PlanRequest(BaseModel):
    tasks: list[Task] = Field(default_factory=list, max_length=40)
    start_time: time = time(9, 0)
    end_time: time = time(22, 0)
    plan_date: date = Field(default_factory=date.today)


class ScheduleItem(BaseModel):
    task_id: str | None = None
    title: str
    start: time
    end: time
    kind: Literal["task", "event", "break"]
    priority: Priority | None = None
    note: str | None = None


class PlanResponse(BaseModel):
    plan_date: date
    items: list[ScheduleItem]
    unscheduled: list[Task]
    focus_minutes: int
    break_minutes: int


def _relative_due(fragment: str, today: date) -> tuple[date | None, str | None]:
    lower = fragment.lower()
    if "day after tomorrow" in lower:
        return today + timedelta(days=2), "In 2 days"
    if "tomorrow" in lower:
        return today + timedelta(days=1), "Tomorrow"
    if "today" in lower or "tonight" in lower:
        return today, "Today"
    if "next week" in lower:
        return today + timedelta(days=(7 - today.weekday())), "Next week"
    match = re.search(r"in\s+(\d+)\s+days?", lower)
    if match:
        days = int(match.group(1))
        return today + timedelta(days=days), f"In {days} days"
    return None, None


def _duration_for(title: str) -> int:
    lower = title.lower()
    if any(word in lower for word in ("assignment", "project", "report", "essay")):
        return 90
    if any(word in lower for word in ("interview", "exam", "presentation")):
        return 60
    if any(word in lower for word in ("gym", "workout", "meeting", "appointment")):
        return 60
    return 45


def parse_tasks(message: str, today: date | None = None) -> list[Task]:
    """Extract lightweight task and fixed-event suggestions from a user note."""
    today = today or date.today()
    message = re.sub(r"[.!?]\s*(?:please\s+)?prepare\b.*$", "", message, flags=re.I)
    message = re.sub(r"[.!?]\s*(?:please\s+)?make\s+(?:me\s+)?(?:a\s+)?plan\b.*$", "", message, flags=re.I)
    parts = re.split(r",|\band\b|\bthen\b|\balso\b", message, flags=re.IGNORECASE)
    tasks: list[Task] = []
    for index, raw in enumerate(parts):
        fragment = re.sub(r"\s+", " ", raw).strip(" .;\n\t")
        fragment = re.sub(r"\s+(?:please\s+)?(?:prepare|make|build|create|generate)\b.*$", "", fragment, flags=re.I).strip()
        fragment = re.sub(r"^(?:i have|i've got|i have got|there is|there's)\s*", "", fragment, flags=re.I)
        fragment = re.sub(r"^(?:a|an|the)\s+", "", fragment, flags=re.I)
        if not fragment or len(fragment) < 4:
            continue

        due_date, due_label = _relative_due(fragment, today)
        event_match = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", fragment, re.I)
        is_fixed = bool(event_match)
        fixed_start = None
        fixed_end = None
        title = fragment
        if event_match:
            hour = int(event_match.group(1)) % 12
            minute = int(event_match.group(2) or 0)
            if event_match.group(3).lower() == "pm":
                hour += 12
            fixed_start = time(hour, minute)
            fixed_end = (datetime.combine(today, fixed_start) + timedelta(minutes=_duration_for(fragment))).time()
            title = re.sub(r"\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", "", title, flags=re.I)
            due_label = due_label or "Fixed event"

        title = re.sub(r"\b(?:tomorrow|today|tonight|next week|in\s+\d+\s+days?)\b", "", title, flags=re.I)
        title = re.sub(r"^\s*(?:i have)\s*", "", title, flags=re.I)
        title = re.sub(r"\s+", " ", title).strip(" -:,. ")
        if not title:
            continue
        title = title[0].upper() + title[1:]
        if title.lower() == "interview":
            title = "Interview preparation"
        lower = fragment.lower()
        priority: Priority = "high" if any(x in lower for x in ("urgent", "important", "asap", "due tomorrow", "tomorrow", "today")) else "medium"
        if any(x in lower for x in ("if possible", "optional", "whenever")):
            priority = "low"
        tasks.append(Task(
            id=f"parsed-{index}-{len(tasks)}",
            title=title,
            duration_minutes=_duration_for(title),
            priority=priority,
            due_date=due_date,
            due_label=due_label,
            fixed_start=fixed_start,
            fixed_end=fixed_end,
            is_fixed=is_fixed,
        ))
    return tasks


def build_plan(request: PlanRequest) -> PlanResponse:
    day = request.plan_date
    start_dt = datetime.combine(day, request.start_time)
    end_dt = datetime.combine(day, request.end_time)
    if end_dt <= start_dt:
        raise ValueError("The day end must be later than the day start.")

    events: list[ScheduleItem] = []
    flexible: list[Task] = []
    for task in request.tasks:
        if task.is_fixed and task.fixed_start:
            finish = task.fixed_end or (datetime.combine(day, task.fixed_start) + timedelta(minutes=task.duration_minutes)).time()
            events.append(ScheduleItem(
                task_id=task.id, title=task.title, start=task.fixed_start,
                end=finish, kind="event", priority=task.priority, note="Fixed commitment",
            ))
        else:
            flexible.append(task)

    events.sort(key=lambda item: item.start)
    for left, right in zip(events, events[1:]):
        if left.end > right.start:
            raise ValueError(f"Fixed events overlap: {left.title} and {right.title}.")

    rank = {"high": 0, "medium": 1, "low": 2}
    flexible.sort(key=lambda task: (task.due_date or date.max, rank[task.priority], task.title.lower()))
    items: list[ScheduleItem] = []
    occupied = [(datetime.combine(day, event.start), datetime.combine(day, event.end)) for event in events]
    cursor = start_dt
    focus_since_break = 0
    unscheduled: list[Task] = []

    def next_gap(at: datetime, minutes: int) -> tuple[datetime, datetime] | None:
        probe = at
        duration = timedelta(minutes=minutes)
        for occ_start, occ_end in sorted(occupied):
            if occ_end <= probe:
                continue
            if probe + duration <= occ_start:
                return (probe, probe + duration) if probe + duration <= end_dt else None
            if probe < occ_end:
                probe = occ_end
        return (probe, probe + duration) if probe + duration <= end_dt else None

    for task in flexible:
        if focus_since_break >= 90:
            gap = next_gap(cursor, 15)
            if gap:
                items.append(ScheduleItem(
                    title="Recharge break", start=gap[0].time(), end=gap[1].time(),
                    kind="break", note="Step away, stretch, and reset.",
                ))
                occupied.append(gap)
                cursor = gap[1]
                focus_since_break = 0
        gap = next_gap(cursor, task.duration_minutes)
        if gap is None:
            unscheduled.append(task)
            continue
        items.append(ScheduleItem(
            task_id=task.id, title=task.title, start=gap[0].time(), end=gap[1].time(),
            kind="task", priority=task.priority,
            note=f"{task.duration_minutes} min focus block" + (f" · due {task.due_label.lower()}" if task.due_label else ""),
        ))
        occupied.append(gap)
        cursor = gap[1]
        focus_since_break += task.duration_minutes
        if focus_since_break >= 90:
            break_gap = next_gap(cursor, 15)
            if break_gap:
                items.append(ScheduleItem(
                    title="Recharge break", start=break_gap[0].time(), end=break_gap[1].time(),
                    kind="break", note="Step away, stretch, and reset.",
                ))
                occupied.append(break_gap)
                cursor = break_gap[1]
                focus_since_break = 0

    items.extend(events)
    items.sort(key=lambda item: (item.start, item.end))
    focus_minutes = sum(int((datetime.combine(day, item.end) - datetime.combine(day, item.start)).total_seconds() // 60) for item in items if item.kind == "task")
    break_minutes = sum(int((datetime.combine(day, item.end) - datetime.combine(day, item.start)).total_seconds() // 60) for item in items if item.kind == "break")
    return PlanResponse(plan_date=day, items=items, unscheduled=unscheduled, focus_minutes=focus_minutes, break_minutes=break_minutes)

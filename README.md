# Daymark · Personal Task Planner

Daymark turns a short note about your day into an editable task list and a practical daily schedule. It can identify deadlines and fixed-time commitments, prioritize tasks, place work inside your available hours, and add recovery breaks. The responsive browser UI lets you add, complete, or remove tasks and rebuild the plan as your day changes.

The first version uses a small, transparent rules-based planner and runs locally without an API key or external AI service. Parsed tasks are suggestions: review and edit the list before building your schedule. Task data is saved in your browser's local storage.

## Run locally

From the repository root, create an environment and install the app:

    python3 -m venv .venv
    source .venv/bin/activate
    python -m pip install -e ".[dev]"
    python -m uvicorn app.main:app --reload

On Windows PowerShell, activate the environment with the PowerShell activation script in .venv\Scripts. Then open http://127.0.0.1:8000. Interactive API documentation is available at /docs.

## Example

Enter:

> I have a SQL assignment tomorrow, gym at 7 PM, and an interview next week. Prepare today's plan.

Daymark suggests three entries: a high-priority SQL assignment due tomorrow, a fixed 7 PM gym commitment, and interview preparation due next week. You can adjust priority, duration, availability, or remove any suggestion before generating the timeline.

## What it includes

- Natural-language task intake for simple lists and relative deadlines such as today, tomorrow, and next week.
- Recognition of fixed events with explicit times such as gym at 7 PM.
- Editable priorities, durations, due dates, completion state, and task removal.
- A schedule that respects available hours and fixed events, flags tasks that do not fit, and adds breaks after extended focus.
- Responsive UI for desktop and mobile; tasks persist in the current browser.
- JSON endpoints at POST /api/parse, POST /api/plan, and GET /api/health.

The parser is intentionally lightweight. It works best with short, clearly separated task phrases; inspect its suggestions for ambiguous wording or dates before relying on the generated plan.

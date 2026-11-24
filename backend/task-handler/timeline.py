"""Timeline is derived from Task records: pure functions, no storage and no HTTP."""
from datetime import date, timedelta

STATUSES = ("To Do", "In Progress", "In Review", "Done")
DUE_SOON_DAYS = 3


def schedule_of(task):
    """(start, end) ISO dates for a task, or None when it has no dates at all.

    A task with only one date is drawn as a one-day bar on that date.
    """
    start = task.get("startDate") or task.get("dueDate")
    end = task.get("dueDate") or task.get("startDate")
    return (start, end) if start else None


def compute_stats(tasks, today):
    """Overall completion statistics for the given tasks (not limited by date window)."""
    today_iso = today.isoformat()
    soon_iso = (today + timedelta(days=DUE_SOON_DAYS)).isoformat()
    by_status = {status: 0 for status in STATUSES}
    overdue = due_soon = unscheduled = 0
    for task in tasks:
        by_status[task.get("status", "To Do")] = by_status.get(task.get("status", "To Do"), 0) + 1
        if schedule_of(task) is None:
            unscheduled += 1
        due = task.get("dueDate")
        if due and task.get("status") != "Done":
            if due < today_iso:
                overdue += 1
            elif due <= soon_iso:
                due_soon += 1
    total = len(tasks)
    done = by_status["Done"]
    return {
        "total": total,
        "done": done,
        "completionRate": round(done * 100 / total) if total else 0,
        "byStatus": by_status,
        "overdue": overdue,
        "dueSoon": due_soon,
        "unscheduled": unscheduled,
    }


def build_timeline(tasks, start_date="", end_date="", today=None):
    """Timeline entries overlapping [start_date, end_date] plus overall stats.

    Tasks without any date are not drawn but are counted in stats.unscheduled.
    """
    today = today or date.today()
    entries = []
    for task in tasks:
        span = schedule_of(task)
        if span is None:
            continue
        start, end = span
        if start_date and end < start_date:
            continue
        if end_date and start > end_date:
            continue
        entries.append(
            {
                "taskId": task["taskId"],
                "title": task.get("title", ""),
                "assignee": task.get("assignee", ""),
                "category": task.get("category", ""),
                "priority": task.get("priority", ""),
                "status": task.get("status", ""),
                "startDate": task.get("startDate", ""),
                "dueDate": task.get("dueDate", ""),
                "start": start,
                "end": end,
            }
        )
    entries.sort(key=lambda e: (e["start"], e["end"], e["title"].lower()))
    return {"tasks": entries, "stats": compute_stats(tasks, today)}

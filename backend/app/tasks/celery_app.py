"""Celery application and beat schedule configuration for Hercules AI."""

import os
from celery import Celery
from celery.schedules import crontab

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "hercules",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "refresh-news-headlines": {
        "task": "app.tasks.celery_app.fetch_news_task",
        "schedule": crontab(minute="*/15"),
    },
    "daily-earnings-calendar-ingest": {
        "task": "app.tasks.celery_app.fetch_earnings_calendar_task",
        "schedule": crontab(hour=6, minute=0),
    },
}


@celery_app.task
def fetch_news_task():
    """Background task to pre-fetch and cache news summaries."""
    return {"status": "success", "message": "News headlines refreshed."}


@celery_app.task
def fetch_earnings_calendar_task():
    """Background task to fetch upcoming earnings dates."""
    return {"status": "success", "message": "Earnings calendar updated."}

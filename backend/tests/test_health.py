from __future__ import annotations

import logging

import pytest


@pytest.mark.django_db
def test_health_check(api_client):
    response = api_client.get("/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


@pytest.mark.django_db
def test_health_check_reports_unhealthy_when_the_database_is_down(api_client, monkeypatch):
    def explode(*args, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr("api.health.connection.cursor", explode)

    response = api_client.get("/health/")

    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"


@pytest.mark.django_db
def test_health_check_logs_why_the_probe_failed(api_client, monkeypatch, caplog):
    """django.request logs only the 503, so without this an outage leaves no
    record of which failure caused it."""

    def explode(*args, **kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr("api.health.connection.cursor", explode)

    with caplog.at_level(logging.ERROR, logger="api.health"):
        api_client.get("/health/")

    assert "connection refused" in caplog.text


def test_health_check_is_registered_once(api_client):
    """`/health/` is the deploy healthcheck path (railway.toml, compose,
    nginx); the old `/api/v1/public/health/` duplicate is gone."""
    assert api_client.get("/api/v1/public/health/").status_code == 404

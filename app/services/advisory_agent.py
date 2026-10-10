"""Generates a natural-language safety advisory for a school.

Uses the AWS Strands Agents SDK (open source) to drive an LLM-backed agent
with tool access to live AQI + risk data, when ANTHROPIC_API_KEY is set.
Falls back to a deterministic template built from the same tools when no
LLM key is configured, so the app always produces a correct, working
advisory — with or without an API key.
"""
from __future__ import annotations

import os
from dataclasses import asdict

from strands import Agent, tool

from . import aqi_source, risk

_SYSTEM_PROMPT = """You are SafeRecess, a school air-quality safety advisor for Delhi-NCR, India.
You have tools to look up a school's live AQI reading and its risk assessment.
Always call the tools rather than guessing numbers.
Write a short advisory (under 110 words) for school staff:
1. State the AQI number and category in plain language.
2. State the single most important action for today.
3. List 2-3 concrete bullet actions.
4. Briefly note why children are more at risk than adults at this level.
Be calm and practical, not alarmist. Do not invent data the tools did not return."""


def _build_tools(school: dict):
    @tool
    def get_current_aqi() -> dict:
        """Get the live (or latest offline) AQI reading nearest this school."""
        reading = aqi_source.get_reading(
            school["lat"], school["lon"], school["fallback_station_id"]
        )
        return asdict(reading)

    @tool
    def get_risk_assessment(aqi: int) -> dict:
        """Get the school-safety risk level and recommended actions for a given AQI value."""
        level = risk.assess(aqi, school.get("age_group", "mixed"))
        return asdict(level)

    return [get_current_aqi, get_risk_assessment]


def _make_model():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return None
    from strands.models.anthropic import AnthropicModel

    return AnthropicModel(
        model_id=os.environ.get("ANTHROPIC_MODEL_ID", "claude-haiku-4-5-20251001"),
        max_tokens=400,
    )


def _fallback_advisory(reading: "aqi_source.Reading", level: "risk.RiskLevel") -> str:
    bullets = "\n".join(f"- {a}" for a in level.actions)
    live_tag = "live reading" if reading.is_live else "latest available reading (offline snapshot)"
    return (
        f"{level.label.upper()} — AQI {reading.aqi} ({reading.category}) at {reading.name}, "
        f"{live_tag}, updated {reading.updated_local}.\n\n"
        f"{level.headline} {level.why}\n\n"
        f"Recommended actions:\n{bullets}\n\n"
        f"Why it matters for children: kids breathe more air per kilogram of body weight than "
        f"adults and their lungs are still developing, so they absorb more pollution at the same AQI."
    )


def generate_advisory(school: dict) -> dict:
    """Return {"text", "mode": "agent"|"rule-based", "reading": {...}, "risk": {...}}."""
    reading = aqi_source.get_reading(school["lat"], school["lon"], school["fallback_station_id"])
    level = risk.assess(reading.aqi, school.get("age_group", "mixed"))

    model = _make_model()
    if model is None:
        return {
            "text": _fallback_advisory(reading, level),
            "mode": "rule-based",
            "reading": asdict(reading),
            "risk": asdict(level),
        }

    agent = Agent(model=model, tools=_build_tools(school), system_prompt=_SYSTEM_PROMPT)
    try:
        result = agent(
            f"Write today's advisory for {school['name']} "
            f"({school.get('age_group', 'mixed')} school) in {school['area']}."
        )
        return {
            "text": str(result),
            "mode": "agent",
            "reading": asdict(reading),
            "risk": asdict(level),
        }
    except Exception as exc:  # network/model errors must not break the demo
        return {
            "text": _fallback_advisory(reading, level),
            "mode": "rule-based",
            "reading": asdict(reading),
            "risk": asdict(level),
            "agent_error": str(exc),
        }

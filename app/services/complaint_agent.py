"""The core Nigrani agent: looks at a citizen's photo report and produces a
verified, routed, scored verdict in one agentic pass.

Design choice: the agent sees the photo directly as native multi-modal
input (not through a separate "classify_evidence" tool call), so the
regulatory facts -- today's GRAP stage, which agency owns this location,
who's downwind -- stay deterministic Python grounded in real data, and
only the genuinely visual judgment (what's in the photo, does it look
authentic) goes through the model. This avoids the agent ever guessing a
GRAP rule or a jurisdiction boundary.

Model selection, in order: AWS Bedrock (if AWS credentials + Bedrock model
access are configured) -> direct Anthropic API (if ANTHROPIC_API_KEY is
set) -> unavailable, in which case the complaint is marked for manual
review rather than given a fabricated verdict. Unlike a numeric risk
threshold, there is no honest non-AI way to classify an arbitrary photo's
contents, so "unavailable" is the correct fallback here, not a guess.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field
from strands import Agent, tool

from . import aqi_source, exposure, grap, jurisdiction

Category = Literal["garbage_burning", "construction_dust", "uncovered_debris", "industrial_smoke", "unclear"]
Priority = Literal["low", "medium", "high"]


class ComplaintVerdict(BaseModel):
    category: Category = Field(description="What the photo actually shows")
    category_confidence: float = Field(ge=0, le=1)
    photo_context_plausible: bool = Field(
        description="Does the visual context (terrain, buildings, signage, lighting) plausibly match an "
        "outdoor Delhi-NCR pollution scene, as opposed to e.g. a stock photo or unrelated image?"
    )
    priority: Priority = Field(
        description="Overall priority combining GRAP violation severity, downwind exposure, and duplicate count"
    )
    summary: str = Field(description="One or two sentence human-readable summary for the officer queue")


class ClosureVerdict(BaseModel):
    same_location: bool = Field(description="Do the before/after photos show the same physical place?")
    issue_resolved: bool = Field(description="Does the after photo show the reported issue has actually been fixed?")
    confidence: float = Field(ge=0, le=1)
    reasoning: str = Field(description="One sentence explaining the verdict")


_VERIFY_SYSTEM_PROMPT = """You are Nigrani, an AI agent that verifies citizen pollution complaints in Delhi-NCR, India.

You are shown a photo a citizen submitted, their claimed location, and a short description.
1. Decide which category the photo actually shows: garbage_burning, construction_dust, uncovered_debris,
   industrial_smoke, or unclear (if it doesn't clearly show a pollution issue).
2. Call check_grap_stage with that category -- always call it, never guess today's GRAP stage or whether
   this is a violation yourself.
3. Call find_jurisdiction with the claimed coordinates to get the responsible agency.
4. Call exposure_score with the claimed coordinates to see if schools/hospitals are downwind right now.
5. Set priority: high if there's meaningful downwind exposure AND a high-severity GRAP violation; medium
   for a clear violation with low/no exposure; low for unclear photos or minor issues.
6. Write a one-two sentence summary an enforcement officer can read in three seconds, referencing the
   GRAP rule and/or exposure if relevant.

Be skeptical: flag in photo_context_plausible=false anything that looks like a stock image, an unrelated
scene, or doesn't look like outdoor Delhi-NCR at all. Only use what your tools return -- never invent a
GRAP stage, an agency name, or an exposure number yourself."""

_CLOSURE_SYSTEM_PROMPT = """You are Nigrani, verifying whether a pollution complaint was actually fixed.

You are shown two photos: BEFORE (when the complaint was filed) and AFTER (the officer's closure photo),
plus the complaint's original category and location. Decide:
1. same_location: do both photos show the same physical spot (same buildings, angle, landmarks)?
2. issue_resolved: does the AFTER photo show the original issue is actually gone (fire out, site cleared,
   debris removed, dust mitigated)?
Be strict: if the location doesn't clearly match, or the issue is still visible, say so. A vague or
unrelated AFTER photo should fail, not pass on the benefit of the doubt."""


def _build_tools():
    @tool
    def check_grap_stage(category: str) -> dict:
        """Look up today's regional GRAP stage and whether this complaint category is a violation at it."""
        aqi = aqi_source.regional_aqi()
        return grap.evaluate_violation(category, aqi)

    @tool
    def find_jurisdiction_tool(lat: float, lon: float) -> dict:
        """Look up which civic agency is responsible for this location."""
        return jurisdiction.find_jurisdiction(lat, lon)

    @tool
    def exposure_score_tool(lat: float, lon: float) -> dict:
        """Score whether schools/hospitals are currently downwind of this location."""
        return exposure.score_exposure(lat, lon)

    return [check_grap_stage, find_jurisdiction_tool, exposure_score_tool]


def _make_model():
    """Bedrock first (needs BEDROCK_MODEL_ID + the account's Bedrock model
    access enabled for it), then direct Anthropic, else None.

    Deliberately does NOT gate on AWS_ACCESS_KEY_ID being set: in production
    (e.g. App Runner) credentials come from an attached IAM instance role via
    instance metadata, never as an env var, and boto3's default credential
    chain resolves that automatically. Only AWS_ENDPOINT_URL (LocalStack) is
    explicit about wanting non-default credentials."""
    bedrock_model_id = os.environ.get("BEDROCK_MODEL_ID")
    if bedrock_model_id:
        from strands.models.bedrock import BedrockModel

        return BedrockModel(
            model_id=bedrock_model_id,
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if api_key:
        from strands.models.anthropic import AnthropicModel

        return AnthropicModel(
            model_id=os.environ.get("ANTHROPIC_MODEL_ID", "claude-haiku-4-5-20251001"),
            max_tokens=600,
        )

    return None


def _image_format(photo_bytes: bytes) -> str:
    from .evidence import read_photo_meta

    return read_photo_meta(photo_bytes).format


def verify_complaint(
    photo_bytes: bytes,
    claimed_lat: float,
    claimed_lon: float,
    description: str,
) -> dict:
    """Returns {"verdict": ComplaintVerdict-shaped dict, "mode": "agent"|"unavailable"}."""
    model = _make_model()
    if model is None:
        return {
            "verdict": None,
            "mode": "unavailable",
            "note": "No vision-capable model configured (set BEDROCK_MODEL_ID + AWS credentials, or "
            "ANTHROPIC_API_KEY). This complaint needs manual review until one is.",
        }

    agent = Agent(model=model, tools=_build_tools(), system_prompt=_VERIFY_SYSTEM_PROMPT)
    prompt = [
        {"image": {"format": _image_format(photo_bytes), "source": {"bytes": photo_bytes}}},
        {
            "text": f"Claimed location: {claimed_lat}, {claimed_lon}\n"
            f"Citizen's description: {description or '(none given)'}"
        },
    ]
    try:
        result = agent(prompt, structured_output_model=ComplaintVerdict)
        verdict: ComplaintVerdict = result.structured_output
        return {"verdict": verdict.model_dump(), "mode": "agent", "note": None}
    except Exception as exc:
        return {"verdict": None, "mode": "unavailable", "note": f"Agent call failed: {exc}"}


def verify_closure(
    before_photo_bytes: bytes,
    after_photo_bytes: bytes,
    category: str,
    claimed_lat: float,
    claimed_lon: float,
) -> dict:
    """Returns {"verdict": ClosureVerdict-shaped dict, "mode": "agent"|"unavailable"}."""
    model = _make_model()
    if model is None:
        return {
            "verdict": None,
            "mode": "unavailable",
            "note": "No vision-capable model configured — closure cannot be auto-verified; "
            "route to manual review rather than auto-closing.",
        }

    agent = Agent(model=model, tools=[], system_prompt=_CLOSURE_SYSTEM_PROMPT)
    prompt = [
        {"text": "BEFORE photo:"},
        {"image": {"format": _image_format(before_photo_bytes), "source": {"bytes": before_photo_bytes}}},
        {"text": "AFTER photo:"},
        {"image": {"format": _image_format(after_photo_bytes), "source": {"bytes": after_photo_bytes}}},
        {"text": f"Original category: {category}. Claimed location: {claimed_lat}, {claimed_lon}."},
    ]
    try:
        result = agent(prompt, structured_output_model=ClosureVerdict)
        verdict: ClosureVerdict = result.structured_output
        return {"verdict": verdict.model_dump(), "mode": "agent", "note": None}
    except Exception as exc:
        return {"verdict": None, "mode": "unavailable", "note": f"Agent call failed: {exc}"}

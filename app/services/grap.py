"""GRAP (Graded Response Action Plan) stage lookup and violation checking.

CAQM ties GRAP stages to Delhi's AQI band:
  Stage I   "Poor"        AQI 201-300
  Stage II  "Very Poor"   AQI 301-400
  Stage III "Severe"      AQI 401-450
  Stage IV  "Severe+"     AQI > 450
Below 201 AQI, no GRAP stage is in force.

This module encodes a simplified version of what each stage bans, by
complaint category, for the purpose of flagging a complaint's severity.
It is built from CAQM's publicly published GRAP schedule structure, not
copied verbatim, and should be swapped for the live CAQM schedule (there
is no public real-time API for it) in a production deployment.
"""
from __future__ import annotations

from dataclasses import dataclass, field

CATEGORIES = [
    "garbage_burning",
    "construction_dust",
    "uncovered_debris",
    "industrial_smoke",
    "other",
]


@dataclass
class GrapStage:
    stage: int  # 0 = no GRAP stage in force
    name: str
    aqi_band: str
    headline: str
    construction_banned: bool
    exempted_categories: list[str] = field(default_factory=list)


_STAGES: list[GrapStage] = [
    GrapStage(
        stage=0, name="None", aqi_band="AQI ≤ 200",
        headline="No GRAP stage in force.",
        construction_banned=False,
    ),
    GrapStage(
        stage=1, name="Stage I – Poor", aqi_band="AQI 201–300",
        headline="Dust control mandatory at all construction/demolition sites; open burning banned.",
        construction_banned=False,
    ),
    GrapStage(
        stage=2, name="Stage II – Very Poor", aqi_band="AQI 301–400",
        headline="Stricter dust control; diesel generator sets restricted except essential services.",
        construction_banned=False,
    ),
    GrapStage(
        stage=3, name="Stage III – Severe", aqi_band="AQI 401–450",
        headline="All construction & demolition banned, with narrow exemptions. Stone crushing and mining banned.",
        construction_banned=True,
        exempted_categories=[
            "railways", "metro", "airports", "national security / defence",
            "hospitals / health infrastructure", "highways, roads, sanitation, water supply projects",
        ],
    ),
    GrapStage(
        stage=4, name="Stage IV – Severe+", aqi_band="AQI > 450",
        headline="All Stage III measures continue; truck entry into Delhi banned except essential goods.",
        construction_banned=True,
        exempted_categories=[
            "railways", "metro", "airports", "national security / defence",
            "hospitals / health infrastructure", "highways, roads, sanitation, water supply projects",
        ],
    ),
]


def stage_for_aqi(aqi: int) -> GrapStage:
    if aqi <= 200:
        return _STAGES[0]
    if aqi <= 300:
        return _STAGES[1]
    if aqi <= 400:
        return _STAGES[2]
    if aqi <= 450:
        return _STAGES[3]
    return _STAGES[4]


def evaluate_violation(category: str, aqi: int) -> dict:
    """Decide whether a reported category is a GRAP violation at this AQI,
    and how severe it is. 'garbage_burning' and 'uncovered_debris' are
    treated as always-banned (true regardless of GRAP stage, under the
    general Air Act); 'construction_dust' and 'industrial_smoke' escalate
    in severity as the GRAP stage rises."""
    stage = stage_for_aqi(aqi)

    if category == "garbage_burning":
        return {
            "is_violation": True,
            "severity": "high",
            "grap_stage": stage.stage,
            "grap_stage_name": stage.name,
            "rule": "Open burning of waste/biomass is banned at all times under the Air Act; "
                    "enforcement intensifies at every GRAP stage.",
        }

    if category == "uncovered_debris":
        return {
            "is_violation": True,
            "severity": "high" if stage.stage >= 3 else "medium",
            "grap_stage": stage.stage,
            "grap_stage_name": stage.name,
            "rule": "Transporting uncovered construction & demolition debris is banned at all GRAP stages; "
                    "at Stage III/IV this overlaps with the truck-entry ban into Delhi.",
        }

    if category == "construction_dust":
        if stage.construction_banned:
            return {
                "is_violation": True,
                "severity": "high",
                "grap_stage": stage.stage,
                "grap_stage_name": stage.name,
                "rule": f"{stage.name}: all construction/demolition activity is banned "
                        f"(exemptions: {', '.join(stage.exempted_categories)}). Any active site is a violation "
                        f"unless it falls under an exempted category.",
            }
        return {
            "is_violation": True,
            "severity": "low",
            "grap_stage": stage.stage,
            "grap_stage_name": stage.name,
            "rule": f"{stage.name}: construction itself is permitted, but dust-mitigation measures "
                    f"(site covering, anti-smog guns, water sprinkling) are mandatory. Flag only if evidence "
                    f"shows mitigation is absent.",
        }

    if category == "industrial_smoke":
        return {
            "is_violation": True,
            "severity": "high" if stage.stage >= 3 else "medium",
            "grap_stage": stage.stage,
            "grap_stage_name": stage.name,
            "rule": "Industrial emissions are subject to standing emission norms at all times; "
                    f"{stage.name} adds fuel-switching and curb requirements for some categories.",
        }

    return {
        "is_violation": False,
        "severity": "unknown",
        "grap_stage": stage.stage,
        "grap_stage_name": stage.name,
        "rule": "Category not recognised — needs manual review.",
    }

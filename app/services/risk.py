"""Risk scoring: converts a raw AQI reading into a school-safety advisory.

Thresholds are tighter than general-public AQI guidance, because children
are a recognised sensitive group: they breathe more air per kilogram of
body weight than adults, and their lungs are still developing. Primary-age
schools get bumped one level stricter still.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RiskLevel:
    level: int  # 0 (best) .. 5 (worst)
    label: str
    color: str  # standard AQI hex color
    headline: str
    why: str
    actions: list[str] = field(default_factory=list)


_LEVELS: list[RiskLevel] = [
    RiskLevel(
        level=0, label="Safe", color="#009966",
        headline="Air quality is fine for normal school activity.",
        why="AQI is in the Good range for most of the day.",
        actions=[
            "Recess, PE and outdoor assembly can run as usual.",
            "No special precautions needed today.",
        ],
    ),
    RiskLevel(
        level=1, label="Caution", color="#ffde33",
        headline="Mostly fine, but watch sensitive students.",
        why="AQI is Moderate — a small number of sensitive children may notice it.",
        actions=[
            "Normal outdoor activity can continue.",
            "Students with asthma or respiratory conditions should keep inhalers handy.",
            "Watch for coughing or breathlessness during outdoor sport.",
        ],
    ),
    RiskLevel(
        level=2, label="Limit Outdoor Time", color="#ff9933",
        headline="Shorten outdoor time, move sensitive students indoors.",
        why="AQI is Unhealthy for Sensitive Groups, and children count as a sensitive group.",
        actions=[
            "Cut outdoor PE / recess to under 30 minutes.",
            "Move students with asthma, allergies or heart/lung conditions indoors.",
            "Skip strenuous outdoor sport such as running or football practice.",
        ],
    ),
    RiskLevel(
        level=3, label="Move Indoors", color="#cc0033",
        headline="Cancel outdoor recess and PE for the day.",
        why="AQI is Unhealthy — this affects everyone, not just sensitive groups.",
        actions=[
            "Cancel outdoor recess, PE and assembly; move activities indoors.",
            "Keep windows and doors closed where possible.",
            "Masks (N95/KN95) recommended for anyone who must go outside.",
            "Flag students with existing respiratory conditions to the school nurse.",
        ],
    ),
    RiskLevel(
        level=4, label="Lockdown-Lite", color="#660099",
        headline="Minimise all outdoor exposure today.",
        why="AQI is Very Unhealthy — a health warning of emergency conditions.",
        actions=[
            "No outdoor activity at all, for any student.",
            "Minimise entry/exit through open doors; keep the building sealed.",
            "Masks mandatory for anyone outdoors, including gate and security staff.",
            "Notify parents of the conditions and the school's response.",
        ],
    ),
    RiskLevel(
        level=5, label="Consider Closure", color="#7e0023",
        headline="Escalate to leadership — consider early dismissal.",
        why="AQI is Hazardous — a health alert for the entire population.",
        actions=[
            "Escalate to school leadership and check local government advisories.",
            "If staying open, suspend all outdoor activity without exception.",
            "Make N95/KN95 masks mandatory for any outdoor movement.",
            "Prepare parents for possible early dismissal.",
        ],
    ),
]

_AGE_GROUP_OFFSET = {
    "primary": 1,
    "mixed": 0,
    "secondary": 0,
}


def _base_level_for_aqi(aqi: int) -> int:
    if aqi <= 50:
        return 0
    if aqi <= 100:
        return 1
    if aqi <= 150:
        return 2
    if aqi <= 200:
        return 3
    if aqi <= 300:
        return 4
    return 5


def assess(aqi: int, age_group: str = "mixed") -> RiskLevel:
    """Map an AQI value (+ the school's age group) to a RiskLevel.

    Primary schools get bumped one level stricter, since younger children
    are more sensitive at the same AQI reading than teenagers or adults.
    """
    level = _base_level_for_aqi(aqi)
    level = min(level + _AGE_GROUP_OFFSET.get(age_group, 0), len(_LEVELS) - 1)
    return _LEVELS[level]

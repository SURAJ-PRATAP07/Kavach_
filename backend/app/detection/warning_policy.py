from dataclasses import dataclass
from enum import Enum

from app.detection.schemas import DetectionResult, ScamStage


class WarningLevel(str, Enum):
    MONITOR = "monitor"
    ADVISORY = "advisory"
    WARNING = "warning"


@dataclass(frozen=True)
class WarningDecision:
    """Explainable warning-policy output."""

    level: WarningLevel
    should_speak: bool
    reason_codes: tuple[str, ...]
    matched_rule_ids: tuple[str, ...]
    distinct_stages: tuple[str, ...]


def evaluate_warning_policy(
    detection: DetectionResult,
    consent_enabled: bool = False,
    warning_already_sent: bool = False,
) -> WarningDecision:
    """
    Evaluate cumulative scam evidence using distinct detected stages.
    This is a deterministic heuristic, not a fraud probability or verdict.
    Spoken warnings require explicit consent and are limited to one per
    session in the initial implementation.
    """
    distinct_stages_set: set[str] = set()
    matched_rule_ids_list: list[str] = []

    for assessment in detection.stage_assessments:
        stage_name = (
            assessment.stage.value
            if isinstance(assessment.stage, ScamStage)
            else assessment.stage
        )
        if assessment.evidence:
            distinct_stages_set.add(stage_name)
            for evidence in assessment.evidence:
                if evidence.rule_id not in matched_rule_ids_list:
                    matched_rule_ids_list.append(evidence.rule_id)

    # Sort stages deterministically in canonical ScamStage order
    canonical_order = [s.value for s in ScamStage]
    distinct_stages = tuple(
        s for s in canonical_order if s in distinct_stages_set
    )
    matched_rule_ids = tuple(matched_rule_ids_list)

    financial_present = ScamStage.FINANCIAL_EXTRACTION.value in distinct_stages_set
    stage_count = len(distinct_stages)

    reason_codes: list[str] = []

    if stage_count == 0:
        level = WarningLevel.MONITOR
        reason_codes.append("NO_SCAM_EVIDENCE")
    elif stage_count == 1:
        if financial_present:
            level = WarningLevel.ADVISORY
            reason_codes.append("FINANCIAL_EXTRACTION_ONLY")
        else:
            level = WarningLevel.MONITOR
            reason_codes.append("SINGLE_NON_FINANCIAL_STAGE")
    elif stage_count == 2:
        if financial_present:
            level = WarningLevel.WARNING
            reason_codes.append("FINANCIAL_PLUS_COERCION_STAGE")
        else:
            level = WarningLevel.ADVISORY
            reason_codes.append("TWO_NON_FINANCIAL_STAGES")
    else:  # stage_count >= 3
        level = WarningLevel.WARNING
        reason_codes.append("MULTIPLE_COERCION_STAGES")

    # Spoken warnings require level == WARNING, consent_enabled, and not warning_already_sent
    if level == WarningLevel.WARNING:
        if warning_already_sent:
            should_speak = False
            reason_codes.append("WARNING_ALREADY_SENT")
        elif not consent_enabled:
            should_speak = False
            reason_codes.append("CONSENT_NOT_GRANTED")
        else:
            should_speak = True
            reason_codes.append("WARNING_TRIGGERED")
    else:
        should_speak = False

    return WarningDecision(
        level=level,
        should_speak=should_speak,
        reason_codes=tuple(reason_codes),
        matched_rule_ids=matched_rule_ids,
        distinct_stages=distinct_stages,
    )

import re

from app.detection.rules import RULES, DetectionRule
from app.detection.schemas import (
    DetectionEvidence,
    DetectionResult,
    ScamStage,
    StageAssessment,
    TranscriptSegment,
)


def _find_match(
    text: str,
    rule: DetectionRule,
) -> tuple[str, int] | None:
    """Return the first matching phrase and its original text offset."""

    for pattern in rule.patterns:
        flexible_pattern = pattern.replace(" ", r"\s+")
        match = re.search(
            flexible_pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            return match.group(0), match.start()

    return None


def detect_segments(
    segments: list[TranscriptSegment],
) -> DetectionResult:
    """Detect initial multilingual scam signals in transcript segments."""

    evidence_by_stage: dict[ScamStage, list[DetectionEvidence]] = {
        stage: [] for stage in ScamStage
    }

    for segment in segments:
        detected_rule_ids: set[str] = set()

        for rule in RULES:
            if rule.rule_id in detected_rule_ids:
                continue

            match = _find_match(segment.text, rule)

            if match is None:
                continue

            matched_text, _ = match

            evidence_by_stage[rule.stage].append(
                DetectionEvidence(
                    stage=rule.stage,
                    rule_id=rule.rule_id,
                    matched_text=matched_text,
                    transcript_text=segment.text,
                    reason=rule.reason,
                    signal_strength=rule.signal_strength,
                    source=segment.source,
                    segment_id=segment.segment_id,
                    segment_index=segment.segment_index,
                    timestamp=segment.timestamp,
                )
            )

            detected_rule_ids.add(rule.rule_id)

    assessments = [
        StageAssessment(
            stage=stage,
            evidence=evidence_by_stage[stage],
        )
        for stage in ScamStage
    ]

    return DetectionResult(
        segments_analyzed=len(segments),
        stage_assessments=assessments,
    )
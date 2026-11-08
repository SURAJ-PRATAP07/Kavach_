import pytest
from pydantic import ValidationError

from app.detection.schemas import (
    DetectionEvidence,
    DetectionResult,
    ScamStage,
    SignalStrength,
    StageAssessment,
    TranscriptSegment,
    TranscriptSource,
)


def test_transcript_segment_accepts_streaming_metadata():
    segment = TranscriptSegment(
        text="  Aap police station se bol rahe hain.  ",
        source="streaming",
        segment_id="segment-001",
        segment_index=0,
        timestamp=None,
        audio_duration_ms=1200,
        language_code="hi-IN",
    )

    assert segment.text == "Aap police station se bol rahe hain."
    assert segment.segment_id == "segment-001"
    assert segment.source == TranscriptSource.STREAMING


def test_transcript_segment_accepts_rest_without_segment_metadata():
    segment = TranscriptSegment(
        text="This is a test transcript.",
        source="rest",
    )

    assert segment.source == TranscriptSource.REST
    assert segment.segment_id is None
    assert segment.timestamp is None


def test_transcript_segment_rejects_empty_text():
    with pytest.raises(ValidationError):
        TranscriptSegment(
            text="   ",
            source="rest",
        )


def test_transcript_segment_rejects_negative_segment_index():
    with pytest.raises(ValidationError):
        TranscriptSegment(
            text="Test transcript.",
            source="streaming",
            segment_index=-1,
        )


def test_detection_evidence_preserves_explanation():
    evidence = DetectionEvidence(
        stage=ScamStage.THREATS,
        rule_id="THREAT_ARREST_CLAIM",
        matched_text="arrest warrant",
        transcript_text="An arrest warrant has been issued.",
        reason="The speaker claims that an arrest warrant exists.",
        signal_strength=SignalStrength.HIGH,
        source=TranscriptSource.STREAMING,
        segment_id="segment-001",
    )

    assert evidence.stage == ScamStage.THREATS
    assert evidence.rule_id == "THREAT_ARREST_CLAIM"
    assert evidence.signal_strength == SignalStrength.HIGH
    assert evidence.segment_id == "segment-001"


def test_stage_assessment_supports_no_detected_evidence():
    assessment = StageAssessment(
        stage=ScamStage.IMPERSONATION,
        evidence=[],
    )

    assert assessment.evidence == []


def test_detection_result_serializes_to_json():
    result = DetectionResult(
        segments_analyzed=1,
        stage_assessments=[
            StageAssessment(
                stage=ScamStage.THREATS,
                evidence=[
                    DetectionEvidence(
                        stage=ScamStage.THREATS,
                        rule_id="THREAT_ARREST_CLAIM",
                        matched_text="arrest warrant",
                        transcript_text="An arrest warrant has been issued.",
                        reason="A possible arrest threat was detected.",
                        signal_strength=SignalStrength.HIGH,
                        source=TranscriptSource.REST,
                    )
                ],
            )
        ],
    )

    data = result.model_dump(mode="json")

    assert data["segments_analyzed"] == 1
    assert data["stage_assessments"][0]["stage"] == "threats"
    assert data["stage_assessments"][0]["evidence"][0]["rule_id"] == (
        "THREAT_ARREST_CLAIM"
    )
    assert "do not independently confirm" in data["disclaimer"]


def test_schema_rejects_unexpected_fields():
    with pytest.raises(ValidationError):
        TranscriptSegment(
            text="Test transcript.",
            source="rest",
            unexpected_field="not allowed",
        )

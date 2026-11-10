from app.detection.conversation import ConversationDetectionAccumulator
from app.detection.schemas import TranscriptSegment


def make_segment(text: str, segment_id: str) -> TranscriptSegment:
    return TranscriptSegment(
        text=text,
        source="streaming",
        segment_id=segment_id,
    )


def get_stage(result, stage_name: str):
    return next(
        assessment
        for assessment in result.stage_assessments
        if assessment.stage == stage_name
    )


def test_accumulator_collects_evidence_across_segments():
    accumulator = ConversationDetectionAccumulator()

    first_result = accumulator.add_segment(
        make_segment("You will be arrested.", "segment-1")
    )
    second_result = accumulator.add_segment(
        make_segment("Namaste, yeh ek test hai.", "segment-2")
    )

    assert first_result.segments_analyzed == 1
    assert second_result.segments_analyzed == 2

    threats = get_stage(second_result, "threats")
    assert len(threats.evidence) == 1
    assert threats.evidence[0].segment_id == "segment-1"


def test_accumulator_preserves_evidence_from_repeated_segments():
    accumulator = ConversationDetectionAccumulator()

    accumulator.add_segment(
        make_segment("You will be arrested.", "segment-1")
    )
    result = accumulator.add_segment(
        make_segment("You will be arrested.", "segment-2")
    )

    threats = get_stage(result, "threats")

    assert result.segments_analyzed == 2
    assert len(threats.evidence) == 2
    assert [
        evidence.segment_id for evidence in threats.evidence
    ] == ["segment-1", "segment-2"]


def test_accumulator_keeps_harmless_segments_without_evidence():
    accumulator = ConversationDetectionAccumulator()

    accumulator.add_segment(
        make_segment("Namaste, yeh ek test hai.", "segment-1")
    )
    result = accumulator.add_segment(
        make_segment("How are you today?", "segment-2")
    )

    assert result.segments_analyzed == 2
    assert all(
        not assessment.evidence
        for assessment in result.stage_assessments
    )


def test_accumulators_are_isolated_between_sessions():
    first_session = ConversationDetectionAccumulator()
    second_session = ConversationDetectionAccumulator()

    first_session.add_segment(
        make_segment("You will be arrested.", "first-session-1")
    )
    second_result = second_session.add_segment(
        make_segment("Namaste, yeh ek test hai.", "second-session-1")
    )

    assert second_result.segments_analyzed == 1
    assert all(
        not assessment.evidence
        for assessment in second_result.stage_assessments
    )

    first_result = first_session.get_result()
    assert first_result.segments_analyzed == 1
    assert len(get_stage(first_result, "threats").evidence) == 1

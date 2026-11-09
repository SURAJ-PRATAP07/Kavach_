import pytest
from app.detection.engine import detect_segments
from app.detection.schemas import (
    ScamStage,
    TranscriptSegment,
    TranscriptSource,
)



def make_segment(text, index=0, source="rest"):
    return TranscriptSegment(
        text=text,
        source=source,
        segment_id=f"segment-{index:03d}",
        segment_index=index,
        language_code="hi-IN",
    )


@pytest.mark.parametrize(
    ("text", "stage", "rule_id"),
    [
        (
            "I am calling from the CBI.",
            ScamStage.IMPERSONATION,
            "IMPERSONATION_AUTHORITY_CLAIM",
        ),
        (
            "Main CBI se bol raha hoon.",
            ScamStage.IMPERSONATION,
            "IMPERSONATION_AUTHORITY_CLAIM",
        ),
        (
            "\u092e\u0948\u0902 \u092a\u0941\u0932\u093f\u0938 \u0935\u093f\u092d\u093e\u0917 \u0938\u0947 \u092c\u094b\u0932 \u0930\u0939\u093e \u0939\u0942\u0901\u0964",
            ScamStage.IMPERSONATION,
            "IMPERSONATION_AUTHORITY_CLAIM",
        ),
        (
            "You will be arrested.",
            ScamStage.THREATS,
            "THREAT_ARREST",
        ),
        (
            "Aapko giraftar kar liya jayega.",
            ScamStage.THREATS,
            "THREAT_ARREST",
        ),
        (
            "\u0906\u092a\u0915\u094b \u0917\u093f\u0930\u092b\u094d\u0924\u093e\u0930 \u0915\u0930 \u0932\u093f\u092f\u093e \u091c\u093e\u090f\u0917\u093e\u0964",
            ScamStage.THREATS,
            "THREAT_ARREST",
        ),
        (
            "Do not tell anyone about this call.",
            ScamStage.ISOLATION,
            "ISOLATION_SECRECY",
        ),
        (
            "Kisi ko mat batana.",
            ScamStage.ISOLATION,
            "ISOLATION_SECRECY",
        ),
        (
            "किसी को मत बताना।",
            ScamStage.ISOLATION,
            "ISOLATION_SECRECY",
        ),
        (
            "Transfer your money to a safe account.",
            ScamStage.FINANCIAL_EXTRACTION,
            "FINANCIAL_SAFE_ACCOUNT",
        ),
        (
            "Paise safe account mein transfer karo.",
            ScamStage.FINANCIAL_EXTRACTION,
            "FINANCIAL_SAFE_ACCOUNT",
        ),
    ],
)
def test_detects_initial_multilingual_scam_signals(text, stage, rule_id):
    segment = make_segment(text)

    result = detect_segments([segment])

    assessment = next(
        item for item in result.stage_assessments
        if item.stage == stage
    )

    matching_evidence = [
        item for item in assessment.evidence
        if item.rule_id == rule_id
    ]

    assert len(matching_evidence) == 1
    assert matching_evidence[0].transcript_text == text
    assert matching_evidence[0].segment_id == segment.segment_id


@pytest.mark.parametrize(
    "text",
    [
        "I visited the police station yesterday.",
        "The news reported an arrest this morning.",
        "My family sent a payment for the electricity bill.",
        "Please transfer the payment to the company account.",
        "The CBI investigation was discussed in the newspaper.",
        "I told my family about the phone call.",
    ],
)
def test_generic_legitimate_mentions_do_not_trigger_detection(text):
    result = detect_segments([make_segment(text)])

    assert all(
        not assessment.evidence
        for assessment in result.stage_assessments
    )


def test_result_contains_all_four_stages():
    result = detect_segments([])

    assert {
        item.stage for item in result.stage_assessments
    } == set(ScamStage)


def test_empty_input_reports_zero_segments():
    result = detect_segments([])

    assert result.segments_analyzed == 0


def test_multiple_segments_preserve_source_metadata():
    segments = [
        make_segment("I am calling from the CBI.", index=0),
        make_segment(
            "You will be arrested.",
            index=1,
            source="streaming",
        ),
    ]

    result = detect_segments(segments)

    evidence = [
        item
        for assessment in result.stage_assessments
        for item in assessment.evidence
    ]

    assert result.segments_analyzed == 2
    assert len(evidence) == 2

    assert evidence[0].segment_id == "segment-000"
    assert evidence[0].source == TranscriptSource.REST

    assert evidence[1].segment_id == "segment-001"
    assert evidence[1].source == TranscriptSource.STREAMING


def test_repeated_phrase_does_not_duplicate_same_rule_evidence():
    text = "I am calling from the CBI. I am calling from the CBI."

    result = detect_segments([make_segment(text)])

    impersonation = next(
        item for item in result.stage_assessments
        if item.stage == ScamStage.IMPERSONATION
    )

    matching_evidence = [
        item for item in impersonation.evidence
        if item.rule_id == "IMPERSONATION_AUTHORITY_CLAIM"
    ]

    assert len(matching_evidence) == 1

@pytest.mark.parametrize(
    "text",
    [
        "I am not calling from the CBI.",
        "You will not be arrested.",
        "I am not a police officer.",
    ],
)
def test_explicitly_negated_authority_and_arrest_claims_do_not_trigger(text):
    result = detect_segments([make_segment(text)])

    assert all(
        not assessment.evidence
        for assessment in result.stage_assessments
    )

def test_reported_arrest_threat_is_still_detected():
    text = "The caller told me I would be arrested."

    result = detect_segments([make_segment(text)])

    threats = next(
        item for item in result.stage_assessments
        if item.stage == ScamStage.THREATS
    )

    assert any(
        item.rule_id == "THREAT_ARREST"
        for item in threats.evidence
    )


def test_evidence_preserves_exact_match_and_timestamp():
    text = "Please listen. You will be arrested. Do not panic."

    segment = TranscriptSegment(
        text=text,
        source="streaming",
        segment_id="segment-timestamp",
        segment_index=7,
        timestamp=12.5,
        language_code="en-IN",
    )

    result = detect_segments([segment])

    threats = next(
        item for item in result.stage_assessments
        if item.stage == ScamStage.THREATS
    )

    evidence = next(
        item for item in threats.evidence
        if item.rule_id == "THREAT_ARREST"
    )

    assert evidence.matched_text == "You will be arrested"
    assert evidence.matched_text in evidence.transcript_text
    assert evidence.transcript_text == text
    assert evidence.timestamp == 12.5
    assert evidence.segment_index == 7
    assert evidence.segment_id == "segment-timestamp"


@pytest.mark.parametrize(
    ("text", "stage", "rule_id"),
    [
        (
            "मैं   पुलिस विभाग से बोल रहा हूँ।",
            ScamStage.IMPERSONATION,
            "IMPERSONATION_AUTHORITY_CLAIM",
        ),
        (
            "आपको गिरफ्तार    कर लिया जाएगा।",
            ScamStage.THREATS,
            "THREAT_ARREST",
        ),
        (
            "किसी को   इसके बारे में मत बताना।",
            ScamStage.ISOLATION,
            "ISOLATION_SECRECY",
        ),
        (
            "अपने पैसे सुरक्षित खाते में ट्रांसफर    करें।",
            ScamStage.FINANCIAL_EXTRACTION,
            "FINANCIAL_SAFE_ACCOUNT",
        ),
        (
            "I am calling    from the CBI.",
            ScamStage.IMPERSONATION,
            "IMPERSONATION_AUTHORITY_CLAIM",
        ),
    ],
)
def test_detection_tolerates_variable_whitespace(text, stage, rule_id):
    result = detect_segments([make_segment(text)])

    assessment = next(
        item for item in result.stage_assessments
        if item.stage == stage
    )

    evidence = [
        item for item in assessment.evidence
        if item.rule_id == rule_id
    ]

    assert len(evidence) == 1
    assert evidence[0].transcript_text == text
    assert evidence[0].matched_text in text

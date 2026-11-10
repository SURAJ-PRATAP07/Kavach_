from app.detection.engine import detect_segments
from app.detection.schemas import TranscriptSegment
from app.detection.warning_policy import (
    WarningLevel,
    evaluate_warning_policy,
)


def make_detection(*phrases: str):
    """Run the real detection engine on test transcript segments."""
    segments = [
        TranscriptSegment(
            text=phrase,
            source="streaming",
            segment_id=f"segment-{index}",
            segment_index=index,
        )
        for index, phrase in enumerate(phrases)
    ]
    return detect_segments(segments)


def test_empty_evidence_returns_monitor():
    result = make_detection("Hello, how are you?")
    decision = evaluate_warning_policy(result)
    assert decision.level == WarningLevel.MONITOR
    assert decision.should_speak is False
    assert decision.reason_codes == ("NO_SCAM_EVIDENCE",)


def test_single_threat_returns_monitor():
    result = make_detection("You will be arrested.")
    decision = evaluate_warning_policy(result)
    assert decision.level == WarningLevel.MONITOR
    assert decision.should_speak is False
    assert decision.distinct_stages == ("threats",)


def test_financial_extraction_alone_returns_advisory():
    result = make_detection(
        "Transfer your money to a safe account."
    )
    decision = evaluate_warning_policy(result)
    assert decision.level == WarningLevel.ADVISORY
    assert decision.should_speak is False
    assert decision.reason_codes == ("FINANCIAL_EXTRACTION_ONLY",)


def test_two_non_financial_stages_return_advisory():
    result = make_detection(
        "I am calling from the CBI.",
        "You will be arrested.",
    )
    decision = evaluate_warning_policy(result)
    assert decision.level == WarningLevel.ADVISORY
    assert decision.should_speak is False
    assert set(decision.distinct_stages) == {"impersonation", "threats"}


def test_financial_plus_threat_returns_warning():
    result = make_detection(
        "You will be arrested.",
        "Transfer your money to a safe account.",
    )
    decision = evaluate_warning_policy(result)
    assert decision.level == WarningLevel.WARNING
    assert set(decision.distinct_stages) == {"threats", "financial_extraction"}


def test_three_stages_return_warning():
    result = make_detection(
        "I am calling from the CBI.",
        "You will be arrested.",
        "Do not tell anyone about this call.",
    )
    decision = evaluate_warning_policy(result)
    assert decision.level == WarningLevel.WARNING
    assert set(decision.distinct_stages) == {"impersonation", "threats", "isolation"}


def test_warning_does_not_speak_without_consent():
    result = make_detection(
        "You will be arrested.",
        "Transfer your money to a safe account.",
    )
    decision = evaluate_warning_policy(result, consent_enabled=False)
    assert decision.level == WarningLevel.WARNING
    assert decision.should_speak is False
    assert "CONSENT_NOT_GRANTED" in decision.reason_codes


def test_warning_speaks_with_consent():
    result = make_detection(
        "You will be arrested.",
        "Transfer your money to a safe account.",
    )
    decision = evaluate_warning_policy(result, consent_enabled=True)
    assert decision.level == WarningLevel.WARNING
    assert decision.should_speak is True
    assert "WARNING_TRIGGERED" in decision.reason_codes


def test_warning_suppresses_repeat_speech():
    result = make_detection(
        "You will be arrested.",
        "Transfer your money to a safe account.",
    )
    decision = evaluate_warning_policy(
        result,
        consent_enabled=True,
        warning_already_sent=True,
    )
    assert decision.level == WarningLevel.WARNING
    assert decision.should_speak is False
    assert "WARNING_ALREADY_SENT" in decision.reason_codes


def test_matched_rule_ids_are_collected():
    result = make_detection(
        "I am calling from the CBI.",
        "Transfer your money to a safe account.",
    )
    decision = evaluate_warning_policy(result)
    assert "IMPERSONATION_AUTHORITY_CLAIM" in decision.matched_rule_ids
    assert "FINANCIAL_SAFE_ACCOUNT" in decision.matched_rule_ids


def test_advisory_does_not_speak_even_with_consent():
    result = make_detection(
        "Transfer your money to a safe account."
    )
    decision = evaluate_warning_policy(result, consent_enabled=True)
    assert decision.level == WarningLevel.ADVISORY
    assert decision.should_speak is False

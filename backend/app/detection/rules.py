
from dataclasses import dataclass

from app.detection.schemas import ScamStage, SignalStrength


@dataclass(frozen=True)
class DetectionRule:
    """One explainable multilingual scam-signal rule."""

    rule_id: str
    stage: ScamStage
    patterns: tuple[str, ...]
    reason: str
    signal_strength: SignalStrength


RULES: tuple[DetectionRule, ...] = (
    DetectionRule(
        rule_id="IMPERSONATION_AUTHORITY_CLAIM",
        stage=ScamStage.IMPERSONATION,
        patterns=(
            r"\bi am calling from (?:the )?(?:cbi|police|cyber crime)\b",
            r"\bi am (?:a|an) (?:police officer|cbi officer)\b",
            r"\bmain (?:cbi|police) se bol raha hoon\b",
            r"\bmain (?:cbi|police) se baat kar raha hoon\b",
            r"मैं पुलिस विभाग से बोल रहा हूँ",
            r"मैं सीबीआई से बोल रहा हूँ",
            r"मैं साइबर क्राइम विभाग से बोल रहा हूँ",
        ),
        reason="The speaker claims to represent a law-enforcement authority.",
        signal_strength=SignalStrength.MEDIUM,
    ),
    DetectionRule(
        rule_id="THREAT_ARREST",
        stage=ScamStage.THREATS,
        patterns=(
            r"\byou will be arrested\b",
            r"\byou are going to be arrested\b",
            r"\byou will face arrest\b",
            r"\baapko giraftar kar liya jayega\b",
            r"\btumhe giraftar kar liya jayega\b",
            r"आपको गिरफ्तार कर लिया जाएगा",
            r"तुम्हें गिरफ्तार कर लिया जाएगा",

            # Explicitly reported arrest threats.
            r"\b(?:the )?caller told me (?:that )?i would be arrested\b",
        ),
        reason=(
            "The transcript contains a direct or explicitly reported "
            "threat of arrest."
        ),
        signal_strength=SignalStrength.MEDIUM,
    ),
    DetectionRule(
        rule_id="ISOLATION_SECRECY",
        stage=ScamStage.ISOLATION,
        patterns=(
            r"\bdo not tell anyone about this call\b",
            r"\bdon't tell anyone about this call\b",
            r"\bdo not discuss this with anyone\b",
            r"\bkeep this (?:call|matter) secret\b",
            r"\bkisi ko mat batana\b",
            r"\bkisi ko iske baare mein mat batana\b",
            r"किसी को मत बताना",
            r"किसी को इसके बारे में मत बताना",
        ),
        reason="The speaker instructs the listener to keep the interaction secret.",
        signal_strength=SignalStrength.MEDIUM,
    ),
    DetectionRule(
        rule_id="FINANCIAL_SAFE_ACCOUNT",
        stage=ScamStage.FINANCIAL_EXTRACTION,
        patterns=(
            r"\btransfer your money to a safe account\b",
            r"\bmove your money to a safe account\b",
            r"\btransfer (?:the )?money to a safe account\b",
            r"\bpaise safe account mein transfer karo\b",
            r"\bpaise surakshit khate mein transfer karo\b",
            r"अपना पैसा सुरक्षित खाते में ट्रांसफर करें",
            r"अपने पैसे सुरक्षित खाते में ट्रांसफर करें",
        ),
        reason="The speaker directs the listener to move money into a purported safe account.",
        signal_strength=SignalStrength.HIGH,
    ),
)

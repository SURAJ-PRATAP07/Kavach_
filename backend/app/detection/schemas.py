from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ScamStage(str, Enum):
    IMPERSONATION = "impersonation"
    THREATS = "threats"
    ISOLATION = "isolation"
    FINANCIAL_EXTRACTION = "financial_extraction"


class TranscriptSource(str, Enum):
    REST = "rest"
    STREAMING = "streaming"


class SignalStrength(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class KavachBaseModel(BaseModel):
    """Shared validation rules for Kavach detection models."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        use_enum_values=True,
    )


class TranscriptSegment(KavachBaseModel):
    """A normalised transcript segment supplied to detection."""

    text: str = Field(min_length=1)
    source: TranscriptSource

    segment_id: str | None = None
    segment_index: int | None = Field(default=None, ge=0)

    # Provider timestamp format is not yet guaranteed.
    timestamp: str | int | float | None = None

    audio_duration_ms: float | None = Field(default=None, ge=0)
    language_code: str | None = None


class DetectionEvidence(KavachBaseModel):
    """An explainable signal produced by a detection rule."""

    stage: ScamStage
    rule_id: str = Field(min_length=1)

    matched_text: str = Field(min_length=1)
    transcript_text: str = Field(min_length=1)
    reason: str = Field(min_length=1)

    signal_strength: SignalStrength

    source: TranscriptSource
    segment_id: str | None = None
    segment_index: int | None = Field(default=None, ge=0)
    timestamp: str | int | float | None = None


class StageAssessment(KavachBaseModel):
    """Evidence collected for one scam stage."""

    stage: ScamStage
    evidence: list[DetectionEvidence] = Field(default_factory=list)


class DetectionResult(KavachBaseModel):
    """Complete explainable output of the detection engine."""

    segments_analyzed: int = Field(ge=0)
    stage_assessments: list[StageAssessment]

    disclaimer: str = (
        "Detected signals indicate potential risk. "
        "They do not independently confirm that a scam has occurred."
    )

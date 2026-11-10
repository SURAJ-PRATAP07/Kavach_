from app.detection.engine import detect_segments
from app.detection.schemas import (
    DetectionResult,
    ScamStage,
    StageAssessment,
    TranscriptSegment,
)


class ConversationDetectionAccumulator:
    """Maintain cumulative detection evidence for one conversation."""


    def __init__(self):
        self._segments_analyzed = 0
        self._evidence_by_stage = {
            stage.value: [] for stage in ScamStage
        }

    def add_segment(self, segment: TranscriptSegment) -> DetectionResult:
        """Analyse a new segment and retain its evidence."""
        segment_result = detect_segments([segment])
        self._segments_analyzed += segment_result.segments_analyzed
        for assessment in segment_result.stage_assessments:
            stage_key = (
                assessment.stage.value
                if isinstance(assessment.stage, ScamStage)
                else assessment.stage
            )
            self._evidence_by_stage[stage_key].extend(
                assessment.evidence
            )
        return self.get_result()

    def get_result(self) -> DetectionResult:
        """Return the cumulative detection result so far."""
        assessments = [
            StageAssessment(
                stage=stage,
                evidence=self._evidence_by_stage[stage.value],
            )
            for stage in ScamStage
        ]
        return DetectionResult(
            segments_analyzed=self._segments_analyzed,
            stage_assessments=assessments,
        )

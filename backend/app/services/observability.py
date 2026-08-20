import uuid
import logging
from datetime import datetime
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class ObservabilityService:
    """
    Observability Service managing OpenTelemetry-style trace IDs, latency metrics, and Alert Deduplication.
    """

    @staticmethod
    def generate_trace_context(tenant_id: str, operation: str) -> Dict[str, str]:
        trace_id = f"trace-{uuid.uuid4().hex}"
        span_id = f"span-{uuid.uuid4().hex[:16]}"
        return {
            "trace_id": trace_id,
            "span_id": span_id,
            "tenant_id": tenant_id,
            "operation": operation,
            "timestamp": datetime.utcnow().isoformat()
        }

    @staticmethod
    def deduplicate_alert_notifications(tenant_id: str, event_id: int, failures: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Alert Deduplication Engine:
        Groups child failures by event_id so a cascade with 10,000 child failures generates 1 summary alert.
        """
        summary_payload = {
            "tenant_id": tenant_id,
            "event_id": event_id,
            "total_failures": len(failures),
            "severity": "CRITICAL" if len(failures) > 10 else "HIGH",
            "summary": f"Cascade Event #{event_id} experienced {len(failures)} child target failures.",
            "sample_errors": failures[:3],
            "deduplicated": True,
            "alert_group_key": f"alert:{tenant_id}:event:{event_id}"
        }

        logger.info(f"[OBSERVABILITY ALERT] Emitted deduplicated alert '{summary_payload['alert_group_key']}' for {len(failures)} failures.")
        return summary_payload

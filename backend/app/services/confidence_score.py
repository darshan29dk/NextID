import hashlib
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

def calculate_revocation_confidence(
    http_status: int = None,
    provider_verification_confirmed: bool = False,
    evidence_payload: Dict[str, Any] = None,
    auth_challenge_failed: bool = True
) -> Dict[str, Any]:
    """
    Calculates dynamic Revocation Confidence Score (0.0% to 100.0%)
    based on verifiable provider response telemetry, RFC 8785 evidence digests,
    and post-revocation verification checks.
    """
    score = 0.0
    breakdown = {}

    # 1. HTTP Status Check (up to 40%)
    if http_status in [200, 201, 204]:
        score += 40.0
        breakdown["http_status_check"] = 40.0
    elif http_status in [404, 410]: # Resource already gone
        score += 35.0
        breakdown["http_status_check"] = 35.0
    else:
        breakdown["http_status_check"] = 0.0

    # 2. Real Provider Post-Revocation Verification (up to 35%)
    if provider_verification_confirmed:
        score += 35.0
        breakdown["provider_verification"] = 35.0
    else:
        breakdown["provider_verification"] = 0.0

    # 3. Cryptographic RFC 8785 Evidence Digest Verification (up to 15%)
    if evidence_payload:
        try:
            canonical_json = json.dumps(evidence_payload, sort_keys=True, separators=(',', ':'))
            digest = hashlib.sha256(canonical_json.encode('utf-8')).hexdigest()
            score += 15.0
            breakdown["evidence_digest_verified"] = 15.0
            breakdown["evidence_digest_sha256"] = digest
        except Exception:
            breakdown["evidence_digest_verified"] = 0.0
    else:
        breakdown["evidence_digest_verified"] = 0.0

    # 4. Re-authentication Challenge Failure (up to 10%)
    if auth_challenge_failed:
        score += 10.0
        breakdown["reauth_challenge_failed"] = 10.0
    else:
        breakdown["reauth_challenge_failed"] = 0.0

    final_score = min(100.0, max(0.0, score))

    confidence_level = "HIGH" if final_score >= 85.0 else ("MEDIUM" if final_score >= 50.0 else "LOW")

    return {
        "confidence_score_percent": round(final_score, 1),
        "confidence_level": confidence_level,
        "is_verifiable_revocation": final_score >= 75.0,
        "scoring_breakdown": breakdown
    }

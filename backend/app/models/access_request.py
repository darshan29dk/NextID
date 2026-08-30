import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime
from app.database import Base

class AccessRequestState:
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    POLICY_CHECK = "POLICY_CHECK"
    SOD_CHECK = "SOD_CHECK"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    PROVISIONING = "PROVISIONING"
    VERIFYING = "VERIFYING"
    FULFILLED = "FULFILLED"
    DENIED = "DENIED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


ACCESS_REQUEST_TRANSITIONS = {
    AccessRequestState.DRAFT: {
        AccessRequestState.SUBMITTED,
        AccessRequestState.CANCELLED,
    },
    AccessRequestState.SUBMITTED: {
        AccessRequestState.POLICY_CHECK,
        AccessRequestState.CANCELLED,
        AccessRequestState.FAILED,
    },
    AccessRequestState.POLICY_CHECK: {
        AccessRequestState.SOD_CHECK,
        AccessRequestState.DENIED,
        AccessRequestState.FAILED,
        AccessRequestState.CANCELLED,
    },
    AccessRequestState.SOD_CHECK: {
        AccessRequestState.PENDING_APPROVAL,
        AccessRequestState.APPROVED,
        AccessRequestState.DENIED,
        AccessRequestState.FAILED,
        AccessRequestState.CANCELLED,
    },
    AccessRequestState.PENDING_APPROVAL: {
        AccessRequestState.APPROVED,
        AccessRequestState.DENIED,
        AccessRequestState.EXPIRED,
        AccessRequestState.CANCELLED,
    },
    AccessRequestState.APPROVED: {
        AccessRequestState.PROVISIONING,
        AccessRequestState.CANCELLED,
        AccessRequestState.FAILED,
    },
    AccessRequestState.PROVISIONING: {
        AccessRequestState.VERIFYING,
        AccessRequestState.FAILED,
    },
    AccessRequestState.VERIFYING: {
        AccessRequestState.FULFILLED,
        AccessRequestState.FAILED,
    },
    AccessRequestState.FULFILLED: {
        AccessRequestState.REVOKED,
        AccessRequestState.EXPIRED,
    },
    AccessRequestState.DENIED: set(),
    AccessRequestState.FAILED: set(),
    AccessRequestState.CANCELLED: set(),
    AccessRequestState.EXPIRED: set(),
    AccessRequestState.REVOKED: set(),
}


class AccessRequest(Base):
    """
    Access Request model representing user/agent request lifecycle for an entitlement.
    """
    __tablename__ = "access_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    requester_principal_id = Column(String(36), nullable=False, index=True)
    target_principal_id = Column(String(36), nullable=False, index=True)
    
    catalog_item_id = Column(String(36), nullable=False, index=True)
    requested_entitlement_id = Column(String(36), nullable=True, index=True)
    
    business_justification = Column(Text, nullable=True)
    requested_ttl_hours = Column(Integer, default=24, nullable=False)
    
    status = Column(String(50), default="SUBMITTED", nullable=False, index=True)
    
    policy_decision_id = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def transition_to(self, new_state: str) -> None:
        """
        Validates and transitions the access request to a new state.
        Raises ValueError on illegal transitions.
        """
        new_state = new_state.upper()
        allowed = ACCESS_REQUEST_TRANSITIONS.get(self.status, set())
        if new_state not in allowed:
            raise ValueError(
                f"Illegal state transition from '{self.status}' to '{new_state}'. "
                f"Allowed transitions: {sorted(list(allowed))}"
            )
        self.status = new_state
        self.updated_at = datetime.utcnow()


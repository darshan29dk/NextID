from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime
from app.database import Base


class RoleVersionHistory(Base):
    """
    RC-005: Version History. Append-only snapshot log for a candidate role.
    A new row is written every time a role is published or re-published to the
    catalog, capturing its full state at that moment (classification, owner,
    entitlement/member counts, risk score) so changes over time can be reviewed.
    Follows the same event-log pattern as RoleMergeHistory / RoleSplitHistory /
    RoleOwnerHistory rather than diffing individual fields.
    """
    __tablename__ = "role_version_history"

    id = Column(Integer, primary_key=True, index=True)
    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)

    version_number = Column(Integer, nullable=False)
    change_summary = Column(String(300), nullable=True)  # e.g. "Initial publish", "Re-published after entitlement update"

    # Snapshot of role state at this version
    role_name = Column(String(150), nullable=True)
    role_description = Column(String(500), nullable=True)
    role_type = Column(String(50), nullable=True)
    classification = Column(String(100), nullable=True)
    risk_level = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)
    entitlement_count = Column(Integer, nullable=True)
    user_count = Column(Integer, nullable=True)
    application_count = Column(Integer, nullable=True)
    primary_owner_name = Column(String(200), nullable=True)

    changed_by = Column(String(100), default="System", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

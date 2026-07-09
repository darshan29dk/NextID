from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from datetime import datetime
from app.database import Base

class Identity(Base):
    __tablename__ = "identities"

    id = Column(Integer, primary_key=True, index=True)

    # Core indexed fields — mirror the default IdentityAttribute definitions
    # so the schema stays consistent with the configurable attribute system.
    employee_id = Column(String(100), unique=True, index=True, nullable=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    display_name = Column(String(150), nullable=True)
    email = Column(String(150), index=True, nullable=True)
    department = Column(String(100), index=True, nullable=True)
    job_title = Column(String(100), nullable=True)
    manager = Column(String(150), nullable=True)
    status = Column(String(50), default="Active", index=True, nullable=False)

    # Full set of configured Identity Attribute values (including any custom
    # attributes added later via the Identity Attributes admin page), keyed
    # by attribute_name. Keeps this table configurable without needing a
    # schema migration every time a new Identity Attribute is defined.
    attributes = Column(JSON, nullable=True)

    # Where this identity came from — which Data Source connector import
    # produced/last updated it. Used for the Timeline tab (IDR-005).
    source_connector_id = Column(Integer, nullable=True)
    source_connector_name = Column(String(150), nullable=True)
    imported_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ConnectorFieldMapping(Base):
    __tablename__ = "connector_field_mappings"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False)
    source_field = Column(String(150), nullable=False)
    target_module = Column(String(50), nullable=False)  # "Identity", "Account", "Entitlement", "Role"
    target_attribute_name = Column(String(150), nullable=False)  # e.g. "email", "employee_id"
    transformation_type = Column(String(50), nullable=True)  # "Uppercase", "Lowercase", "Trim", "Title Case"

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=True)
    modified_by = Column(String(100), default="System", nullable=True)

    connector = relationship("Connector", backref="field_mappings")
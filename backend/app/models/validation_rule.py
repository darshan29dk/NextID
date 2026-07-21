from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ValidationRule(Base):
    __tablename__ = "validation_rules"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False)
    mapping_id = Column(Integer, ForeignKey("connector_field_mappings.id"), nullable=True)
    rule_name = Column(String(150), nullable=False)
    validation_type = Column(String(50), nullable=False)
    parameters = Column(Text, nullable=True)  # JSON-encoded parameters
    severity = Column(String(50), default="Error", nullable=False)  # "Error", "Warning", "Info"
    error_message = Column(String(255), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    execution_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)

    connector = relationship("Connector", backref="validation_rules")
    mapping = relationship("ConnectorFieldMapping", backref="validation_rules")

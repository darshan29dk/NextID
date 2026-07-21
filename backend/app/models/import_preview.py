from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ImportPreview(Base):
    __tablename__ = "import_previews"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False)
    record_number = Column(Integer, nullable=False)
    source_data = Column(Text, nullable=False)        # JSON-encoded raw source dictionary
    transformed_data = Column(Text, nullable=False)   # JSON-encoded transformed dictionary
    validation_result = Column(Text, nullable=True)   # JSON-encoded structured field-level validation details
    status = Column(String(50), nullable=False)        # "Valid", "Warning", "Error"
    errors = Column(Text, nullable=True)              # JSON-encoded errors list
    warnings = Column(Text, nullable=True)            # JSON-encoded warnings list
    previewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    connector = relationship("Connector", backref="import_previews")

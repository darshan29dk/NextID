from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ConnectorLog(Base):
    __tablename__ = "connector_logs"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False)
    action = Column(String(100), nullable=False)  # "Created", "Updated", "Connection Tested", "Import Started", etc.
    details = Column(Text, nullable=True)
    status = Column(String(50), nullable=False)  # "Success", "Failed", "Info"
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    connector = relationship("Connector", back_populates="logs")

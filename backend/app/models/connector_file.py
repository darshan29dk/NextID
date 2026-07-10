from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class ConnectorFile(Base):
    __tablename__ = "connector_files"

    id = Column(Integer, primary_key=True, index=True)
    connector_id = Column(Integer, ForeignKey("connectors.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    uploaded_by = Column(String(100), nullable=False)
    file_content = Column(LargeBinary(length=16777215), nullable=True)

    connector = relationship("Connector", back_populates="files")


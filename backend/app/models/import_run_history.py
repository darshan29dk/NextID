from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database import Base

class ImportRunHistory(Base):
    __tablename__ = "import_run_history"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String(20), nullable=False)  # "Connector" or "Application"
    source_id = Column(Integer, nullable=False)  # connectors.id or applications.id depending on source_type
    run_type = Column(String(50), nullable=False)  # "Preview", "Import", "Sync"
    total_records = Column(Integer, default=0, nullable=False)
    valid_records = Column(Integer, default=0, nullable=False)
    warning_records = Column(Integer, default=0, nullable=False)
    error_records = Column(Integer, default=0, nullable=False)
    status = Column(String(50), default="Completed", nullable=False)  # "Completed", "Failed", "Partial"
    run_by = Column(String(100), default="System", nullable=False)
    run_at = Column(DateTime, default=datetime.utcnow, nullable=False)
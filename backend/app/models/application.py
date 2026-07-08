from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    application_name = Column(String(150), unique=True, nullable=False, index=True)
    application_type = Column(String(50), nullable=False)  # "CSV", "Excel"
    description = Column(String(255), nullable=True)
    status = Column(String(50), default="Draft", nullable=False)  # "Draft", "Configured", "Connected", "Failed", "Disabled"
    health_status = Column(String(50), default="Unknown", nullable=False)  # "Healthy", "Degraded", "Unhealthy", "Unknown"
    environment = Column(String(50), default="Development", nullable=False)  # "Production", "Staging", "Development"
    tags = Column(String(255), nullable=True)  # Comma-separated tags
    version = Column(Integer, default=1, nullable=False)

    # File specific config
    csv_delimiter = Column(String(5), default=",", nullable=True)
    csv_encoding = Column(String(20), default="UTF-8", nullable=True)
    excel_sheet_name = Column(String(100), nullable=True)
    file_path = Column(String(255), nullable=True)

    # Sync statistics
    success_count = Column(Integer, default=0, nullable=False)
    failure_count = Column(Integer, default=0, nullable=False)
    last_sync_duration = Column(Integer, nullable=True)  # in milliseconds

    # Auditing fields
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)
    last_tested = Column(DateTime, nullable=True)
    last_sync = Column(DateTime, nullable=True)
    schedule_enabled = Column(Boolean, default=False, nullable=True)
    schedule_frequency = Column(String(20), nullable=True)  # "Hourly", "Daily", "Weekly"
    schedule_time = Column(String(10), nullable=True)  # "HH:MM", used for Daily/Weekly
    next_scheduled_run = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
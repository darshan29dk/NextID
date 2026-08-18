from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from datetime import datetime
from app.database import Base

class ProviderCredential(Base):
    __tablename__ = "provider_credentials"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50), nullable=False, index=True)  # GitHub, AWS, MCP
    credential_name = Column(String(150), unique=True, nullable=False, index=True)
    encrypted_secret = Column(Text, nullable=False)
    config = Column(JSON, nullable=True)  # AWS region, MCP base URL, path templates
    status = Column(String(50), default="Active", nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=False)
    modified_by = Column(String(100), default="System", nullable=False)

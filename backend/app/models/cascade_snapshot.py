import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer
from app.database import Base

class CascadeSnapshot(Base):
    """
    Cascade Graph Snapshot model capturing exact graph state, version, and SHA-256 graph hash at trigger time.
    """
    __tablename__ = "cascade_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    tenant_id = Column(String(50), nullable=False, default="default_tenant", index=True)
    event_id = Column(Integer, nullable=False, index=True)
    
    graph_version = Column(Integer, default=1, nullable=False)
    snapshot_hash = Column(String(64), nullable=False, index=True)  # SHA-256 digest of graph state
    
    nodes_json = Column(Text, nullable=False)
    links_json = Column(Text, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

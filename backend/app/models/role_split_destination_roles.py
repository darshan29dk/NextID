from sqlalchemy import Column, Integer, ForeignKey
from app.database import Base


class RoleSplitDestinationRole(Base):
    """
    Split destination roles generated from a split operation.
    """
    __tablename__ = "role_split_destination_roles"

    id = Column(Integer, primary_key=True, index=True)
    split_history_id = Column(Integer, ForeignKey("role_split_history.id", ondelete="CASCADE"), index=True, nullable=False)
    destination_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=False)

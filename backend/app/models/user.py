from sqlalchemy import Column, Integer, String
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    role = Column(String(100), nullable=False)
    profile_image = Column(String(255), nullable=True)
    theme = Column(String(20), default="light")
    password_hash = Column(String(255), nullable=False, default="")
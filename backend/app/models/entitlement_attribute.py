from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class EntitlementAttribute(Base):
    __tablename__ = "entitlement_attributes"

    id = Column(Integer, primary_key=True, index=True)
    attribute_name = Column(String(100), unique=True, index=True, nullable=False)
    display_name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("attribute_categories.id"), nullable=True)
    application_name = Column(String(100), nullable=True)
    entitlement_type = Column(String(100), nullable=True)
    attribute_type = Column(String(50), default="Custom", nullable=False) # "System", "Custom"
    data_type = Column(String(50), nullable=False) # "String", "Integer", "Boolean", "Date", "DateTime", "Email", "Phone", "Dropdown", "Multi Select", "Number", "Text Area"
    default_value = Column(String(255), nullable=True)
    validation_rule = Column(String(255), nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    is_required = Column(Boolean, default=False, nullable=False)
    is_unique = Column(Boolean, default=False, nullable=False)
    is_searchable = Column(Boolean, default=False, nullable=False)
    is_editable = Column(Boolean, default=True, nullable=False)
    status = Column(String(50), default="Active", nullable=False) # "Active", "Inactive", "Deprecated"
    is_system = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_by = Column(String(100), default="System", nullable=True)
    modified_by = Column(String(100), default="System", nullable=True)

    category = relationship("AttributeCategory", backref="entitlement_attributes")

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from datetime import datetime
from app.database import Base

class ApplicationAccountEntitlement(Base):
    """Links one imported account to one entitlement it holds.

    Populated during Account import: if the account row's mapped
    'entitlements' column contains one or more entitlement names, each
    name is matched (case-insensitive) against this application's already
    imported ApplicationEntitlement records. Matches get entitlement_id
    set; names that don't match anything are still recorded (entitlement_id
    left null) so import results can report what wasn't matched.
    """
    __tablename__ = "application_account_entitlements"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), index=True, nullable=False)
    account_id = Column(Integer, ForeignKey("application_accounts.id"), index=True, nullable=False)
    entitlement_id = Column(Integer, ForeignKey("application_entitlements.id"), index=True, nullable=True)
    entitlement_name_raw = Column(String(255), nullable=False)
    matched = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

from sqlalchemy import Column, Integer, String, Float, ForeignKey
from app.database import Base


class CampaignAccountResult(Base):
    """
    One row per account considered by a campaign run. candidate_role_id is
    set if the account landed in a cluster (a "member"); it's left NULL if
    DBSCAN marked the account as noise — that's what makes it an outlier
    (RD-007). This single table backs both the Candidate Role member lists
    and the Outlier Analysis view, and campaign-level Coverage (RD-005) is
    just: (rows with candidate_role_id set) / (total rows) for the campaign.
    """
    __tablename__ = "campaign_account_results"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("mining_campaigns.id"), index=True, nullable=False)
    account_id = Column(Integer, ForeignKey("application_accounts.id"), index=True, nullable=False)
    identity_id = Column(Integer, ForeignKey("identities.id"), index=True, nullable=True)
    job_function = Column(String(100), nullable=True)

    candidate_role_id = Column(Integer, ForeignKey("candidate_roles.id"), index=True, nullable=True)  # NULL = outlier
    similarity_score = Column(Float, default=0.0, nullable=False)  # 0-100, similarity to the role's core set (0 for outliers)

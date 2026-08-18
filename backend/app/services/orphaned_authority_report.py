import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink

logger = logging.getLogger(__name__)

def find_orphaned_delegations(db: Session) -> List[Dict[str, Any]]:
    """
    Read-only safety net report querying for Active DelegationLink rows where 
    the root ancestor identity has status == 'Inactive'.
    Does NOT auto-revoke anything; returns details for audit and review.
    """
    active_links = db.query(DelegationLink).filter(DelegationLink.status == "Active").all()
    results = []

    for link in active_links:
        current_parent_id = link.parent_identity_id
        depth = 1
        visited = {current_parent_id, link.child_identity_id}
        root_identity = None

        # Walk UP to the ROOT ancestor of the delegation chain (max depth 25)
        while current_parent_id and depth <= 25:
            parent = db.query(Identity).filter(Identity.id == current_parent_id).first()
            if not parent:
                break
                
            root_identity = parent

            # Find next parent up the delegation chain
            parent_link = db.query(DelegationLink).filter(
                DelegationLink.child_identity_id == current_parent_id,
                DelegationLink.status == "Active"
            ).first()

            if not parent_link or parent_link.parent_identity_id in visited:
                break

            current_parent_id = parent_link.parent_identity_id
            visited.add(current_parent_id)
            depth += 1

        # Check if the root ancestor is Inactive
        if root_identity and (root_identity.status or "").lower() == "inactive":
            child_identity = db.query(Identity).filter(Identity.id == link.child_identity_id).first()
            
            root_name = root_identity.display_name or root_identity.email or f"Identity {root_identity.id}"
            orphaned_name = child_identity.display_name or child_identity.email if child_identity else f"Identity {link.child_identity_id}"
            
            results.append({
                "delegation_link_id": link.id,
                "root_identity_id": root_identity.id,
                "root_identity_name": root_name,
                "orphaned_identity_id": link.child_identity_id,
                "orphaned_identity_name": orphaned_name,
                "hop_depth": depth,
                "delegation_created_at": link.created_at.isoformat() if link.created_at else None
            })

    return results

def notify_if_orphaned_found(db: Session, orphaned_list: List[Dict[str, Any]]) -> bool:
    """
    Helper to create an 'Orphaned Authority Alert' notification if the orphaned list is non-empty.
    """
    count = len(orphaned_list)
    if count > 0:
        from app.models.notification import Notification
        db.add(Notification(
            title="Orphaned Authority Alert",
            message=f"{count} orphaned AI agent/authority link(s) detected — review required.",
            status="unread"
        ))
        db.commit()
        return True
    return False

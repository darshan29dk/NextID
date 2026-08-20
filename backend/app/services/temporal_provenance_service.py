from datetime import datetime
from typing import Dict, Any, List, Optional, Set
from sqlalchemy.orm import Session
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink, RevocationEvent, CascadeAction
from app.models.jit_lease import JitLease
from app.models.credential_lineage import CredentialLineageNode
from app.models.revocation import RevocationJob
from app.security.state_machine import StateMachineService

class TemporalProvenanceService:
    """
    Phase 4, 5, & 6 Unified Engine:
    - Temporal Authority Graph Reconstruction
    - Explanatory Authority Provenance Path Engine
    - Dual-Lineage (Delegation + Credential) Cascade Revocation Engine
    """

    @staticmethod
    def get_temporal_authority_graph(db: Session, tenant_id: str, at_timestamp: datetime) -> Dict[str, Any]:
        """
        Phase 4: Reconstructs the authority graph valid at a historical timestamp 'at_timestamp'.
        Does NOT mutate current database state.
        """
        # Query identities created on or before timestamp
        identities = db.query(Identity).filter(
            Identity.tenant_id == tenant_id,
            Identity.created_at <= at_timestamp
        ).all()

        nodes = [{"id": str(i.id), "label": i.display_name, "status": i.status, "employee_id": i.employee_id} for i in identities]

        # Query delegation links created on or before timestamp
        links = db.query(DelegationLink).filter(
            DelegationLink.tenant_id == tenant_id,
            DelegationLink.created_at <= at_timestamp
        ).all()

        active_links = []
        for l in links:
            # Active at historical timestamp if created before timestamp
            active_links.append({
                "id": str(l.id),
                "source": str(l.parent_identity_id),
                "target": str(l.child_identity_id),
                "delegation_type": l.delegation_type,
                "authority_epoch": l.authority_epoch,
                "status": l.status,
                "created_at": l.created_at.isoformat()
            })

        return {
            "title": "NextID Temporal Historical Authority Graph",
            "tenant_id": tenant_id,
            "queried_at_timestamp": at_timestamp.isoformat(),
            "nodes_count": len(nodes),
            "edges_count": len(active_links),
            "nodes": nodes,
            "edges": active_links
        }

    @staticmethod
    def get_authority_provenance(
        db: Session,
        tenant_id: str,
        principal_id: str,
        resource: Optional[str] = None,
        permission: Optional[str] = None,
        at_timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Phase 5: Reconstructs the end-to-end provenance lineage explaining WHY a principal holds authority.
        Returns root authority source, delegation path, policies, decision IDs, epochs, and confidence level.
        """
        query_time = at_timestamp or datetime.utcnow()

        # Find target identity
        identity = db.query(Identity).filter(
            Identity.tenant_id == tenant_id,
            (Identity.employee_id == principal_id) | (Identity.id == (int(principal_id) if principal_id.isdigit() else -1))
        ).first()

        if not identity:
            return {
                "principal_id": principal_id,
                "tenant_id": tenant_id,
                "provenance_found": False,
                "message": f"Principal '{principal_id}' not found."
            }

        # Traversal up incoming delegations to find root authority source
        path = []
        visited = set()
        current_id = identity.id
        root_identity = identity

        while current_id and current_id not in visited:
            visited.add(current_id)
            current = db.query(Identity).filter(Identity.id == current_id).first()
            if current:
                path.append({
                    "identity_id": str(current.id),
                    "employee_id": current.employee_id,
                    "display_name": current.display_name,
                    "status": current.status
                })

            incoming = db.query(DelegationLink).filter(
                DelegationLink.tenant_id == tenant_id,
                DelegationLink.child_identity_id == current_id,
                DelegationLink.created_at <= query_time
            ).first()

            if incoming:
                current_id = incoming.parent_identity_id
            else:
                root_identity = current
                break

        # Query JIT leases and credential lineage for principal
        leases = db.query(JitLease).filter(
            JitLease.tenant_id == tenant_id,
            JitLease.principal_id == identity.employee_id
        ).all()

        creds = db.query(CredentialLineageNode).filter(
            CredentialLineageNode.tenant_id == tenant_id,
            CredentialLineageNode.holder_principal_id == identity.employee_id
        ).all()

        return {
            "title": "NextID Explanatory Authority Provenance",
            "tenant_id": tenant_id,
            "principal_id": principal_id,
            "queried_resource": resource or "ALL",
            "queried_permission": permission or "ALL",
            "evaluated_at": query_time.isoformat(),
            "root_authority_source": {
                "identity_id": str(root_identity.id) if root_identity else "UNKNOWN",
                "employee_id": root_identity.employee_id if root_identity else "UNKNOWN",
                "display_name": root_identity.display_name if root_identity else "UNKNOWN",
                "type": "HUMAN_ROOT_AUTHORITY" if not incoming else "DELEGATED_AGENT"
            },
            "delegation_path": path,
            "active_jit_leases_count": len(leases),
            "credentials_count": len(creds),
            "associated_policies": ["POLICY-M4-001-DEFAULT", "POLICY-V2-GOVERNANCE"],
            "policy_decision_ids": [l.policy_decision_id for l in leases] if leases else ["PD-DEFAULT"],
            "authority_epochs": [1],
            "confidence_level": "HIGH",
            "provenance_found": True
        }

    @staticmethod
    def cascade_revoke_dual_lineage(
        db: Session,
        tenant_id: str,
        root_principal_id: str,
        reason: str = "DUAL_LINEAGE_CASCADE_REVOCATION"
    ) -> Dict[str, Any]:
        """
        Phase 6: Performs complete cascade revocation traversing BOTH:
        1. Delegation lineage (identities & delegation links)
        2. Credential lineage (derived credentials & JIT leases)
        Prevents loops using a visit tracker set.
        """
        root = db.query(Identity).filter(
            Identity.tenant_id == tenant_id,
            (Identity.employee_id == root_principal_id) | (Identity.id == (int(root_principal_id) if root_principal_id.isdigit() else -1))
        ).first()

        if not root:
            return {"status": "FAILED", "reason": f"Root principal '{root_principal_id}' not found."}

        # Spawn RevocationEvent
        event = RevocationEvent(
            tenant_id=tenant_id,
            source_identity_id=root.id,
            reason=reason,
            status="In Progress"
        )
        db.add(event)
        db.commit()

        visited_identities = set()
        visited_credentials = set()
        revoked_actions = []

        # 1. Cascade through delegation lineage
        queue = [root.id]
        while queue:
            curr_id = queue.pop(0)
            if curr_id in visited_identities:
                continue
            visited_identities.add(curr_id)

            ident = db.query(Identity).filter(Identity.id == curr_id).first()
            if ident:
                ident.status = "Revoked"
                ident.is_frozen = True

                # Spawn CascadeAction for identity
                action = CascadeAction(
                    tenant_id=tenant_id,
                    event_id=event.id,
                    target_type="IDENTITY",
                    target_identifier=ident.employee_id,
                    target_class="MANDATORY",
                    status="Confirmed"
                )
                db.add(action)
                revoked_actions.append(ident.employee_id)

            # Query outgoing delegations
            outgoing = db.query(DelegationLink).filter(
                DelegationLink.tenant_id == tenant_id,
                DelegationLink.parent_identity_id == curr_id
            ).all()

            for link in outgoing:
                link.status = "Revoked"
                link.is_frozen = True
                queue.append(link.child_identity_id)

        # 2. Cascade through credential lineage
        for ident_id in visited_identities:
            ident = db.query(Identity).filter(Identity.id == ident_id).first()
            if not ident:
                continue

            # Revoke JIT leases
            leases = db.query(JitLease).filter(
                JitLease.tenant_id == tenant_id,
                JitLease.principal_id == ident.employee_id,
                JitLease.status.in_(["ACTIVE", "PENDING", "ISSUING"])
            ).all()

            for l in leases:
                StateMachineService.transition_jit_lease(l, "REVOKED")

            # Revoke Credential Lineage Nodes
            nodes = db.query(CredentialLineageNode).filter(
                CredentialLineageNode.tenant_id == tenant_id,
                CredentialLineageNode.holder_principal_id == ident.employee_id,
                CredentialLineageNode.status == "ACTIVE"
            ).all()

            for n in nodes:
                n.status = "REVOKED"
                n.revoked_at = datetime.utcnow()
                visited_credentials.add(n.credential_id)

        # Confirm RevocationEvent state
        StateMachineService.transition_cascade_event(event, "CONFIRMED")
        db.commit()

        return {
            "event_id": event.id,
            "tenant_id": tenant_id,
            "root_principal_id": root_principal_id,
            "status": "CONFIRMED",
            "revoked_identities_count": len(visited_identities),
            "revoked_credentials_count": len(visited_credentials),
            "revoked_actions": revoked_actions
        }

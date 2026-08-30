import hashlib
import json
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.principal import Principal
from app.models.identity import Identity
from app.models.account import Account
from app.models.entitlement import Entitlement
from app.models.account_entitlement import AccountEntitlement
from app.models.lifecycle_event import LifecycleEvent
from app.services.temporal_provenance_service import TemporalProvenanceService
from app.services.birthright_service import BirthrightService
from app.services.sod_engine import SoDEngine
from app.services.blast_radius_engine import calculate_blast_radius


class JMLEngine:

    @staticmethod
    def simulate_event(db: Session, tenant_id: str, event_type: str, principal_id: str, attributes: dict = None) -> dict:
        """
        Advanced JML Simulation / Dry-Run:
        Projects the exact impact of a Joiner, Mover, Leaver, or Rehire event before commitment.
        """
        event_type = event_type.upper()
        attributes = attributes or {}
        principal = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.id == principal_id).first()

        simulation = {
            "event_type": event_type,
            "principal_id": principal_id,
            "principal_exists": principal is not None,
            "current_status": principal.status if principal else "NEW",
            "current_epoch": principal.authority_epoch if principal else 0,
            "projected_epoch": (principal.authority_epoch + 1) if principal else 1,
            "birthright_matches": [],
            "birthright_revocations": [],
            "sod_conflicts": [],
            "cascade_blast_radius": None,
            "impact_summary": []
        }

        if event_type == "JOINER":
            eval_res = BirthrightService.evaluate_for_principal(
                db=db,
                tenant_id=tenant_id,
                principal_id=principal_id,
                attributes=attributes,
                trigger_type="JOINER"
            )
            simulation["birthright_matches"] = eval_res.get("granted", [])
            simulation["impact_summary"].append(f"Onboard new principal '{principal_id}'.")
            simulation["impact_summary"].append(f"Auto-provision {len(simulation['birthright_matches'])} birthright entitlements.")

        elif event_type == "MOVER":
            eval_res = BirthrightService.evaluate_for_principal(
                db=db,
                tenant_id=tenant_id,
                principal_id=principal_id,
                attributes=attributes,
                trigger_type="MOVER"
            )
            simulation["birthright_matches"] = eval_res.get("granted", [])
            simulation["birthright_revocations"] = eval_res.get("removed", [])
            
            # Check SoD conflicts
            ent_ids = eval_res.get("granted", [])
            if ent_ids:
                sod_res = SoDEngine.evaluate(db, tenant_id, principal_id, ent_ids)
                simulation["sod_conflicts"] = sod_res.get("conflicts", [])
            
            simulation["impact_summary"].append(f"Increment authority epoch to {simulation['projected_epoch']}.")
            simulation["impact_summary"].append("Invalidate all existing JIT sessions and ephemeral tokens.")
            simulation["impact_summary"].append(f"Grant {len(simulation['birthright_matches'])} new birthright entitlements.")
            simulation["impact_summary"].append(f"Revoke {len(simulation['birthright_revocations'])} stale birthright entitlements.")

        elif event_type == "LEAVER":
            blast = calculate_blast_radius(db, principal_id)
            simulation["cascade_blast_radius"] = blast
            simulation["impact_summary"].append(f"Freeze principal '{principal_id}' and set status to FROZEN.")
            simulation["impact_summary"].append("Execute dual-lineage cascade revocation across all linked accounts.")
            simulation["impact_summary"].append("Revoke all downstream delegated authority nodes.")

        elif event_type == "REHIRE":
            eval_res = BirthrightService.evaluate_for_principal(
                db=db,
                tenant_id=tenant_id,
                principal_id=principal_id,
                attributes=attributes,
                trigger_type="REHIRE"
            )
            simulation["birthright_matches"] = eval_res.get("granted", [])
            simulation["impact_summary"].append(f"Reactivate principal with clean epoch {simulation['projected_epoch']}.")
            simulation["impact_summary"].append("Enforce Zero-Trust: historical credentials & delegations remain REVOKED.")

        return simulation

    @staticmethod
    def process_joiner(db: Session, tenant_id: str, principal_id: str, display_name: str, email: str, attributes: dict = None) -> dict:
        """
        JOINER Workflow: HR event -> create/update Principal -> sync attributes -> birthright access -> provision -> authority graph.
        """
        attributes = attributes or {}
        principal_type = attributes.get("principal_type", "HUMAN").upper()
        sponsor_id = attributes.get("sponsor_id") or attributes.get("manager")

        payload_str = json.dumps({"principal_id": principal_id, "display_name": display_name, "email": email, "attributes": attributes}, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        # Create or update principal
        principal = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.id == principal_id).first()
        if not principal:
            principal = Principal(
                id=principal_id,
                tenant_id=tenant_id,
                principal_type=principal_type,
                display_name=display_name,
                email=email,
                sponsor_id=sponsor_id,
                authority_epoch=1,
                status="ACTIVE",
                is_frozen=False
            )
            db.add(principal)
        else:
            principal.display_name = display_name
            principal.email = email
            principal.principal_type = principal_type
            if sponsor_id:
                principal.sponsor_id = sponsor_id
            principal.status = "ACTIVE"
            principal.is_frozen = False
            principal.updated_at = datetime.utcnow()

        # Create/update corresponding Identity record
        names = (display_name or "").split(" ", 1)
        first_name = names[0] if len(names) > 0 else ""
        last_name = names[1] if len(names) > 1 else ""

        identity = db.query(Identity).filter(Identity.tenant_id == tenant_id, Identity.employee_id == principal_id).first()
        if not identity:
            identity = Identity(
                employee_id=principal_id,
                display_name=display_name,
                first_name=first_name,
                last_name=last_name,
                email=email,
                department=attributes.get("department"),
                job_title=attributes.get("job_title"),
                org=attributes.get("org") or attributes.get("department"),
                manager=attributes.get("manager"),
                tenant_id=tenant_id,
                status="Active",
                authority_epoch=principal.authority_epoch,
                is_frozen=False,
                attributes=attributes
            )
            db.add(identity)
        else:
            identity.display_name = display_name
            identity.email = email
            identity.first_name = first_name
            identity.last_name = last_name
            identity.department = attributes.get("department") or identity.department
            identity.job_title = attributes.get("job_title") or identity.job_title
            identity.manager = attributes.get("manager") or identity.manager
            identity.status = "Active"
            identity.is_frozen = False
            identity.authority_epoch = principal.authority_epoch
            identity.attributes = attributes
            identity.updated_at = datetime.utcnow()

        # Automatically evaluate birthright access for Joiner
        birthright_eval = BirthrightService.evaluate_for_principal(
            db=db,
            tenant_id=tenant_id,
            principal_id=principal_id,
            attributes=attributes,
            trigger_type="JOINER"
        )

        # Record LifecycleEvent
        event = LifecycleEvent(
            tenant_id=tenant_id,
            principal_id=principal_id,
            event_type="JOINER",
            source="HRMS",
            payload_hash=payload_hash,
            payload={
                "attributes": attributes,
                "birthright_evaluation": birthright_eval
            },
            status="PROCESSED"
        )
        db.add(event)
        db.commit()
        db.refresh(principal)

        return {
            "status": "SUCCESS",
            "event_type": "JOINER",
            "principal_id": principal.id,
            "principal_type": principal.principal_type,
            "authority_epoch": principal.authority_epoch,
            "birthright_granted": birthright_eval.get("granted", []),
            "event_id": event.id
        }

    @staticmethod
    def process_mover(db: Session, tenant_id: str, principal_id: str, new_attributes: dict) -> dict:
        """
        MOVER Workflow: attribute change -> authority_epoch++ -> re-evaluate birthright -> check SoD -> revoke invalid JIT -> reconcile.
        """
        principal = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.id == principal_id).first()
        if not principal:
            raise ValueError(f"Principal '{principal_id}' not found for tenant '{tenant_id}'.")

        # Increment authority epoch on mover transition
        principal.authority_epoch += 1
        principal.updated_at = datetime.utcnow()

        # Update Identity
        identity = db.query(Identity).filter(Identity.tenant_id == tenant_id, Identity.employee_id == principal_id).first()
        if identity:
            if "department" in new_attributes:
                identity.department = new_attributes["department"]
            if "job_title" in new_attributes:
                identity.job_title = new_attributes["job_title"]
            if "manager" in new_attributes:
                identity.manager = new_attributes["manager"]
            identity.authority_epoch = principal.authority_epoch
            identity.attributes = new_attributes
            identity.updated_at = datetime.utcnow()

        # Re-evaluate birthright policies
        birthright_eval = BirthrightService.evaluate_for_principal(
            db=db,
            tenant_id=tenant_id,
            principal_id=principal_id,
            attributes=new_attributes,
            trigger_type="MOVER",
            authority_epoch=principal.authority_epoch
        )
        
        # Check SoD conflicts with candidate entitlements
        ent_ids = birthright_eval.get("granted", [])
        sod_eval = None
        if ent_ids:
            sod_eval = SoDEngine.evaluate(db, tenant_id, principal_id, ent_ids)

        payload_str = json.dumps({"principal_id": principal_id, "new_attributes": new_attributes}, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        event = LifecycleEvent(
            tenant_id=tenant_id,
            principal_id=principal_id,
            event_type="MOVER",
            source="HRMS",
            payload_hash=payload_hash,
            payload={
                "new_attributes": new_attributes,
                "birthright_evaluation": birthright_eval,
                "sod_evaluation": sod_eval
            },
            status="PROCESSED"
        )
        db.add(event)
        db.commit()

        return {
            "status": "SUCCESS",
            "event_type": "MOVER",
            "principal_id": principal.id,
            "new_authority_epoch": principal.authority_epoch,
            "birthright_granted": birthright_eval.get("granted", []),
            "birthright_removed": birthright_eval.get("removed", []),
            "sod_conflicts": sod_eval.get("conflicts", []) if sod_eval else [],
            "event_id": event.id
        }

    @staticmethod
    def process_leaver(db: Session, tenant_id: str, principal_id: str) -> dict:
        """
        LEAVER Workflow: freeze principal -> authority_epoch++ -> block runtime auth/JIT/delegation -> cascade revoke accounts/credentials/delegations -> verify provider removal.
        """
        principal = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.id == principal_id).first()
        if principal:
            principal.is_frozen = True
            principal.status = "FROZEN"
            principal.authority_epoch += 1
            principal.updated_at = datetime.utcnow()

        # Update Identity table if exists
        identity = db.query(Identity).filter(Identity.tenant_id == tenant_id, Identity.employee_id == principal_id).first()
        if identity:
            identity.status = "Inactive"
            identity.is_frozen = True
            identity.authority_epoch = principal.authority_epoch
            identity.updated_at = datetime.utcnow()

        # Execute dual lineage cascade revocation (Identity delegations + Credentials + Accounts)
        cascade_res = TemporalProvenanceService.cascade_revoke_dual_lineage(
            db=db,
            tenant_id=tenant_id,
            root_principal_id=principal_id
        )

        payload_hash = hashlib.sha256(f"LEAVER_{tenant_id}_{principal_id}".encode("utf-8")).hexdigest()
        event = LifecycleEvent(
            tenant_id=tenant_id,
            principal_id=principal_id,
            event_type="LEAVER",
            source="HRMS",
            payload_hash=payload_hash,
            payload={"cascade_summary": cascade_res},
            status="PROCESSED"
        )
        db.add(event)
        db.commit()

        return {
            "status": "SUCCESS",
            "event_type": "LEAVER",
            "principal_id": principal_id,
            "is_frozen": True,
            "cascade_revocation_summary": cascade_res,
            "event_id": event.id
        }

    @staticmethod
    def process_rehire(db: Session, tenant_id: str, principal_id: str, display_name: str = None, email: str = None, attributes: dict = None) -> dict:
        """
        REHIRE Workflow:
        - Reactivates Principal with new authority_epoch.
        - NEVER reactivates historical credentials or JIT leases.
        - NEVER automatically restores old delegations.
        - Recalculates authority cleanly from current active policies.
        """
        attributes = attributes or {}
        principal = db.query(Principal).filter(Principal.tenant_id == tenant_id, Principal.id == principal_id).first()
        if not principal:
            raise ValueError(f"Principal '{principal_id}' not found for tenant '{tenant_id}'.")

        principal.status = "ACTIVE"
        principal.is_frozen = False
        principal.authority_epoch += 1
        if display_name:
            principal.display_name = display_name
        if email:
            principal.email = email
        principal.updated_at = datetime.utcnow()

        # Update Identity table
        identity = db.query(Identity).filter(Identity.tenant_id == tenant_id, Identity.employee_id == principal_id).first()
        if identity:
            identity.status = "Active"
            identity.is_frozen = False
            identity.authority_epoch = principal.authority_epoch
            if "department" in attributes:
                identity.department = attributes["department"]
            if "job_title" in attributes:
                identity.job_title = attributes["job_title"]
            identity.attributes = attributes
            identity.updated_at = datetime.utcnow()

        # Re-evaluate birthright access fresh
        birthright_eval = BirthrightService.evaluate_for_principal(
            db=db,
            tenant_id=tenant_id,
            principal_id=principal_id,
            attributes=attributes,
            trigger_type="REHIRE",
            authority_epoch=principal.authority_epoch
        )

        payload_str = json.dumps({"principal_id": principal_id, "attributes": attributes}, sort_keys=True)
        payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        event = LifecycleEvent(
            tenant_id=tenant_id,
            principal_id=principal_id,
            event_type="REHIRE",
            source="HRMS",
            payload_hash=payload_hash,
            payload={
                "attributes": attributes,
                "birthright_evaluation": birthright_eval
            },
            status="PROCESSED"
        )
        db.add(event)
        db.commit()
        db.refresh(principal)

        return {
            "status": "SUCCESS",
            "event_type": "REHIRE",
            "principal_id": principal.id,
            "authority_epoch": principal.authority_epoch,
            "birthright_granted": birthright_eval.get("granted", []),
            "event_id": event.id,
            "historical_credentials_reactivated": False,
            "historical_leases_restored": False,
            "historical_delegations_restored": False
        }

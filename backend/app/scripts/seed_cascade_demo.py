"""
Seed script for manually verifying the Cascade Revocation module end-to-end.
 
Run this once against your dev database to create:
  Human (Darshan) -> AI Agent A -> AI Agent B -> AI Agent C
 
Then trigger a revocation on the Human and confirm every downstream identity
and delegation link is actually revoked.
 
Usage:
    cd backend
    python -m app.scripts.seed_cascade_demo
"""
from datetime import datetime
from app.database import SessionLocal
from app.models.identity import Identity
from app.models.cascade_revocation import DelegationLink, RevocationEvent, CascadeAction
 
 
def run():
    db = SessionLocal()
    try:
        # Clean up any previous run of this demo (idempotent re-run)
        old_ids = [i.id for i in db.query(Identity).filter(
            Identity.employee_id.in_(["DEMO-HUMAN-01", "DEMO-AGENT-A", "DEMO-AGENT-B", "DEMO-AGENT-C"])
        ).all()]
        if old_ids:
            old_events = [e.id for e in db.query(RevocationEvent).filter(RevocationEvent.source_identity_id.in_(old_ids)).all()]
            if old_events:
                db.query(CascadeAction).filter(CascadeAction.event_id.in_(old_events)).delete(synchronize_session=False)
                db.query(RevocationEvent).filter(RevocationEvent.id.in_(old_events)).delete(synchronize_session=False)
            db.query(DelegationLink).filter(
                (DelegationLink.parent_identity_id.in_(old_ids)) | (DelegationLink.child_identity_id.in_(old_ids))
            ).delete(synchronize_session=False)
            db.query(Identity).filter(Identity.id.in_(old_ids)).delete(synchronize_session=False)
            db.commit()
            print(f"Cleaned up {len(old_ids)} identities from a previous demo run.")
 
        human = Identity(
            employee_id="DEMO-HUMAN-01",
            first_name="Darshan",
            display_name="Darshan Kumar (Demo)",
            department="Engineering",
            status="Active",
            source_connector_name="Manual Entry",
            created_at=datetime.utcnow()
        )
        db.add(human)
        db.commit()
        db.refresh(human)
 
        agent_a = Identity(
            employee_id="DEMO-AGENT-A",
            display_name="DevOps-Agent-A (Demo)",
            status="Active",
            department="Engineering",
            source_connector_name="Agent Catalog",
            created_at=datetime.utcnow()
        )
        agent_b = Identity(
            employee_id="DEMO-AGENT-B",
            display_name="Analysis-Agent-B (Demo)",
            status="Active",
            department="Engineering",
            source_connector_name="Agent Catalog",
            created_at=datetime.utcnow()
        )
        agent_c = Identity(
            employee_id="DEMO-AGENT-C",
            display_name="Database-Agent-C (Demo)",
            status="Active",
            department="Engineering",
            source_connector_name="Agent Catalog",
            created_at=datetime.utcnow()
        )
        db.add_all([agent_a, agent_b, agent_c])
        db.commit()
        db.refresh(agent_a); db.refresh(agent_b); db.refresh(agent_c)
 
        db.add_all([
            DelegationLink(parent_identity_id=human.id, child_identity_id=agent_a.id,
                            delegation_type="AGENT", status="Active"),
            DelegationLink(parent_identity_id=agent_a.id, child_identity_id=agent_b.id,
                            delegation_type="AGENT", status="Active"),
            DelegationLink(parent_identity_id=agent_b.id, child_identity_id=agent_c.id,
                            delegation_type="AGENT", status="Active"),
        ])
        db.commit()
 
        print("Seed complete.")
        print(f"  Human identity id:    {human.id}  ({human.display_name})")
        print(f"  Agent A identity id:  {agent_a.id}  ({agent_a.display_name})")
        print(f"  Agent B identity id:  {agent_b.id}  ({agent_b.display_name})")
        print(f"  Agent C identity id:  {agent_c.id}  ({agent_c.display_name})")
        print()
        print("Next step — trigger a real cascade with:")
        print(f'  POST /api/revocation-events')
        print(f'  body: {{"source_identity_id": {human.id}, "reason": "Demo run"}}')
        print()
        print("Then check:")
        print(f'  GET /api/revocation-events/{{event_id}}   -> confirm CascadeAction rows')
        print(f'  GET /api/delegation-links/graph/{human.id}  -> confirm graph hierarchy')
 
    finally:
        db.close()
 
 
if __name__ == "__main__":
    run()

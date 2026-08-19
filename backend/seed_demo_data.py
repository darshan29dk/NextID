import os
import json
from datetime import datetime
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models.identity import Identity
from app.models.cascade_revocation import RevocationEvent, CascadeAction, DelegationLink
from app.models.provider_credential import ProviderCredential
from app.models.notification import Notification
from app.utils.secret_encryption import encrypt_secret
from app.services.audit_chain import append_audit_log

def seed_demo_data():
    """
    Seeds comprehensive NextID demo data for demonstrating all 8 phases:
    Identities, Delegation Chains, Provider Credentials, Revocation History, and Orphaned Alerts.
    """
    print("[INFO] Starting NextID Demo Data Seeding...")
    db: Session = SessionLocal()

    try:
        # 1. Clear previous demo data cleanly
        db.query(CascadeAction).delete()
        db.query(RevocationEvent).delete()
        db.query(DelegationLink).delete()
        db.query(ProviderCredential).delete()
        db.query(Identity).filter(Identity.email.like("%@nextid-demo.com")).delete()
        db.commit()

        print("  [OK] Cleared previous demo records.")

        # 2. Seed Master Identities
        root_ident = Identity(
            employee_id="EMP-1001",
            first_name="Darshan",
            last_name="Reddy",
            display_name="Darshan Reddy (Head of Tech)",
            email="darshan@nextid-demo.com",
            department="Executive",
            job_title="VP of Technology",
            status="Active",
            org="NextID Corporate",
            max_delegation_depth=5,
            source_connector_name="Workday HR Feed",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(root_ident)

        alex_ident = Identity(
            employee_id="EMP-1002",
            first_name="Alex",
            last_name="Morgan",
            display_name="Alex Morgan (Lead Engineer)",
            email="alex@nextid-demo.com",
            department="Engineering",
            job_title="Lead Systems Architect",
            status="Active",
            org="NextID Engineering",
            max_delegation_depth=3,
            source_connector_name="Workday HR Feed",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(alex_ident)

        agent_ident = Identity(
            employee_id="NHI-3001",
            display_name="DataPipeline Agent v2 (AI Subagent)",
            email="agent-pipeline@nextid-demo.com",
            department="Infrastructure",
            job_title="Autonomous Data Sync Bot",
            status="Active",
            org="NextID Engineering",
            source_connector_name="Agent Catalog",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(agent_ident)

        inactive_root = Identity(
            employee_id="EMP-0999",
            first_name="Legacy",
            last_name="Admin",
            display_name="Legacy System Admin (Terminated)",
            email="legacy-admin@nextid-demo.com",
            department="IT Support",
            job_title="Former IT Admin",
            status="Inactive",
            org="NextID Corporate",
            source_connector_name="Manual Entry",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(inactive_root)

        db.commit()
        db.refresh(root_ident)
        db.refresh(alex_ident)
        db.refresh(agent_ident)
        db.refresh(inactive_root)

        print(f"  [OK] Created Identities: Root ID={root_ident.id}, Alex ID={alex_ident.id}, Agent ID={agent_ident.id}")

        # 3. Seed Delegation Graph Links
        link1 = DelegationLink(
            parent_identity_id=root_ident.id,
            child_identity_id=alex_ident.id,
            delegation_type="DELEGATE",
            origin_org="NextID Corporate",
            status="Active"
        )
        db.add(link1)

        link2 = DelegationLink(
            parent_identity_id=alex_ident.id,
            child_identity_id=agent_ident.id,
            delegation_type="DELEGATE",
            origin_org="External Vendor Inc",  # Cross-Org Boundary Flag Demo
            status="Active"
        )
        db.add(link2)

        # Orphaned Authority Link (Active delegation from Inactive Root)
        orphaned_link = DelegationLink(
            parent_identity_id=inactive_root.id,
            child_identity_id=agent_ident.id,
            delegation_type="DELEGATE",
            origin_org="NextID Corporate",
            status="Active"
        )
        db.add(orphaned_link)

        db.commit()
        print("  [OK] Created Delegation Graph Links (including Cross-Org and Orphaned Links).")

        # 4. Seed Provider Credentials with Fernet Encryption
        github_cred = ProviderCredential(
            provider="GitHub",
            credential_name="GitHub Production Admin Token",
            encrypted_secret=encrypt_secret("ghp_demo_secret_token_abcdef1234567890"),
            config={"client_id": "nextid_oauth_app_demo", "org": "NextID-Org"},
            status="Active",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(github_cred)

        aws_cred = ProviderCredential(
            provider="AWS",
            credential_name="AWS Cloud Infrastructure Admin",
            encrypted_secret=encrypt_secret("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
            config={"aws_access_key_id": "AKIAIOSFODNN7EXAMPLE", "region": "us-east-1"},
            status="Active",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(aws_cred)

        mcp_cred = ProviderCredential(
            provider="MCP",
            credential_name="MCP Agent Gateway Session Service",
            encrypted_secret=encrypt_secret("mcp_gateway_token_998877665544332211"),
            config={"base_url": "http://localhost:8000/api/mcp", "path_template": "/sessions/{session_id}/terminate"},
            status="Active",
            created_by="DemoSeeder",
            modified_by="DemoSeeder"
        )
        db.add(mcp_cred)

        db.commit()
        print("  [OK] Created Encrypted Provider Credentials (GitHub, AWS IAM, MCP).")

        # 5. Seed Historical Revocation Event & Actions
        demo_event = RevocationEvent(
            source_identity_id=alex_ident.id,
            reason="Role Transition Offboarding",
            status="Completed",
            total_targets=4,
            revoked_count=4,
            failed_count=0,
            duration_seconds=1.45,
            completed_at=datetime.utcnow()
        )
        db.add(demo_event)
        db.commit()
        db.refresh(demo_event)

        actions_data = [
            ("HUMAN_ACCOUNT", "alex@nextid-demo.com", "REVOCATION", 1),
            ("SERVICE_ACCOUNT", "sa-engineering-1002", "REVOCATION", 1),
            ("API_KEY", "key-EMP-1002", "REVOCATION", 2),
            ("AGENT_SESSION", "mcp-session-3001", "Token Invalidated (Cross-Org — Not Confirmed)", 2)
        ]

        for target_type, identifier, action_type, depth in actions_data:
            act = CascadeAction(
                event_id=demo_event.id,
                target_type=target_type,
                target_identifier=identifier,
                action_type=action_type,
                status="Confirmed",
                hop_depth=depth,
                confirmed_at=datetime.utcnow()
            )
            db.add(act)

        db.commit()
        print(f"  [OK] Created Historical Revocation Event #{demo_event.id} with 4 per-hop Cascade Actions.")

        # 6. Seed Tamper-Evident SHA-256 Audit Log Entries
        append_audit_log(
            db=db,
            module="System Initialization",
            action="Demo Seeding Completed",
            performed_by="DemoSeeder",
            new_value="NextID Demo Environment initialized with Identities, Delegations, Credentials, and Audit Chain."
        )

        db.add(Notification(
            title="Orphaned Authority Alert",
            message="1 orphaned AI agent/authority link(s) detected — review required.",
            status="unread"
        ))
        db.commit()

        print("\n[SUCCESS] NextID Demo Data Seeding Completed Successfully!")
        print("==================================================")
        print(f"Target Demo Root Identity ID: {root_ident.id} ({root_ident.display_name})")
        print(f"Target Demo Child Identity ID: {alex_ident.id} ({alex_ident.display_name})")
        print("==================================================\n")

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Error during demo data seeding: {exc}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_demo_data()

import sys
import os

# Append parent dir to python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import app.main to initialize and resolve all models
import app.main

from app.database import SessionLocal
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.candidate_role_member import CandidateRoleMember
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.audit_log import AuditLog
from app.models.dashboard import RecentActivity
from app.services.approval_workflow_service import ApprovalWorkflowService
from app.services.business_approval_service import BusinessApprovalService

def test_approvals():
    db = SessionLocal()
    print("=== Start Automated Approval Workflow Group 1 Tests ===")

    # 1. Clean up any previous test candidate roles
    test_role_name = "Automated Test Approval Role"
    role_names = [test_role_name, "Bulk Role 1", "Bulk Role 2"]
    
    # Delete dependent steps first, then requests, then roles
    roles = db.query(CandidateRole).filter(CandidateRole.role_name.in_(role_names)).all()
    role_ids = [r.id for r in roles]
    if role_ids:
        reqs = db.query(ApprovalRequest).filter(ApprovalRequest.candidate_role_id.in_(role_ids)).all()
        req_ids = [req.id for req in reqs]
        if req_ids:
            db.query(ApprovalStep).filter(ApprovalStep.approval_request_id.in_(req_ids)).delete(synchronize_session=False)
            db.query(ApprovalRequest).filter(ApprovalRequest.id.in_(req_ids)).delete(synchronize_session=False)
        db.query(CandidateRole).filter(CandidateRole.id.in_(role_ids)).delete(synchronize_session=False)
    db.commit()

    # 2. Create an incomplete role
    print("\n1. Testing Submission Validation...")
    incomplete = CandidateRole(
        role_name=test_role_name,
        role_description=None,  # Missing description
        classification=None,    # Missing classification
        primary_owner_name=None, # Missing owner
        status="Draft",
        application_count=0,
        entitlement_count=0,
        user_count=0
    )
    db.add(incomplete)
    db.commit()
    db.refresh(incomplete)

    # Submission should fail
    try:
        ApprovalWorkflowService.submit_role(db, incomplete.id, "High", "Submit incomplete role", "TestRunner")
        print("[FAIL] Incomplete role submission went through!")
    except ValueError as e:
        print(f"[PASS] Submission rejected as expected: {str(e)}")

    # 3. Complete the role attributes
    print("\n2. Completing Role Attributes & Re-Submitting...")
    incomplete.role_description = "Fully populated test role description"
    incomplete.classification = "Birthright"
    incomplete.primary_owner_name = "Jane Doe"
    incomplete.primary_owner_id = 999
    incomplete.application_count = 1
    incomplete.entitlement_count = 2
    incomplete.user_count = 5
    incomplete.status = "Draft"
    db.commit()

    # Submit should succeed now
    try:
        res = ApprovalWorkflowService.submit_role(db, incomplete.id, "High", "Submit complete role", "TestRunner")
        print(f"[PASS] Role submitted successfully. Request ID: {res['id']}")
        
        # Check CandidateRole status
        db.refresh(incomplete)
        print(f"Candidate Role Status updated to: '{incomplete.status}' (Expected: 'Under Review')")
        assert incomplete.status == "Under Review"

        # Check ApprovalRequest record
        req = db.query(ApprovalRequest).filter(ApprovalRequest.id == res["id"]).first()
        print(f"Approval Request Status: '{req.status}' (Expected: 'Business Review')")
        assert req.status == "Business Review"
        print(f"Approval Request Due Date set: {req.due_date}")
        assert req.due_date is not None

        # Check ApprovalStep record
        step = db.query(ApprovalStep).filter(ApprovalStep.approval_request_id == req.id).first()
        print(f"Approval Step Name: '{step.step_name}', Status: '{step.status}', Assigned Approver: '{step.approver_name}'")
        assert step.step_name == "Business Review"
        assert step.status == "Pending"
        assert step.approver_name == "Jane Doe"

    except Exception as e:
        print(f"[FAIL] Complete role submission failed: {str(e)}")
        db.close()
        return

    # 4. Test unauthorized business approval (caller name mismatch)
    print("\n3. Testing Reviewer Authorization Check...")
    try:
        BusinessApprovalService.approve_request(db, req.id, "Unauthorized User", "Business Owner", "Approve remarks")
        print("[FAIL] Unauthorized user approved the request!")
    except ValueError as e:
        print(f"[PASS] Unauthorized review rejected as expected: {str(e)}")

    # 5. Test successful Business Approval (Primary Owner)
    print("\n4. Testing Business Approval...")
    try:
        approve_res = BusinessApprovalService.approve_request(db, req.id, "Jane Doe", "Business Owner", "Approved by owner")
        print(f"[PASS] Request approved: {approve_res['message']}")
        
        db.refresh(incomplete)
        db.refresh(req)
        db.refresh(step)
        print(f"Candidate Role Status is now: '{incomplete.status}' (Expected: 'Approved')")
        assert incomplete.status == "Approved"
        print(f"Approval Request Status is now: '{req.status}' (Expected: 'Business Approved')")
        assert req.status == "Business Approved"
        print(f"Approval Step Status is now: '{step.status}' (Expected: 'Approved')")
        assert step.status == "Approved"

    except Exception as e:
        print(f"[FAIL] Business approval failed: {str(e)}")

    # 6. Reset candidate role for Return for Rework test
    print("\n5. Testing Return for Rework flow...")
    incomplete.status = "Draft"
    db.commit()

    # Re-submit role
    res2 = ApprovalWorkflowService.submit_role(db, incomplete.id, "Low", "Re-submitting for return test", "TestRunner")
    req2 = db.query(ApprovalRequest).filter(ApprovalRequest.id == res2["id"]).first()
    
    # Return for rework
    try:
        return_res = BusinessApprovalService.return_request(db, req2.id, "Jane Doe", "Business Owner", "Rework requested")
        print(f"[PASS] Request returned: {return_res['message']}")
        
        db.refresh(incomplete)
        db.refresh(req2)
        print(f"Candidate Role Status is now: '{incomplete.status}' (Expected: 'Draft')")
        assert incomplete.status == "Draft"
        print(f"Approval Request Status is now: '{req2.status}' (Expected: 'Returned For Rework')")
        assert req2.status == "Returned For Rework"

    except Exception as e:
        print(f"[FAIL] Return for rework failed: {str(e)}")

    # 7. Test Bulk approvals
    print("\n6. Testing Bulk Operations...")
    
    # Create two more ready roles
    bulk1 = CandidateRole(role_name="Bulk Role 1", role_description="Desc", classification="Birthright", primary_owner_name="Jane Doe", primary_owner_id=999, status="Draft", application_count=1, entitlement_count=1, user_count=1)
    bulk2 = CandidateRole(role_name="Bulk Role 2", role_description="Desc", classification="Birthright", primary_owner_name="Jane Doe", primary_owner_id=999, status="Draft", application_count=1, entitlement_count=1, user_count=1)
    db.add_all([bulk1, bulk2])
    db.commit()

    sub1 = ApprovalWorkflowService.submit_role(db, bulk1.id, "Medium", "Bulk sub 1", "TestRunner")
    sub2 = ApprovalWorkflowService.submit_role(db, bulk2.id, "Medium", "Bulk sub 2", "TestRunner")

    # Run Bulk approve
    try:
        bulk_res = BusinessApprovalService.bulk_approve(db, [sub1["id"], sub2["id"]], "Jane Doe", "Business Owner", "Bulk approved")
        print(f"[PASS] Bulk approval completed. Success count: {bulk_res['success_count']}")
        assert bulk_res["success_count"] == 2
        
        db.refresh(bulk1)
        db.refresh(bulk2)
        print(f"Bulk Role 1 Status: '{bulk1.status}' (Expected: 'Approved')")
        print(f"Bulk Role 2 Status: '{bulk2.status}' (Expected: 'Approved')")
        assert bulk1.status == "Approved"
        assert bulk2.status == "Approved"

    except Exception as e:
        print(f"[FAIL] Bulk approval test failed: {str(e)}")

    # Cleanup bulk test roles
    roles_end = db.query(CandidateRole).filter(CandidateRole.role_name.in_(role_names)).all()
    role_ids_end = [r.id for r in roles_end]
    if role_ids_end:
        reqs_end = db.query(ApprovalRequest).filter(ApprovalRequest.candidate_role_id.in_(role_ids_end)).all()
        req_ids_end = [req.id for req in reqs_end]
        if req_ids_end:
            db.query(ApprovalStep).filter(ApprovalStep.approval_request_id.in_(req_ids_end)).delete(synchronize_session=False)
            db.query(ApprovalRequest).filter(ApprovalRequest.id.in_(req_ids_end)).delete(synchronize_session=False)
        db.query(CandidateRole).filter(CandidateRole.id.in_(role_ids_end)).delete(synchronize_session=False)
    db.commit()
    db.close()
    print("\n=== All Backend Approval Group 1 Tests Completed ===")

if __name__ == "__main__":
    test_approvals()

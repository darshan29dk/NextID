import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"
HEADERS = {
    "X-User-Role": "Platform Administrator",
    "X-User-Name": "Darshan Kumar"
}

def run_tests():
    print("=== STARTING MERGE & SPLIT BACKEND INTEGRATION TESTS ===")
    
    # 1. Create two test candidate roles
    print("\nCreating candidate role 1: Test Finance Analyst...")
    r1 = requests.post(f"{BASE_URL}/candidate-roles", json={
        "role_name": "Test Finance Analyst",
        "role_description": "First test role for merge",
        "role_type": "Business",
        "risk_level": "Low",
        "status": "Draft",
        "department": "Finance",
        "business_unit": "Investment"
    }, headers=HEADERS)
    print(f"Status: {r1.status_code}")
    print(f"Response text: {r1.text}")
    role_1 = r1.json()
    role_1_id = role_1.get("id")
    print(f"Role 1 ID: {role_1_id}")

    print("\nCreating candidate role 2: Test Finance Auditor...")
    r2 = requests.post(f"{BASE_URL}/candidate-roles", json={
        "role_name": "Test Finance Auditor",
        "role_description": "Second test role for merge",
        "role_type": "Technical",
        "risk_level": "Medium",
        "status": "Reviewed",
        "department": "Finance",
        "business_unit": "Investment"
    }, headers=HEADERS)
    print(f"Status: {r2.status_code}")
    print(f"Response text: {r2.text}")
    role_2 = r2.json()
    role_2_id = role_2.get("id")
    print(f"Role 2 ID: {role_2_id}")

    # Map entitlements and users to test roles
    # Let's verify details (initially empty)
    r_detail = requests.get(f"{BASE_URL}/candidate-roles/{role_1_id}", headers=HEADERS)
    print(f"\nDetail Role 1 keys: {list(r_detail.json().keys())}")

    # 2. Test Merge Preview
    print("\nTesting POST /api/candidate-roles/merge/preview...")
    payload_preview = {"role_ids": [role_1_id, role_2_id]}
    rp = requests.post(f"{BASE_URL}/candidate-roles/merge/preview", json=payload_preview, headers=HEADERS)
    print(f"Status: {rp.status_code}")
    preview_data = rp.json()
    print("Preview Results:")
    print(f"  * Estimated Confidence: {preview_data.get('estimated_confidence_score')}%")
    print(f"  * Combined User Count: {preview_data.get('combined_user_count')}")
    print(f"  * Combined Entitlement Count: {preview_data.get('combined_entitlement_count')}")
    print(f"  * Overlapping Users: {preview_data.get('duplicate_user_count')}")
    print(f"  * Overlapping Entitlements: {preview_data.get('duplicate_entitlement_count')}")
    print(f"  * SoD Violations: {preview_data.get('sod_violation_count')}")

    # 3. Test Merge Execution
    print("\nTesting POST /api/candidate-roles/merge...")
    payload_exec = {
        "role_ids": [role_1_id, role_2_id],
        "destination_name": "Consolidated Finance Role",
        "description": "Merged test role for finance operations",
        "merge_reason": "Combining Analyst and Auditor roles for testing"
    }
    re = requests.post(f"{BASE_URL}/candidate-roles/merge", json=payload_exec, headers=HEADERS)
    print(f"Status: {re.status_code}")
    print(f"Response text: {re.text}")
    exec_data = re.json()
    dest_role_id = exec_data.get("destination_role_id")
    history_id = exec_data.get("merge_history_id")
    print(f"Destination Role ID: {dest_role_id}")
    print(f"Merge History ID: {history_id}")

    # Verify destination role is created and source roles are marked Merged
    r_dest = requests.get(f"{BASE_URL}/candidate-roles/{dest_role_id}", headers=HEADERS)
    dest_role = r_dest.json()
    print(f"\nConsolidated Role Name: {dest_role['role_name']}")
    print(f"Consolidated Status: {dest_role['status']}")
    print(f"Consolidated Source: {dest_role['source']}")

    r1_check = requests.get(f"{BASE_URL}/candidate-roles/{role_1_id}", headers=HEADERS).json()
    r2_check = requests.get(f"{BASE_URL}/candidate-roles/{role_2_id}", headers=HEADERS).json()
    print(f"Role 1 Status (Expected Merged): {r1_check['status']}")
    print(f"Role 2 Status (Expected Merged): {r2_check['status']}")

    # 4. Get Merge History
    print("\nTesting GET /api/candidate-roles/merge-history...")
    rmh = requests.get(f"{BASE_URL}/candidate-roles/merge-history", headers=HEADERS)
    print(f"Status: {rmh.status_code}")
    print(f"Response text: {rmh.text}")
    if rmh.status_code == 200:
        history_list = rmh.json()
        print(f"Total merge history entries: {len(history_list)}")
        if history_list:
            first = history_list[0]
            print(f"  * Parent: {first['parent_role_name']}, Sources: {[s['role_name'] for s in first['source_roles']]}")
    else:
        history_list = []

    # 5. Test Undo Merge
    print(f"\nTesting POST /api/candidate-roles/merge/{history_id}/undo...")
    ru = requests.post(f"{BASE_URL}/candidate-roles/merge/{history_id}/undo", headers=HEADERS)
    print(f"Status: {ru.status_code}")
    print(ru.json())

    r1_restore = requests.get(f"{BASE_URL}/candidate-roles/{role_1_id}", headers=HEADERS).json()
    r2_restore = requests.get(f"{BASE_URL}/candidate-roles/{role_2_id}", headers=HEADERS).json()
    print(f"Role 1 Status (Expected Draft): {r1_restore['status']}")
    print(f"Role 2 Status (Expected Reviewed): {r2_restore['status']}")

    # 6. Test Split Preview
    # We will use existing Billing Administrator role (ID 7)
    print("\nTesting POST /api/candidate-roles/7/split/preview...")
    rs_prev = requests.post(f"{BASE_URL}/candidate-roles/7/split/preview", json={"split_method": "application"}, headers=HEADERS)
    print(f"Status: {rs_prev.status_code}")
    print(f"Response text: {rs_prev.text}")
    split_prev = rs_prev.json()
    print(f"Proposed split count: {len(split_prev['splits'])}")
    for i, s in enumerate(split_prev['splits']):
        print(f"  Split {i+1}: Name: {s['role_name']}, Users: {s['user_count']}, Entitlements: {s['entitlement_count']}, Confidence: {s['estimated_confidence_score']}%")

    # 7. Test Split Execution
    # We will split Billing Administrator (ID 7) using the preview splits payload
    print("\nTesting POST /api/candidate-roles/7/split...")
    split_payload = {
        "split_method": "application",
        "splits": split_prev["splits"],
        "split_reason": "Splitting billing admin by applications for granular access controls"
    }
    rs_exec = requests.post(f"{BASE_URL}/candidate-roles/7/split", json=split_payload, headers=HEADERS)
    print(f"Status: {rs_exec.status_code}")
    split_exec = rs_exec.json()
    split_history_id = split_exec.get("split_history_id")
    print(f"Created Split Role IDs: {split_exec.get('created_role_ids')}")
    print(f"Split History ID: {split_history_id}")

    r7_check = requests.get(f"{BASE_URL}/candidate-roles/7", headers=HEADERS).json()
    print(f"Original Role 7 Status (Expected Split): {r7_check['status']}")

    # 8. Get Split History
    print("\nTesting GET /api/candidate-roles/split-history...")
    rsh = requests.get(f"{BASE_URL}/candidate-roles/split-history", headers=HEADERS)
    print(f"Status: {rsh.status_code}")
    split_histories = rsh.json()
    print(f"Total split history entries: {len(split_histories)}")

    # 9. Test Undo Split
    print(f"\nTesting POST /api/candidate-roles/split/{split_history_id}/undo...")
    rsu = requests.post(f"{BASE_URL}/candidate-roles/split/{split_history_id}/undo", headers=HEADERS)
    print(f"Status: {rsu.status_code}")
    print(rsu.json())

    r7_restore = requests.get(f"{BASE_URL}/candidate-roles/7", headers=HEADERS).json()
    print(f"Original Role 7 Status (Expected restored to Draft/Reviewed): {r7_restore['status']}")

    # 10. Clean up created roles
    print("\nCleaning up temporary test roles...")
    requests.delete(f"{BASE_URL}/candidate-roles/{role_1_id}", headers=HEADERS)
    requests.delete(f"{BASE_URL}/candidate-roles/{role_2_id}", headers=HEADERS)
    print("Done!")

if __name__ == "__main__":
    run_tests()

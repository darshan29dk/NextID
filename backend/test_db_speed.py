import time
import os
import sys

# Add backend directory to path
sys.path.append(r'c:\Users\Darshan\Desktop\dashboard\backend')

from app.database import SessionLocal, engine
import app.models.user
import app.models.notification
import app.models.dashboard
import app.models.platform_role
import app.models.platform_user
import app.models.audit_log
import app.models.license
import app.models.menu_permission
import app.models.attribute_category
import app.models.identity_attribute
import app.models.account_attribute
import app.models.entitlement_attribute
import app.models.role_attribute
import app.models.connector
import app.models.connector_log
import app.models.connector_file
import app.models.connector_field_mapping
import app.models.transformation_rule
import app.models.validation_rule
import app.models.import_preview
import app.models.application
import app.models.application_field_mapping
import app.models.application_account
import app.models.application_entitlement
import app.models.application_role
import app.models.import_run_history
import app.models.identity
import app.models.application_account_entitlement
import app.models.correlation_rule

from app.models.identity import Identity
from app.models.application_account import ApplicationAccount
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.application import Application
from sqlalchemy import text

db = SessionLocal()
try:
    print("--- Testing Queries ---")
    
    # 1. Identities paginated
    t0 = time.time()
    total = db.query(Identity).filter(Identity.is_deleted == False).count()
    ids = db.query(Identity).filter(Identity.is_deleted == False).offset(0).limit(25).all()
    t1 = time.time()
    print(f"Identities pagination (count + 25 rows): {t1-t0:.4f}s")
    
    # 2. Identities filter meta
    t0 = time.time()
    departments = [
        row[0] for row in db.query(Identity.department).filter(
            Identity.is_deleted == False, Identity.department.isnot(None)
        ).distinct().all()
    ]
    statuses = [
        row[0] for row in db.query(Identity.status).filter(
            Identity.is_deleted == False
        ).distinct().all()
    ]
    t1 = time.time()
    print(f"Identities filter meta query (distinct depts & statuses): {t1-t0:.4f}s")
    
    # 3. Identities stats query
    t0 = time.time()
    from sqlalchemy import func
    total = db.query(func.count(Identity.id)).filter(Identity.is_deleted == False).scalar() or 0
    active = db.query(func.count(Identity.id)).filter(Identity.is_deleted == False, Identity.status == "Active").scalar() or 0
    depts = db.query(func.count(func.distinct(Identity.department))).filter(
        Identity.is_deleted == False, 
        Identity.department != None, 
        Identity.department != ""
    ).scalar() or 0
    t1 = time.time()
    print(f"Identities stats (three count queries): {t1-t0:.4f}s")
    
    # 4. Correlation list
    t0 = time.time()
    # Pick a random email
    rand_email = db.query(Identity.email).filter(Identity.is_deleted == False, Identity.email != None).limit(1).scalar()
    print(f"Selected random email: {rand_email}")
    if rand_email:
        matches = db.query(ApplicationAccount, Application).join(
            Application, ApplicationAccount.application_id == Application.id
        ).filter(
            ApplicationAccount.email == rand_email,
            ApplicationAccount.is_deleted == False,
            Application.is_deleted == False
        ).all()
    t1 = time.time()
    print(f"Correlated accounts query: {t1-t0:.4f}s")
    
    # Let's inspect database indexes
    print("\n--- DB Table Indexes ---")
    with engine.connect() as conn:
        for table in ["identities", "application_accounts", "application_account_entitlements", "applications", "application_entitlements"]:
            print(f"\nIndexes for table: {table}")
            res = conn.execute(text(f"SHOW INDEX FROM {table}"))
            for row in res.fetchall():
                # Column 2 (Key_name), Column 4 (Column_name)
                print(f"  Key: {row[2]}, Column: {row[4]}")
                
finally:
    db.close()

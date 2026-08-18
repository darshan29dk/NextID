from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class _BcryptAbout:
        __version__ = getattr(bcrypt, "__version__", "4.0.0")
    bcrypt.__about__ = _BcryptAbout()

# pyrefly: ignore [missing-import]
from passlib.context import CryptContext
from app.routes import dashboard, notification, profile, theme, platform_user, platform_role, auth, audit_log, platform_settings, menu_permission, identity_attribute, account_attribute, entitlement_attribute, role_attribute, connectors as connectors_routes
from app.routes import connector_mapping
from app.routes import attribute_category
from app.routes import license as license_routes
from app.models.user import User
from app.models.notification import Notification
from app.models.dashboard import RecentActivity, IdentityRecord, ApprovalQueueItem, RoleRecord, RoleMiningTrendPoint
from app.models.platform_role import PlatformRole
from app.models.platform_user import PlatformUser
from app.models.audit_log import AuditLog
from app.models.license import License
from app.models.menu_permission import MenuPermission
from app.models.attribute_category import AttributeCategory
from app.models.identity_attribute import IdentityAttribute
from app.models.account_attribute import AccountAttribute
from app.models.entitlement_attribute import EntitlementAttribute
from app.models.role_attribute import RoleAttribute
from app.models.connector import Connector
from app.models.connector_log import ConnectorLog
from app.models.connector_file import ConnectorFile
from app.models.connector_field_mapping import ConnectorFieldMapping
from app.models.transformation_rule import TransformationRule
from app.models.validation_rule import ValidationRule
from app.models.import_preview import ImportPreview
from app.models.application import Application
from app.models.application_field_mapping import ApplicationFieldMapping
from app.models.application_account import ApplicationAccount
from app.models.application_entitlement import ApplicationEntitlement
from app.models.application_role import ApplicationRole
from app.models.import_run_history import ImportRunHistory
from app.models.identity import Identity
from app.models.application_account_entitlement import ApplicationAccountEntitlement
from app.models.correlation_rule import CorrelationRule
from app.models.mining_campaign import MiningCampaign
from app.models.candidate_role import CandidateRole
from app.models.candidate_role_entitlement import CandidateRoleEntitlement
from app.models.candidate_role_member import CandidateRoleMember
from app.models.role_merge_history import RoleMergeHistory
from app.models.role_merge_source_roles import RoleMergeSourceRole
from app.models.role_split_history import RoleSplitHistory
from app.models.role_split_destination_roles import RoleSplitDestinationRole
from app.models.campaign_account_result import CampaignAccountResult
from app.models.role_owner_history import RoleOwnerHistory
from app.models.approval_request import ApprovalRequest
from app.models.approval_step import ApprovalStep
from app.models.approval_comment import ApprovalComment
from app.models.role_version_history import RoleVersionHistory
from app.models.revocation import RevocationJob
from app.models.cascade_revocation import RevocationEvent, CascadeAction
from app.services.scheduler import start_scheduler, restore_active_schedules
from app.routes import transformations, validations, preview, revocation as revocation_routes, cascade_revocation as cascade_revocation_routes
from app.utils.crypto import encrypt_password
from datetime import datetime
from app.routes import application as application_routes
from app.routes import identity as identity_routes
from app.routes import correlation as correlation_routes
from app.routes import role_discovery as role_discovery_routes
from app.routes import candidate_role_workbench as candidate_role_workbench_routes
from app.routes import role_owner as role_owner_routes
from app.routes import role_approval as role_approval_routes
from app.routes import role_catalog as role_catalog_routes
from app.routes import sod_policy as sod_policy_routes
from app.routes import sod_violation as sod_violation_routes
from app.routes import sod_exception as sod_exception_routes
from app.routes import sod_dashboard as sod_dashboard_routes
from app.routes import analytics as analytics_routes
from app.models.sod_policy import SodPolicy, SodPolicyRule, SodPolicyAudit
from app.models.sod_violation import SodViolation, SodViolationComment, SodViolationAttachment, SodScanHistory, SodViolationAudit
from app.models.sod_exception import SodException, SodExceptionApproval, SodExceptionComment, SodExceptionAttachment, SodExceptionAudit
from app.models.sod_dashboard import GovernanceDashboardPreferences
from app.models.approval_workflow_config import ApprovalWorkflowConfig, ApprovalWorkflowLevel
from app.routes import approval_workflow_config as approval_workflow_config_routes

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

from sqlalchemy import text

def check_and_add_columns():
    if engine.dialect.name != "mysql":
        print("Connected to non-MySQL database (PostgreSQL/Supabase). Skipping MySQL column migrations.")
        return
    with engine.begin() as connection:
        try:
            result = connection.execute(text("SHOW COLUMNS FROM connector_files LIKE 'file_content'")).fetchone()
            if not result:
                print("Adding file_content to connector_files...")
                connection.execute(text("ALTER TABLE connector_files ADD COLUMN file_content LONGBLOB NULL"))
        except Exception as e:
            print(f"Error checking/altering connector_files table: {e}")

        try:
            result = connection.execute(text("SHOW COLUMNS FROM applications LIKE 'file_content'")).fetchone()
            if not result:
                print("Adding file_content to applications...")
                connection.execute(text("ALTER TABLE applications ADD COLUMN file_content LONGBLOB NULL"))
        except Exception as e:
            print(f"Error checking/altering applications table: {e}")

        # Check and add owner columns for applications table
        applications_owner_cols = {
            "owner_id": "INT NULL",
            "owner_employee_id": "VARCHAR(100) NULL",
            "owner_name": "VARCHAR(200) NULL",
            "owner_email": "VARCHAR(200) NULL"
        }
        for col, col_type in applications_owner_cols.items():
            try:
                res = connection.execute(text(f"SHOW COLUMNS FROM applications LIKE '{col}'")).fetchone()
                if not res:
                    print(f"Adding {col} to applications...")
                    connection.execute(text(f"ALTER TABLE applications ADD COLUMN {col} {col_type}"))
            except Exception as e:
                print(f"Error checking/altering applications column {col}: {e}")

        # Make campaign_id nullable for manually created/custom candidate roles
        try:
            print("Altering candidate_roles.campaign_id to allow NULL...")
            connection.execute(text("ALTER TABLE candidate_roles MODIFY campaign_id INT NULL"))
        except Exception as e:
            print(f"Error altering candidate_roles.campaign_id: {e}")

        # Make cluster_label nullable for manually created/custom candidate roles
        try:
            print("Altering candidate_roles.cluster_label to allow NULL...")
            connection.execute(text("ALTER TABLE candidate_roles MODIFY cluster_label INT NULL"))
        except Exception as e:
            print(f"Error altering candidate_roles.cluster_label: {e}")

        # Check and add columns for candidate_roles
        candidate_roles_cols = {
            "role_description": "VARCHAR(500) NULL",
            "role_type": "VARCHAR(50) NOT NULL DEFAULT 'Business'",
            "risk_level": "VARCHAR(50) NOT NULL DEFAULT 'Low'",
            "classification": "VARCHAR(100) NULL",
            "user_count": "INT NOT NULL DEFAULT 0",
            "entitlement_count": "INT NOT NULL DEFAULT 0",
            "application_count": "INT NOT NULL DEFAULT 0",
            "department": "VARCHAR(100) NULL",
            "business_unit": "VARCHAR(100) NULL",
            "source": "VARCHAR(100) NOT NULL DEFAULT 'Mining'",
            "generated_by": "VARCHAR(100) NOT NULL DEFAULT 'System'",
            "generated_on": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            "sod_violation_count": "INT NOT NULL DEFAULT 0",
            "updated_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
            "created_by": "VARCHAR(100) NOT NULL DEFAULT 'System'",
            "modified_by": "VARCHAR(100) NOT NULL DEFAULT 'System'",
            "is_deleted": "TINYINT(1) NOT NULL DEFAULT 0",
            # RE-005 owner fields (denormalized for fast lookup)
            "primary_owner_name": "VARCHAR(200) NULL",
            "primary_owner_email": "VARCHAR(200) NULL",
            "primary_owner_id": "INT NULL",
            "backup_owner_name": "VARCHAR(200) NULL",
            "backup_owner_email": "VARCHAR(200) NULL",
            "backup_owner_id": "INT NULL",
            "owner_review_date": "DATETIME NULL",
            # RC-001: Role Catalog publish tracking
            "published_at": "DATETIME NULL",
            "published_by": "VARCHAR(100) NULL",
            "current_version": "INT NOT NULL DEFAULT 0"
        }
        for col, col_type in candidate_roles_cols.items():
            try:
                res = connection.execute(text(f"SHOW COLUMNS FROM candidate_roles LIKE '{col}'")).fetchone()
                if not res:
                    print(f"Adding {col} to candidate_roles...")
                    connection.execute(text(f"ALTER TABLE candidate_roles ADD COLUMN {col} {col_type}"))
            except Exception as e:
                print(f"Error checking/altering candidate_roles column {col}: {e}")

        # Check and add columns for candidate_role_entitlements
        candidate_role_entitlements_cols = {
            "application_name": "VARCHAR(150) NULL",
            "risk": "VARCHAR(50) NOT NULL DEFAULT 'Low'",
            "created_at": "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
        }
        for col, col_type in candidate_role_entitlements_cols.items():
            try:
                res = connection.execute(text(f"SHOW COLUMNS FROM candidate_role_entitlements LIKE '{col}'")).fetchone()
                if not res:
                    print(f"Adding {col} to candidate_role_entitlements...")
                    connection.execute(text(f"ALTER TABLE candidate_role_entitlements ADD COLUMN {col} {col_type}"))
            except Exception as e:
                print(f"Error checking/altering candidate_role_entitlements column {col}: {e}")

        # APR-003: Security Review columns on approval_requests
        approval_request_security_cols = {
            "security_review_started_at": "DATETIME NULL",
            "security_review_completed_at": "DATETIME NULL",
            "security_reviewer_id": "INT NULL",
            "security_reviewer_name": "VARCHAR(200) NULL",
            "security_decision": "VARCHAR(50) NULL",
            "security_remarks": "TEXT NULL",
        }
        for col, col_type in approval_request_security_cols.items():
            try:
                res = connection.execute(text(f"SHOW COLUMNS FROM approval_requests LIKE '{col}'")).fetchone()
                if not res:
                    print(f"Adding {col} to approval_requests...")
                    connection.execute(text(f"ALTER TABLE approval_requests ADD COLUMN {col} {col_type}"))
            except Exception as e:
                print(f"Error checking/altering approval_requests column {col}: {e}")

        # Governance attachments: file_path was added so uploaded evidence is
        # actually written to disk (backend/uploads/) instead of being read
        # and discarded ("fake save" bug) — filename/size were being stored
        # with no way to retrieve the file afterward.
        try:
            res = connection.execute(text("SHOW COLUMNS FROM sod_violation_attachments LIKE 'file_path'")).fetchone()
            if not res:
                print("Adding file_path to sod_violation_attachments...")
                connection.execute(text("ALTER TABLE sod_violation_attachments ADD COLUMN file_path VARCHAR(500) NULL"))
        except Exception as e:
            print(f"Error checking/altering sod_violation_attachments column file_path: {e}")

        try:
            res = connection.execute(text("SHOW COLUMNS FROM sod_exception_attachments LIKE 'file_path'")).fetchone()
            if not res:
                print("Adding file_path to sod_exception_attachments...")
                connection.execute(text("ALTER TABLE sod_exception_attachments ADD COLUMN file_path VARCHAR(500) NULL"))
        except Exception as e:
            print(f"Error checking/altering sod_exception_attachments column file_path: {e}")

        # Settings redesign: SMTP + Personalization sections
        platform_settings_cols = {
            "smtp_host": "VARCHAR(150) NULL",
            "smtp_port": "INT NULL DEFAULT 587",
            "smtp_username": "VARCHAR(150) NULL",
            "smtp_password": "VARCHAR(255) NULL",
            "smtp_from_email": "VARCHAR(150) NULL",
            "smtp_from_name": "VARCHAR(100) NULL",
            "smtp_use_tls": "TINYINT(1) NULL DEFAULT 1",
            "company_display_name": "VARCHAR(150) NULL",
            "logo_path": "VARCHAR(500) NULL",
            "primary_color": "VARCHAR(20) NULL",
        }
        for col, col_type in platform_settings_cols.items():
            try:
                res = connection.execute(text(f"SHOW COLUMNS FROM platform_settings LIKE '{col}'")).fetchone()
                if not res:
                    print(f"Adding {col} to platform_settings...")
                    connection.execute(text(f"ALTER TABLE platform_settings ADD COLUMN {col} {col_type}"))
            except Exception as e:
                print(f"Error checking/altering platform_settings column {col}: {e}")

        # Extended Role Discovery summary metrics (identities/applications/
        # entitlements analyzed, avg confidence) per Dharankumar Bera's
        # feedback that the campaign summary should tell the full story.
        mining_campaign_cols = {
            "identities_analyzed": "INT NOT NULL DEFAULT 0",
            "applications_analyzed": "INT NOT NULL DEFAULT 0",
            "entitlements_analyzed": "INT NOT NULL DEFAULT 0",
            "avg_confidence_score": "FLOAT NOT NULL DEFAULT 0",
        }
        for col, col_type in mining_campaign_cols.items():
            try:
                res = connection.execute(text(f"SHOW COLUMNS FROM mining_campaigns LIKE '{col}'")).fetchone()
                if not res:
                    print(f"Adding {col} to mining_campaigns...")
                    connection.execute(text(f"ALTER TABLE mining_campaigns ADD COLUMN {col} {col_type}"))
            except Exception as e:
                print(f"Error checking/altering mining_campaigns column {col}: {e}")

check_and_add_columns()


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Seed only essential system data on first startup
db = SessionLocal()
try:
    # 1. Seed default administrator users if they don't exist
    admin_users = [
        ("Darshan Kumar", "darshanreddy5822@gmail.com", "Admin@123")
    ]
    for name, email, plain_pwd in admin_users:
        if db.query(User).filter(User.email == email).count() == 0:
            db.add(User(
                name=name,
                email=email.strip().lower(),
                role="Platform Administrator",
                password_hash=pwd_context.hash(plain_pwd),
                theme="light"
            ))
            db.commit()
            print(f"Auto-seeded user {email}.")

    # 2. Seed platform roles if empty, or update descriptions if they differ
    default_platform_roles = [
        ("PLAT_ADMIN", "Platform Administrator", "Full access to the application", "System", "Critical", True, True),
        ("SEC_ADMIN", "Security Administrator", "Manages users, roles, and security settings", "System", "High", True, True),
        ("COMP_OFFICER", "Compliance Officer", "Reviews governance and compliance", "Business", "Medium", False, True),
        ("SEC_AUDITOR", "Security Auditor", "Read-only access to reports and audit logs", "System", "Low", False, True),
        ("ROLE_ENGINEER", "Role Engineer", "Can create, edit, and classify candidate roles", "Business", "Medium", False, True),
        ("READ_ONLY", "Read Only User", "Can only view dashboards", "Shared", "Low", False, True)
    ]

    if db.query(PlatformRole).count() == 0:
        p_roles = []
        for code, name, desc, r_type, risk, approval, is_sys in default_platform_roles:
            p_roles.append(PlatformRole(
                role_code=code,
                role_name=name,
                description=desc,
                role_type=r_type,
                risk_level=risk,
                status="Active",
                approval_required=approval,
                is_system_role=is_sys,
                created_by="System",
                modified_by="System"
            ))
        db.add_all(p_roles)
        db.commit()
        print("Seeded default platform roles.")
    else:
        for code, name, desc, r_type, risk, approval, is_sys in default_platform_roles:
            role = db.query(PlatformRole).filter(PlatformRole.role_code == code).first()
            if role:
                if role.description != desc or role.role_name != name:
                    role.role_name = name
                    role.description = desc
                    role.role_type = r_type
                    role.risk_level = risk
                    role.approval_required = approval
                    role.is_system_role = is_sys
                    db.commit()
                    print(f"Updated default platform role: {code}")

    # 3. Seed Menu Permissions for all default menus across roles if empty
    DEFAULT_MENUS = [
        "Dashboard", "Administration", "Platform Users", "Platform Roles", "Menu Permissions",
        "Settings", "SMTP Settings", "Branding", "Audit Logs", "License", "Data Foundation",
        "Role Discovery", "Role Engineering", "Role Catalog", "Governance", "Role Lifecycle",
        "Analytics", "Reports", "Identity Attributes", "Account Attributes", "Entitlement Attributes",
        "Role Attributes", "Attribute Categories", "License Management",
        "Connector Workspace", "Application Workspace", "Identity Repository",
        "Correlation Workspace", "Cascade Revocation"
    ]

    roles = db.query(PlatformRole).all()
    for role in roles:
        for menu_name in DEFAULT_MENUS:
            existing_perm = db.query(MenuPermission).filter(
                MenuPermission.role_id == role.id,
                MenuPermission.menu_name == menu_name
            ).first()
            if not existing_perm:
                can_view = False
                can_create = False
                can_edit = False
                can_delete = False
                can_export = False
                can_approve = False

                if role.role_code == "PLAT_ADMIN":
                    can_view = True
                    can_create = True
                    can_edit = True
                    can_delete = True
                    can_export = True
                    can_approve = True
                elif role.role_code == "READ_ONLY":
                    if menu_name in ["Dashboard", "Reports", "Analytics"]:
                        can_view = True
                elif role.role_code == "SEC_ADMIN":
                    if menu_name in ["Dashboard", "Administration", "Platform Users", "Platform Roles", "Menu Permissions", "Audit Logs", "Settings"]:
                        can_view = True
                        can_create = True
                        can_edit = True
                        can_delete = True
                        can_export = True
                        can_approve = True
                elif role.role_code == "COMP_OFFICER":
                    if menu_name in ["Dashboard", "Administration", "Platform Users", "Platform Roles", "Menu Permissions", "Audit Logs", "Governance", "Reports"]:
                        can_view = True
                        can_export = True
                        can_approve = True
                elif role.role_code == "SEC_AUDITOR":
                    if menu_name in ["Dashboard", "Administration", "Platform Users", "Platform Roles", "Menu Permissions", "Audit Logs", "Reports"]:
                        can_view = True
                        can_export = True
                elif role.role_code == "ROLE_ENGINEER":
                    if menu_name in ["Dashboard", "Role Engineering"]:
                        can_view = True
                        can_create = True
                        can_edit = True
                        can_export = True
                        can_approve = True

                new_perm = MenuPermission(
                    role_id=role.id,
                    menu_name=menu_name,
                    can_view=can_view,
                    can_create=can_create,
                    can_edit=can_edit,
                    can_delete=can_delete,
                    can_export=can_export,
                    can_approve=can_approve,
                    created_by="System",
                    modified_by="System"
                )
                db.add(new_perm)
        db.commit()
    print("Verified / Seeded menu permissions.")

    # 4. Seed default Correlation Rules if empty
    try:
        if db.query(CorrelationRule).count() == 0:
            rules = [
                CorrelationRule(rule_name="Email Match", identity_attribute="email", account_attribute="email", match_type="Exact", confidence_score=100, is_active=True),
                CorrelationRule(rule_name="Full Name Match", identity_attribute="display_name", account_attribute="account_name", match_type="Exact", confidence_score=85, is_active=True),
                CorrelationRule(rule_name="Partial Name Match", identity_attribute="first_name", account_attribute="account_name", match_type="Partial", confidence_score=75, is_active=True)
            ]
            db.add_all(rules)
            db.commit()
            print("Seeded default correlation rules.")
    except Exception as e:
        print(f"Error seeding correlation rules: {e}")

    # 5. Seed Attribute Categories if empty
    try:
        default_categories = [
            ("System", "Standard system-defined attributes used for core integrations."),
            ("Personal", "Personal details and demographic attributes of the identity."),
            ("Contact", "Communication addresses and number details."),
            ("Organization", "Hierarchical and corporate alignment attributes.")
        ]
        if db.query(AttributeCategory).count() == 0:
            cats = []
            for name, desc in default_categories:
                cats.append(AttributeCategory(
                    category_name=name,
                    description=desc,
                    created_by="System",
                    modified_by="System"
                ))
            db.add_all(cats)
            db.commit()
            print("Seeded default attribute categories.")
    except Exception as ex_cat:
        print(f"Error seeding attribute categories: {ex_cat}")

    # 5. Seed Identity Attributes if empty
    try:
        if db.query(IdentityAttribute).count() == 0:
            cat_system = db.query(AttributeCategory).filter(AttributeCategory.category_name == "System").first()
            cat_personal = db.query(AttributeCategory).filter(AttributeCategory.category_name == "Personal").first()
            cat_contact = db.query(AttributeCategory).filter(AttributeCategory.category_name == "Contact").first()
            cat_org = db.query(AttributeCategory).filter(AttributeCategory.category_name == "Organization").first()

            cat_system_id = cat_system.id if cat_system else None
            cat_personal_id = cat_personal.id if cat_personal else None
            cat_contact_id = cat_contact.id if cat_contact else None
            cat_org_id = cat_org.id if cat_org else None

            default_attrs = [
                ("employee_id", "Employee ID", "String", cat_system_id, True, True, True, False, 1),
                ("first_name", "First Name", "String", cat_personal_id, True, False, True, True, 2),
                ("last_name", "Last Name", "String", cat_personal_id, True, False, True, True, 3),
                ("display_name", "Display Name", "String", cat_personal_id, False, False, True, True, 4),
                ("email", "Email", "Email", cat_system_id, True, True, True, True, 5),
                ("department", "Department", "Dropdown", cat_org_id, False, False, True, True, 6),
                ("job_title", "Job Title", "String", cat_org_id, False, False, True, True, 7),
                ("manager", "Manager", "String", cat_org_id, False, False, True, True, 8),
                ("country", "Country", "String", cat_contact_id, False, False, True, True, 9),
                ("location", "Location", "String", cat_contact_id, False, False, True, True, 10),
                ("business_unit", "Business Unit", "String", cat_org_id, False, False, True, True, 11),
                ("employment_type", "Employment Type", "Dropdown", cat_org_id, False, False, True, True, 12),
                ("hire_date", "Hire Date", "Date", cat_org_id, False, False, False, True, 13),
                ("status", "Status", "Dropdown", cat_org_id, True, False, True, True, 14)
            ]

            attrs = []
            for name, display, dtype, cat_id, req, uniq, search, edit, order in default_attrs:
                attrs.append(IdentityAttribute(
                    attribute_name=name,
                    display_name=display,
                    description=f"Seeded default attribute for {display}.",
                    attribute_type="System",
                    data_type=dtype,
                    is_required=req,
                    is_unique=uniq,
                    is_searchable=search,
                    is_editable=edit,
                    display_order=order,
                    status="Active",
                    category_id=cat_id,
                    created_by="System",
                    modified_by="System"
                ))
            db.add_all(attrs)
            db.commit()
            print("Seeded default identity attributes.")
    except Exception as ex_attr:
        print(f"Error seeding identity attributes: {ex_attr}")

    # Seed default Account Attributes if empty
    try:
        if db.query(AccountAttribute).count() == 0:
            cat_system = db.query(AttributeCategory).filter(AttributeCategory.category_name == "System").first()
            cat_system_id = cat_system.id if cat_system else None

            default_account_attrs = [
                ("account_id", "Account ID", "String", cat_system_id, True, True, True, False, True, 1),
                ("username", "Username", "String", cat_system_id, True, True, True, False, True, 2),
                ("display_name", "Display Name", "String", cat_system_id, False, False, True, False, True, 3),
                ("email", "Email", "Email", cat_system_id, False, False, True, False, True, 4),
                ("application", "Application", "String", cat_system_id, True, False, True, False, True, 5),
                ("application_type", "Application Type", "String", cat_system_id, True, False, True, False, True, 6),
                ("status", "Status", "String", cat_system_id, True, False, True, False, True, 7),
                ("account_type", "Account Type", "String", cat_system_id, False, False, True, False, True, 8),
                ("account_owner", "Account Owner", "String", cat_system_id, False, False, True, False, True, 9),
                ("manager", "Manager", "String", cat_system_id, False, False, True, False, True, 10),
                ("created_date", "Created Date", "Date", cat_system_id, False, False, False, False, True, 11),
                ("last_login", "Last Login", "DateTime", cat_system_id, False, False, False, False, True, 12),
                ("password_last_changed", "Password Last Changed", "DateTime", cat_system_id, False, False, False, False, True, 13),
                ("account_locked", "Account Locked", "Boolean", cat_system_id, False, False, True, False, True, 14),
                ("mfa_enabled", "MFA Enabled", "Boolean", cat_system_id, False, False, True, False, True, 15),
                ("provisioning_status", "Provisioning Status", "String", cat_system_id, False, False, True, False, True, 16),
                ("risk_score", "Risk Score", "Number", cat_system_id, False, False, True, False, True, 17),
                ("source_system", "Source System", "String", cat_system_id, False, False, True, False, True, 18),
            ]

            account_attrs_instances = []
            for name, display, dtype, cat_id, req, uniq, search, edit, sys, order in default_account_attrs:
                account_attrs_instances.append(AccountAttribute(
                    attribute_name=name,
                    display_name=display,
                    description=f"Seeded system account attribute for {display}.",
                    attribute_type="System",
                    data_type=dtype,
                    is_required=req,
                    is_unique=uniq,
                    is_searchable=search,
                    is_editable=edit,
                    is_system=sys,
                    display_order=order,
                    status="Active",
                    category_id=cat_id,
                    created_by="System",
                    modified_by="System"
                ))
            db.add_all(account_attrs_instances)
            db.commit()
            print("Seeded default account attributes.")
    except Exception as ex_act:
        print(f"Error seeding account attributes: {ex_act}")

    # Seed default Entitlement Attributes if empty
    try:
        if db.query(EntitlementAttribute).count() == 0:
            cat_system = db.query(AttributeCategory).filter(AttributeCategory.category_name == "System").first()
            cat_system_id = cat_system.id if cat_system else None

            # Entitlement ID, Entitlement Name, Display Name, Application, Application Type,
            # Entitlement Type, Privilege Level, Risk Level, Owner, Business Owner, Technical Owner,
            # Approval Required, Provisioning Required, Certification Required, Inherited, Status,
            # Description, Created Date
            default_entitlement_attrs = [
                ("entitlement_id", "Entitlement ID", "String", "Generic", "Role", cat_system_id, True, True, True, False, True, 1),
                ("entitlement_name", "Entitlement Name", "String", "Generic", "Role", cat_system_id, True, False, True, False, True, 2),
                ("display_name", "Display Name", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 3),
                ("application", "Application", "String", "Generic", "Role", cat_system_id, True, False, True, False, True, 4),
                ("application_type", "Application Type", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 5),
                ("entitlement_type", "Entitlement Type", "String", "Generic", "Role", cat_system_id, True, False, True, False, True, 6),
                ("privilege_level", "Privilege Level", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 7),
                ("risk_level", "Risk Level", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 8),
                ("owner", "Owner", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 9),
                ("business_owner", "Business Owner", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 10),
                ("technical_owner", "Technical Owner", "String", "Generic", "Role", cat_system_id, False, False, True, False, True, 11),
                ("approval_required", "Approval Required", "Boolean", "Generic", "Role", cat_system_id, False, False, True, False, True, 12),
                ("provisioning_required", "Provisioning Required", "Boolean", "Generic", "Role", cat_system_id, False, False, True, False, True, 13),
                ("certification_required", "Certification Required", "Boolean", "Generic", "Role", cat_system_id, False, False, True, False, True, 14),
                ("inherited", "Inherited", "Boolean", "Generic", "Role", cat_system_id, False, False, True, False, True, 15),
                ("status", "Status", "String", "Generic", "Role", cat_system_id, True, False, True, False, True, 16),
                ("description", "Description", "Text Area", "Generic", "Role", cat_system_id, False, False, True, False, True, 17),
                ("created_date", "Created Date", "Date", "Generic", "Role", cat_system_id, False, False, False, False, True, 18),
            ]

            ent_instances = []
            for name, display, dtype, app_name, ent_type, cat_id, req, uniq, search, edit, sys, order in default_entitlement_attrs:
                ent_instances.append(EntitlementAttribute(
                    attribute_name=name,
                    display_name=display,
                    description=f"Seeded system entitlement attribute for {display}.",
                    attribute_type="System",
                    data_type=dtype,
                    application_name=app_name,
                    entitlement_type=ent_type,
                    is_required=req,
                    is_unique=uniq,
                    is_searchable=search,
                    is_editable=edit,
                    is_system=sys,
                    display_order=order,
                    status="Active",
                    category_id=cat_id,
                    created_by="System",
                    modified_by="System"
                ))
            db.add_all(ent_instances)
            db.commit()
            print("Seeded default entitlement attributes.")
    except Exception as ex_ent:
        print(f"Error seeding entitlement attributes: {ex_ent}")

    # Seed default Role Attributes if empty
    try:
        if db.query(RoleAttribute).count() == 0:
            cat_system = db.query(AttributeCategory).filter(AttributeCategory.category_name == "System").first()
            cat_system_id = cat_system.id if cat_system else None

            # Role ID, Role Name, Role Description, Role Type, Business Unit, Department, Owner,
            # Business Owner, Technical Owner, Risk Level, Approval Required, Certification Required,
            # SoD Sensitive, Birthright Role, Requestable, Provisioning Enabled, Status, Created Date
            default_role_attrs = [
                ("role_id", "Role ID", "String", "IT Role", cat_system_id, True, True, True, False, True, 1),
                ("role_name", "Role Name", "String", "IT Role", cat_system_id, True, False, True, False, True, 2),
                ("role_description", "Role Description", "Text Area", "IT Role", cat_system_id, False, False, True, False, True, 3),
                ("role_type", "Role Type", "String", "IT Role", cat_system_id, True, False, True, False, True, 4),
                ("business_unit", "Business Unit", "String", "IT Role", cat_system_id, False, False, True, False, True, 5),
                ("department", "Department", "String", "IT Role", cat_system_id, False, False, True, False, True, 6),
                ("owner", "Owner", "String", "IT Role", cat_system_id, False, False, True, False, True, 7),
                ("business_owner", "Business Owner", "String", "IT Role", cat_system_id, False, False, True, False, True, 8),
                ("technical_owner", "Technical Owner", "String", "IT Role", cat_system_id, False, False, True, False, True, 9),
                ("risk_level", "Risk Level", "String", "IT Role", cat_system_id, False, False, True, False, True, 10),
                ("approval_required", "Approval Required", "Boolean", "IT Role", cat_system_id, False, False, True, False, True, 11),
                ("certification_required", "Certification Required", "Boolean", "IT Role", cat_system_id, False, False, True, False, True, 12),
                ("sod_sensitive", "SoD Sensitive", "Boolean", "IT Role", cat_system_id, False, False, True, False, True, 13),
                ("birthright_role", "Birthright Role", "Boolean", "IT Role", cat_system_id, False, False, True, False, True, 14),
                ("requestable", "Requestable", "Boolean", "IT Role", cat_system_id, False, False, True, False, True, 15),
                ("provisioning_enabled", "Provisioning Enabled", "Boolean", "IT Role", cat_system_id, False, False, True, False, True, 16),
                ("status", "Status", "String", "IT Role", cat_system_id, True, False, True, False, True, 17),
                ("created_date", "Created Date", "Date", "IT Role", cat_system_id, False, False, False, False, True, 18),
            ]

            role_instances = []
            for name, display, dtype, r_type, cat_id, req, uniq, search, edit, sys, order in default_role_attrs:
                role_instances.append(RoleAttribute(
                    attribute_name=name,
                    display_name=display,
                    description=f"Seeded system role attribute for {display}.",
                    attribute_type="System",
                    data_type=dtype,
                    role_type=r_type,
                    is_required=req,
                    is_unique=uniq,
                    is_searchable=search,
                    is_editable=edit,
                    is_system=sys,
                    display_order=order,
                    status="Active",
                    category_id=cat_id,
                    created_by="System",
                    modified_by="System"
                ))
            db.add_all(role_instances)
            db.commit()
            print("Seeded default role attributes.")
    except Exception as ex_role:
        print(f"Error seeding role attributes: {ex_role}")

    # Seed default Connectors if empty
    try:
        if db.query(Connector).count() == 0:
            default_connectors = [
                Connector(
                    connector_name="CSV HR Import",
                    connector_type="CSV",
                    description="Standard HR CSV data integration source.",
                    status="Configured",
                    health_status="Healthy",
                    environment="Production",
                    auth_type="None",
                    tags="HR,Identity",
                    version=1,
                    csv_delimiter=",",
                    csv_encoding="UTF-8",
                    file_path="uploads/hr_import.csv",
                    created_by="System",
                    modified_by="System"
                ),
                Connector(
                    connector_name="Finance Excel Import",
                    connector_type="Excel",
                    description="Finance department spreadsheet source.",
                    status="Configured",
                    health_status="Healthy",
                    environment="Staging",
                    auth_type="None",
                    tags="Finance",
                    version=1,
                    excel_sheet_name="Sheet1",
                    file_path="uploads/finance_import.xlsx",
                    created_by="System",
                    modified_by="System"
                ),
                Connector(
                    connector_name="MySQL Identity Source",
                    connector_type="Database",
                    description="Production corporate database user source.",
                    status="Connected",
                    health_status="Healthy",
                    environment="Production",
                    auth_type="Basic",
                    tags="Database,System",
                    version=1,
                    database_type="MySQL",
                    host="127.0.0.1",
                    port=3306,
                    database_name="identity_db",
                    username="db_user",
                    password=encrypt_password("password123"),
                    ssl_enabled=False,
                    connection_timeout=30,
                    created_by="System",
                    modified_by="System"
                )
            ]
            db.add_all(default_connectors)
            db.commit()
            print("Seeded default connectors.")
    except Exception as ex_conn:
        print(f"Error seeding default connectors: {ex_conn}")

    # Seed default Platform Settings if empty
    try:
        from app.models.platform_settings import PlatformSettings
        if db.query(PlatformSettings).count() == 0:
            default_settings = PlatformSettings(
                app_name="NextID",
                support_email="support@nextid.com",
                default_timezone="Asia/Kolkata",
                session_timeout_minutes=15,
                otp_expiry_minutes=10,
                default_theme="light",
                maintenance_mode=False,
                updated_at=datetime.utcnow(),
                updated_by="System"
            )
            db.add(default_settings)
            db.commit()
            print("Seeded default platform settings.")
    except Exception as ex_settings:
        print(f"Error seeding default platform settings: {ex_settings}")

    # Seed default Candidate Roles if empty
    # NOTE: disabled — this was silently recreating 5 fake demo roles
    # ("Billing Administrator", "IT Helpdesk Specialist", "HR Generalist",
    # "Database Auditor", "Financial Analyst") every time the backend
    # restarted, which fought against real cleanup and made Role Engineering
    # show data that didn't match what was actually uploaded/mined. If demo
    # seed data is needed again later, re-enable deliberately rather than
    # leaving it always-on.
    try:
        if False and db.query(CandidateRole).filter(CandidateRole.role_name == "Billing Administrator").count() == 0:
            print("Seeding default Candidate Roles...")
            identities = db.query(Identity).limit(10).all()
            apps = db.query(Application).limit(5).all()
            
            role_data = [
                ("Billing Administrator", "Access to create and approve billing reports", "Business", "High", "Birthright", "Draft", "Finance", "Corporate"),
                ("IT Helpdesk Specialist", "Support ticket management and standard system access", "Technical", "Medium", "Requestable", "Reviewed", "Information Technology", "Global IT"),
                ("HR Generalist", "Read and edit access to HR employee records", "Business", "Low", "Business", "Draft", "Human Resources", "People"),
                ("Database Auditor", "Read-only database logs monitoring and auditing", "Technical", "Medium", "Technical", "Approved", "Security", "Risk"),
                ("Financial Analyst", "Analytical access to financial forecasting tools", "Hybrid", "High", None, "Draft", "Finance", "Investment")
            ]
            
            for name, desc, r_type, risk, classification, status, dept, bu in role_data:
                role = CandidateRole(
                    role_name=name,
                    role_description=desc,
                    role_type=r_type,
                    risk_level=risk,
                    classification=classification,
                    status=status,
                    confidence_score=85.5,
                    job_function=name,
                    member_count=len(identities) if identities else 3,
                    user_count=len(identities) if identities else 3,
                    entitlement_count=3,
                    application_count=2,
                    department=dept,
                    business_unit=bu,
                    source="Mining" if name != "Financial Analyst" else "Manual",
                    generated_by="System" if name != "Financial Analyst" else "admin",
                    created_by="System",
                    modified_by="System",
                    is_deleted=False
                )
                db.add(role)
                db.flush()
                
                # Seed entitlements
                app_name_1 = apps[0].application_name if len(apps) > 0 else "Active Directory"
                app_name_2 = apps[1].application_name if len(apps) > 1 else "Salesforce"
                
                if name == "Billing Administrator":
                    ent_data = [
                        (app_name_1, f"Billing_Write", "High", True),
                        (app_name_1, f"Billing_Approve", "High", True),
                        (app_name_2, "Standard_View", "Low", False)
                    ]
                else:
                    ent_data = [
                        (app_name_1, f"{dept}_Access", "Medium", True),
                        (app_name_2, "Standard_User", "Low", True),
                        (app_name_2, "Read_Only", "Low", False)
                    ]
                    
                for app, ent, ent_risk, is_core in ent_data:
                    db.add(CandidateRoleEntitlement(
                        candidate_role_id=role.id,
                        application_name=app,
                        entitlement_name=ent,
                        risk=ent_risk,
                        member_coverage_pct=95.0 if is_core else 35.0,
                        is_core=is_core,
                        created_at=datetime.utcnow()
                    ))
                    
                # Seed members
                if identities:
                    for ident in identities[:3]:
                        db.add(CandidateRoleMember(
                            candidate_role_id=role.id,
                            identity_id=ident.id,
                            employee_id=ident.employee_id,
                            employee_name=ident.display_name or f"{ident.first_name or ''} {ident.last_name or ''}".strip(),
                            department=ident.department,
                            created_at=datetime.utcnow()
                        ))
                else:
                    # Fallback dummy identity
                    first_id = db.query(Identity.id).first()
                    if first_id:
                        db.add(CandidateRoleMember(
                            candidate_role_id=role.id,
                            identity_id=first_id[0],
                            employee_id="EMP123",
                            employee_name="Darshan Kumar",
                            department=dept,
                            created_at=datetime.utcnow()
                        ))
                            
            db.commit()
            print("Successfully seeded Candidate Roles, Entitlements, and Members.")
    except Exception as ex_seed:
        db.rollback()
        print(f"Error seeding candidate roles: {ex_seed}")

    # Seed default SoD Policies if empty
    # NOTE: disabled — this seed used a leftover test-identities CSV
    # ("11_Test identities.csv", testcorp.com users) uploaded before the
    # user's real identity data, and once it ran the count()==0 guard never
    # fired again, leaving fake policies/violations/exceptions permanently
    # disconnected from what was actually uploaded. Governance should reflect
    # real scans against real data, not seeded fixtures. Re-enable
    # deliberately (e.g. for demos) rather than leaving it always-on.
    try:
        from app.models.sod_policy import SodPolicy, SodPolicyRule
        if False and db.query(SodPolicy).count() == 0:
            print("Seeding default SoD Policies...")
            default_policies = [
                {
                    "policy_code": "SOD-001",
                    "policy_name": "Separation of Vendor Creation and Payment Approval",
                    "description": "Ensures that the same platform user cannot create a vendor and approve its payments.",
                    "risk_level": "CRITICAL",
                    "policy_type": "STATIC",
                    "status": "ACTIVE",
                    "business_owner": "Finance Governance Team",
                    "approver": "Chief Financial Officer",
                    "rules": [
                        ("SAP Production ERP", "Create Vendor Permission", "Approve Payments Role", "AND")
                    ]
                },
                {
                    "policy_code": "SOD-002",
                    "policy_name": "IT System Change Control Separation",
                    "description": "IT Administrators who write system code should not possess production deployment entitlements.",
                    "risk_level": "HIGH",
                    "policy_type": "STATIC",
                    "status": "ACTIVE",
                    "business_owner": "IT Compliance Group",
                    "approver": "Chief Information Officer",
                    "rules": [
                        ("GitHub Enterprise", "Developer Push Access", "Production Deployment Secret Role", "AND")
                    ]
                },
                {
                    "policy_code": "SOD-003",
                    "policy_name": "Conflict of Interest: HR Salary Adjustment",
                    "description": "Prevents HR Specialists from adjusting employee payroll details and self-approving adjustments.",
                    "risk_level": "MEDIUM",
                    "policy_type": "STATIC",
                    "status": "DRAFT",
                    "business_owner": "HR Operations Director",
                    "approver": "Head of People",
                    "rules": [
                        ("Workday HCM", "Payroll Edit Access", "Self-Service Review Bypass", "AND")
                    ]
                }
            ]
            for p in default_policies:
                policy = SodPolicy(
                    policy_code=p["policy_code"],
                    policy_name=p["policy_name"],
                    description=p["description"],
                    risk_level=p["risk_level"],
                    policy_type=p["policy_type"],
                    status=p["status"],
                    business_owner=p["business_owner"],
                    approver=p["approver"],
                    created_by="System",
                    version=1
                )
                db.add(policy)
                db.flush()
                for r in p["rules"]:
                    db.add(SodPolicyRule(
                        policy_id=policy.id,
                        application_name=r[0],
                        entitlement_one=r[1],
                        entitlement_two=r[2],
                        condition_type=r[3]
                    ))
            db.commit()
            print("Successfully seeded default SoD Policies.")
    except Exception as ex_sod:
        db.rollback()
        print(f"Error seeding default SoD Policies: {ex_sod}")

    # Seed default SoD Violations if empty
    # NOTE: disabled — same reason as the SoD Policy seed above, this pulled
    # from whatever identities existed at first-boot (the leftover
    # testcorp.com test CSV) instead of real scan output. Violations should
    # come from actually running a scan (sod_violation_service.py) against
    # real uploaded data, not from a startup fixture.
    try:
        import json
        from app.models.sod_violation import SodViolation, SodScanHistory, SodViolationAudit, SodViolationComment
        from app.models.identity import Identity
        from app.models.sod_policy import SodPolicy
        if False and db.query(SodViolation).count() == 0:
            print("Seeding default SoD Scan History and Violations...")
            
            # 1. Seed scan histories
            scan_data = [
                ("Weekly Security Scan", "FULL", "System", datetime(2026, 7, 10, 2, 0), datetime(2026, 7, 10, 2, 15), 150, 150, 12, "COMPLETED"),
                ("On-demand Compliance Review", "INCREMENTAL", "admin@gmail.com", datetime(2026, 7, 12, 14, 0), datetime(2026, 7, 12, 14, 2), 25, 25, 2, "COMPLETED"),
                ("Daily Identity Reconciliation", "FULL", "System", datetime(2026, 7, 14, 1, 0), datetime(2026, 7, 14, 1, 14), 154, 154, 15, "COMPLETED"),
                ("Scheduled Cron Run", "INCREMENTAL", "System", datetime(2026, 7, 15, 1, 0), datetime(2026, 7, 15, 1, 1), 10, 10, 0, "COMPLETED"),
                ("Standard Manual Trigger", "FULL", "admin@gmail.com", datetime(2026, 7, 16, 10, 30), datetime(2026, 7, 16, 10, 48), 155, 155, 18, "COMPLETED")
            ]
            for name, stype, sby, stime, etime, tu, us, vf, stat in scan_data:
                db.add(SodScanHistory(
                    scan_name=name,
                    scan_type=stype,
                    started_by=sby,
                    start_time=stime,
                    end_time=etime,
                    total_users=tu,
                    users_scanned=us,
                    violations_found=vf,
                    status=stat,
                    progress_pct=100
                ))
            db.flush()
            
            # 2. Seed 20 Violations
            policies = db.query(SodPolicy).all()
            identities = db.query(Identity).limit(10).all()
            
            if policies and identities:
                departments = ["Finance", "Information Technology", "Human Resources", "Sales", "Engineering", "Marketing"]
                managers = ["John Doe", "Sarah Jenkins", "Alex Rivera", "Emma Watson"]
                apps = ["SAP Production ERP", "GitHub Enterprise", "Workday HCM", "Active Directory", "Salesforce"]
                severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
                statuses = ["OPEN", "UNDER_REVIEW", "MITIGATED", "EXCEPTION_APPROVED", "CLOSED"]
                
                import random
                random.seed(42) # Deterministic seeding
                
                for idx in range(20):
                    policy = policies[idx % len(policies)]
                    user = identities[idx % len(identities)]
                    dept = user.department or random.choice(departments)
                    mngr = user.manager or random.choice(managers)
                    app = random.choice(apps)
                    sev = policy.risk_level
                    status_val = statuses[idx % len(statuses)]
                    
                    evidence_json = {
                        "policy_code": policy.policy_code,
                        "policy_name": policy.policy_name,
                        "matches": [
                            {
                                "application": app,
                                "entitlement_one": f"Write Access {idx}",
                                "entitlement_two": f"Approve Access {idx}",
                                "operator": "AND"
                            }
                        ]
                    }
                    
                    violation = SodViolation(
                        policy_id=policy.id,
                        policy_code=policy.policy_code,
                        policy_name=policy.policy_name,
                        user_id=user.id,
                        username=user.email or f"seeded_user_{idx}@gmail.com",
                        display_name=user.display_name or f"Seeded User {idx}",
                        department=dept,
                        manager=mngr,
                        application_name=app,
                        entitlement_one=f"Write Access {idx}",
                        entitlement_two=f"Approve Access {idx}",
                        risk_level=policy.risk_level,
                        severity=sev,
                        status=status_val,
                        detected_date=datetime.utcnow(),
                        scan_id=5,
                        risk_score=95 if sev == "CRITICAL" else (75 if sev == "HIGH" else (50 if sev == "MEDIUM" else 25)),
                        is_false_positive=(idx % 7 == 0),
                        false_positive_reason="Testing false positive flag" if (idx % 7 == 0) else None,
                        evidence=json.dumps(evidence_json)
                    )
                    db.add(violation)
                    db.flush()
                    
                    # 3. Add timeline logs (audit)
                    db.add(SodViolationAudit(
                        violation_id=violation.id,
                        action="Detection",
                        performed_by="System (Auto-Scan)",
                        new_value=json.dumps(evidence_json),
                        timestamp=datetime.utcnow()
                    ))
                    
                    if status_val == "UNDER_REVIEW":
                        db.add(SodViolationAudit(
                            violation_id=violation.id,
                            action="Status Change",
                            performed_by="admin@gmail.com",
                            old_value=json.dumps({"status": "OPEN"}),
                            new_value=json.dumps({"status": "UNDER_REVIEW"}),
                            timestamp=datetime.utcnow()
                        ))
                    elif status_val == "CLOSED":
                        db.add(SodViolationAudit(
                            violation_id=violation.id,
                            action="Close",
                            performed_by="admin@gmail.com",
                            old_value=json.dumps({"status": "OPEN"}),
                            new_value=json.dumps({"status": "CLOSED"}),
                            timestamp=datetime.utcnow()
                        ))
                        
                    # 4. Add comments
                    if idx % 3 == 0:
                        db.add(SodViolationComment(
                            violation_id=violation.id,
                            comment_text=f"Undergoing compliance review check {idx}. Checked assignments.",
                            created_by="admin@gmail.com",
                            created_at=datetime.utcnow()
                        ))
                        
            db.commit()
            print("Successfully seeded default SoD Scan History and Violations.")
    except Exception as ex_sod_violation:
        db.rollback()
        print(f"Error seeding default SoD Violations: {ex_sod_violation}")

    # Seed default SoD Exceptions if empty
    # NOTE: disabled — same reason as the SoD Policy/Violation seeds above;
    # these were built from the fake seeded violations rather than real
    # exception requests.
    try:
        from datetime import datetime, timedelta
        from app.models.sod_exception import SodException, SodExceptionApproval, SodExceptionComment, SodExceptionAudit
        from app.models.sod_violation import SodViolation
        from app.models.sod_policy import SodPolicy
        from app.models.identity import Identity
        import json
        import random
        
        if False and db.query(SodException).count() == 0:
            print("Seeding default SoD Exceptions, approvals, and audits...")
            
            violations = db.query(SodViolation).all()
            policies = db.query(SodPolicy).all()
            identities = db.query(Identity).limit(10).all()
            
            if violations and policies and identities:
                departments = ["Finance", "Information Technology", "Human Resources", "Sales", "Engineering", "Marketing"]
                users_list = ["admin@gmail.com", "security_officer@ranalyzer.com", "manager@ranalyzer.com"]
                compensating_controls_samples = [
                    "Monthly manager review of ledger reports.",
                    "Dual authorization required on all payments over $10k.",
                    "Read-only access in production environment.",
                    "Automated alerts triggered on transaction overrides."
                ]
                
                random.seed(42)
                
                for idx in range(30):
                    v = violations[idx % len(violations)]
                    policy = policies[idx % len(policies)]
                    user = identities[idx % len(identities)]
                    dept = user.department or random.choice(departments)
                    
                    # Status categories: 10 PENDING, 10 ACTIVE (Approved), 5 EXPIRED, 5 REJECTED
                    if idx < 10:
                        status_val = "PENDING"
                    elif idx < 20:
                        status_val = "ACTIVE"
                    elif idx < 25:
                        status_val = "EXPIRED"
                    else:
                        status_val = "REJECTED"
                        
                    exc_type = "TEMPORARY" if idx < 15 else "PERMANENT"
                    exp_date = None
                    if exc_type == "TEMPORARY":
                        # For expired status, date in past. For others, in future.
                        if status_val == "EXPIRED":
                            exp_date = datetime.utcnow() - timedelta(days=2)
                        else:
                            exp_date = datetime.utcnow() + timedelta(days=30)
                            
                    ai_score = 92 if policy.risk_level == "CRITICAL" else (74 if policy.risk_level == "HIGH" else 45)
                    ai_rec = f"AI Analysis: Risk score {ai_score}. Compensating controls verification recommended."
                    
                    num = f"EXC-{str(idx + 1).zfill(3)}"
                    
                    exc = SodException(
                        exception_number=num,
                        violation_id=v.id,
                        policy_id=policy.id,
                        user_id=user.id,
                        employee_id=user.employee_id or f"EMP-{1000 + idx}",
                        username=user.email or f"user_{idx}@gmail.com",
                        department=dept,
                        application_name=v.application_name or "SAP Production ERP",
                        exception_type=exc_type,
                        business_justification=f"Business justification notes for exceptions code template {idx}.",
                        compensating_controls=random.choice(compensating_controls_samples),
                        expiry_date=exp_date,
                        risk_acceptance=(idx % 2 == 0),
                        requested_by="admin@gmail.com",
                        requested_date=datetime.utcnow() - timedelta(days=10),
                        status=status_val,
                        sla_due_date=datetime.utcnow() + timedelta(days=2),
                        is_sla_overdue=(status_val == "PENDING" and idx < 3),
                        ai_risk_score=ai_score,
                        ai_recommendation=ai_rec,
                        needs_recertification=(exc_type == "PERMANENT"),
                        next_recertification_date=datetime.utcnow() + timedelta(days=180) if exc_type == "PERMANENT" else None
                    )
                    
                    # For approved ACTIVE status, also update the linked violation status!
                    if status_val == "ACTIVE":
                        v.status = "EXCEPTION_APPROVED"
                        
                    db.add(exc)
                    db.flush()
                    
                    # Seed multi-level approvals
                    if status_val == "PENDING":
                        # Manager review pending
                        db.add(SodExceptionApproval(
                            exception_id=exc.id,
                            approver_name="Pending Assignment",
                            approval_level="Manager Review",
                            approval_status="PENDING"
                        ))
                    elif status_val == "ACTIVE":
                        # Approved all levels
                        levels = ["Manager Review", "Governance Review", "Security Approval"]
                        for lvl in levels:
                            db.add(SodExceptionApproval(
                                exception_id=exc.id,
                                approver_name=random.choice(users_list),
                                approval_level=lvl,
                                approval_status="APPROVED",
                                comments="Compliance controls verified.",
                                approved_date=datetime.utcnow() - timedelta(days=5)
                            ))
                    elif status_val == "EXPIRED":
                        # Approved all levels then expired
                        levels = ["Manager Review", "Governance Review", "Security Approval"]
                        for lvl in levels:
                            db.add(SodExceptionApproval(
                                exception_id=exc.id,
                                approver_name=random.choice(users_list),
                                approval_level=lvl,
                                approval_status="APPROVED",
                                comments="Approved.",
                                approved_date=datetime.utcnow() - timedelta(days=10)
                            ))
                    elif status_val == "REJECTED":
                        # Rejected at Manager Review
                        db.add(SodExceptionApproval(
                            exception_id=exc.id,
                            approver_name=random.choice(users_list),
                            approval_level="Manager Review",
                            approval_status="REJECTED",
                            comments="Rejected: Insufficient compensating controls description.",
                            approved_date=datetime.utcnow() - timedelta(days=8)
                        ))
                        
                    # Seed comments
                    db.add(SodExceptionComment(
                        exception_id=exc.id,
                        comment=f"First review notes for exception {num}.",
                        created_by="security_officer@ranalyzer.com",
                        created_date=datetime.utcnow() - timedelta(days=9),
                        is_internal=False
                    ))
                    if idx % 2 == 0:
                        db.add(SodExceptionComment(
                            exception_id=exc.id,
                            comment=f"Internal audit logs check for {num}.",
                            created_by="admin@gmail.com",
                            created_date=datetime.utcnow() - timedelta(days=8),
                            is_internal=True
                        ))
                        
                    # Seed audit logs
                    db.add(SodExceptionAudit(
                        exception_id=exc.id,
                        action="Request",
                        performed_by="admin@gmail.com",
                        new_value=json.dumps({"status": "PENDING"}),
                        timestamp=datetime.utcnow() - timedelta(days=10)
                    ))
                    if status_val == "ACTIVE":
                        db.add(SodExceptionAudit(
                            exception_id=exc.id,
                            action="Approval: Security Approval",
                            performed_by="security_officer@ranalyzer.com",
                            old_value=json.dumps({"status": "PENDING"}),
                            new_value=json.dumps({"status": "ACTIVE"}),
                            timestamp=datetime.utcnow() - timedelta(days=5)
                        ))
                    elif status_val == "EXPIRED":
                        db.add(SodExceptionAudit(
                            exception_id=exc.id,
                            action="Expiry",
                            performed_by="System (Auto-Expiry)",
                            old_value=json.dumps({"status": "ACTIVE"}),
                            new_value=json.dumps({"status": "EXPIRED"}),
                            timestamp=datetime.utcnow() - timedelta(days=2)
                        ))
                    elif status_val == "REJECTED":
                        db.add(SodExceptionAudit(
                            exception_id=exc.id,
                            action="Rejection",
                            performed_by="manager@ranalyzer.com",
                            old_value=json.dumps({"status": "PENDING"}),
                            new_value=json.dumps({"status": "REJECTED"}),
                            timestamp=datetime.utcnow() - timedelta(days=8)
                        ))
                        
            db.commit()
            print("Successfully seeded default SoD Exceptions, approvals, and audits.")
    except Exception as ex_sod_exc:
        db.rollback()
        print(f"Error seeding default SoD Exceptions: {ex_sod_exc}")

except Exception as e:
    print(f"Error seeding database: {e}")
finally:
    db.close()
# Start the background scheduler and restore any connectors that had
# scheduling enabled before this server restart.
start_scheduler()
restore_active_schedules()

app = FastAPI(title="rAnalyzer API", version="1.0.0")

# Setup CORS to allow cross-origin requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5174",
        "http://127.0.0.1:5173", "http://127.0.0.1:5174",
        # Local and remote Docker deployment origins
        "http://localhost", "http://127.0.0.1",
        "http://localhost:8081", "http://127.0.0.1:8081",
        # Azure VM deployment — add whatever port the frontend actually gets served
        # on here once that's decided (this covers the Vite default of 5173).
        "http://4.240.74.5:5173", "http://4.240.74.5",
        # Docker frontend on the VM is mapped to host port 8081 (port 80 was
        # already taken by another service on this shared VM).
        "http://4.240.74.5:8081",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files (governance attachments, company logo, etc.) so the
# frontend can actually load them back - this was only ever written to disk
# before, never exposed over HTTP.
import os as _os
from fastapi.staticfiles import StaticFiles
_uploads_dir = _os.path.join(_os.path.dirname(__file__), "..", "uploads")
_os.makedirs(_uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")

# Register endpoints
app.include_router(dashboard.router, prefix="/api")
app.include_router(notification.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(theme.router, prefix="/api")
app.include_router(platform_user.router, prefix="/api")
app.include_router(platform_role.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(platform_settings.router, prefix="/api")
app.include_router(audit_log.router, prefix="/api")
app.include_router(license_routes.router, prefix="/api")
app.include_router(menu_permission.router, prefix="/api")
app.include_router(identity_attribute.router, prefix="/api")
app.include_router(account_attribute.router, prefix="/api")
app.include_router(entitlement_attribute.router, prefix="/api")
app.include_router(role_attribute.router, prefix="/api")
app.include_router(attribute_category.router, prefix="/api")
app.include_router(connectors_routes.router, prefix="/api")
app.include_router(connector_mapping.router, prefix="/api")
app.include_router(transformations.router, prefix="/api")
app.include_router(validations.router, prefix="/api")
app.include_router(preview.router, prefix="/api")
app.include_router(application_routes.router, prefix="/api")
app.include_router(identity_routes.router, prefix="/api")
app.include_router(correlation_routes.router, prefix="/api")
app.include_router(candidate_role_workbench_routes.router, prefix="/api")
app.include_router(role_discovery_routes.router, prefix="/api")
app.include_router(role_owner_routes.router, prefix="/api")
app.include_router(role_approval_routes.router, prefix="/api")
app.include_router(role_catalog_routes.router, prefix="/api")
app.include_router(sod_policy_routes.router, prefix="/api")
app.include_router(sod_violation_routes.router, prefix="/api")
app.include_router(sod_exception_routes.router, prefix="/api")
app.include_router(sod_dashboard_routes.router, prefix="/api")
app.include_router(analytics_routes.router, prefix="/api")
app.include_router(approval_workflow_config_routes.router, prefix="/api")
app.include_router(revocation_routes.router)
app.include_router(cascade_revocation_routes.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to rAnalyzer backend API"}
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
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
from app.services.scheduler import start_scheduler, restore_active_schedules
from app.routes import transformations, validations, preview
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

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

from sqlalchemy import text

def check_and_add_columns():
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

check_and_add_columns()


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Seed only essential system data on first startup
db = SessionLocal()
try:
    # 1. Seed default administrator users if they don't exist
    admin_users = [
        ("Darshan Kumar", "darshanreddy5822@gmail.com", "darshankumar"),
        ("Sania Gupta", "saniagupta2280@gmail.com", "saniagupta")
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
        "Correlation Workspace"
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
                app_name="rAnalyzer",
                support_email="support@ranalyzer.com",
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
    try:
        if db.query(CandidateRole).filter(CandidateRole.role_name == "Billing Administrator").count() == 0:
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
        # Azure VM deployment — add whatever port the frontend actually gets served
        # on here once that's decided (this covers the Vite default of 5173).
        "http://4.240.74.5:5173", "http://4.240.74.5",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.get("/")
def read_root():
    return {"message": "Welcome to rAnalyzer backend API"}
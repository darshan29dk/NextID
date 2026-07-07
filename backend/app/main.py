from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, SessionLocal
from app.routes import dashboard, notification, profile, theme, platform_user, platform_role, auth, audit_log, platform_settings, menu_permission, identity_attribute, account_attribute, entitlement_attribute, role_attribute
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
from datetime import datetime

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

# Seed only essential system data on first startup
db = SessionLocal()
try:
    # 1. Seed default login user if none exists
    if db.query(User).count() == 0:
        default_user = User(
            name="Darshan Kumar",
            email="darshan.kumar@ranalyzer.io",
            role="Platform Administrator",
            profile_image=None,
            theme="light"
        )
        db.add(default_user)
        db.commit()
        print("Seeded default user.")

    # 2. Seed platform roles if empty, or update descriptions if they differ
    default_platform_roles = [
        ("PLAT_ADMIN", "Platform Administrator", "Full access to the application", "System", "Critical", True, True),
        ("SEC_ADMIN", "Security Administrator", "Manages users, roles, and security settings", "System", "High", True, True),
        ("COMP_OFFICER", "Compliance Officer", "Reviews governance and compliance", "Business", "Medium", False, True),
        ("SEC_AUDITOR", "Security Auditor", "Read-only access to reports and audit logs", "System", "Low", False, True),
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
        "Role Attributes", "Attribute Categories", "License Management"
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

    # 4. Seed Attribute Categories if empty
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

except Exception as e:
    print(f"Error seeding database: {e}")
finally:
    db.close()

app = FastAPI(title="rAnalyzer API", version="1.0.0")

# Setup CORS to allow cross-origin requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.get("/")
def read_root():
    return {"message": "Welcome to rAnalyzer backend API"}
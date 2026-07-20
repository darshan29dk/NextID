from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from passlib.context import CryptContext
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime, timedelta

from app.database import get_db
from app.models.user import User
from app.models.audit_log import AuditLog
from app.models.platform_settings import PlatformSettings

router = APIRouter()

otp_store = {}

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "saniagupta2280@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "zzejcvoduvnbciwh")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    email: str
    password: str

class LogoutRequest(BaseModel):
    email: str

class SendOTPRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str


def write_auth_audit(db: Session, user: str, action: str, detail: str = None):
    try:
        audit = AuditLog(
            module="Authentication",
            action=action,
            performed_by=user,
            old_value=None,
            new_value=detail,
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        print(f"Warning: Failed to write auth audit record: {e}")


def send_otp_email(to_email: str, otp: str, expiry_minutes: int, settings: PlatformSettings = None):
    # Prefer SMTP settings configured on the Settings page (SMTP Settings
    # category); fall back to the .env values if nothing's been saved there
    # yet, so this keeps working for existing deployments either way.
    host = (settings.smtp_host if settings and settings.smtp_host else None) or SMTP_HOST
    port = (settings.smtp_port if settings and settings.smtp_port else None) or SMTP_PORT
    user = (settings.smtp_username if settings and settings.smtp_username else None) or SMTP_USER
    password = (settings.smtp_password if settings and settings.smtp_password else None) or SMTP_PASSWORD
    from_email = (settings.smtp_from_email if settings and settings.smtp_from_email else None) or user
    from_name = (settings.smtp_from_name if settings and settings.smtp_from_name else None) or "rAnalyzer"
    use_tls = settings.smtp_use_tls if settings and settings.smtp_use_tls is not None else True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "rAnalyzer - Your OTP for Password Reset"
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email

    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 40px;">
        <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Password Reset OTP</h2>
          <p style="color: #64748b; margin-bottom: 24px;">Use the OTP below to reset your rAnalyzer password. It expires in {expiry_minutes} minutes.</p>
          <div style="background: #f0f4ff; border: 1px solid #c7d7fe; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb;">{otp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">If you did not request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #cbd5e1; font-size: 12px;">rAnalyzer — Role Intelligence Platform</p>
        </div>
      </body>
    </html>
    """

    msg.attach(MIMEText(html, "html"))

    if port == 465:
        with smtplib.SMTP_SSL(host, port) as server:
            server.login(user, password)
            server.sendmail(user, to_email, msg.as_string())
    else:
        with smtplib.SMTP(host, port) as server:
            if use_tls:
                server.starttls()
            server.login(user, password)
            server.sendmail(user, to_email, msg.as_string())


@router.post("/auth/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()

    user = db.query(User).filter(User.email == email).first()

    if not user or not user.password_hash or not pwd_context.verify(request.password, user.password_hash):
        write_auth_audit(db, user=email, action="Failed Login", detail="Invalid email or password")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    write_auth_audit(db, user=user.name, action="Login", detail=f"Logged in as {user.email}")

    # Resolve Menu Permissions
    from app.models.platform_user import PlatformUser
    from app.models.platform_role import PlatformRole
    from app.models.menu_permission import MenuPermission
    from sqlalchemy import or_
    from app.cache import cache_get, cache_set

    # 1. Try matching PlatformUser by email
    platform_user = db.query(PlatformUser).filter(PlatformUser.email == email, PlatformUser.is_deleted == False).first()
    role_id = None
    if platform_user and platform_user.platform_role_id:
        role_id = platform_user.platform_role_id
    else:
        # Fallback: match by role name
        role = db.query(PlatformRole).filter(
            or_(
                PlatformRole.role_name == user.role,
                PlatformRole.role_code == user.role
            )
        ).first()
        if role:
            role_id = role.id

    # Menu permissions per role rarely change, but this query runs on
    # every single login and each round trip to the DB costs real network
    # latency (the DB isn't local). Cache the resolved list per role_id
    # for a few minutes instead of hitting MySQL every time.
    allowed_menus = []
    if role_id:
        cache_key = f"menu_perms:{role_id}"
        cached = cache_get(cache_key)
        if cached is not None:
            allowed_menus = cached
        else:
            perms = db.query(MenuPermission).filter(MenuPermission.role_id == role_id).all()
            for p in perms:
                allowed_menus.append({
                    "menu_name": p.menu_name,
                    "can_view": p.can_view,
                    "can_create": p.can_create,
                    "can_edit": p.can_edit,
                    "can_delete": p.can_delete,
                    "can_export": p.can_export,
                    "can_approve": p.can_approve
                })
            cache_set(cache_key, allowed_menus, ttl_seconds=300)
    else:
        # If no role resolved, check if user is Platform Administrator (seed backup)
        if user.role == "Platform Administrator":
            # Return full access by default
            DEFAULT_MENUS = [
                "Dashboard", "Administration", "Platform Users", "Platform Roles", "Menu Permissions",
                "Settings", "SMTP Settings", "Branding", "Audit Logs", "License", "Data Foundation",
                "Role Discovery", "Role Engineering", "Role Catalog", "Governance", "Role Lifecycle",
                "Analytics", "Reports", "Identity Attributes", "Account Attributes", "Entitlement Attributes",
                "Role Attributes", "Attribute Categories", "License Management"
            ]
            for menu_name in DEFAULT_MENUS:
                allowed_menus.append({
                    "menu_name": menu_name,
                    "can_view": True,
                    "can_create": True,
                    "can_edit": True,
                    "can_delete": True,
                    "can_export": True,
                    "can_approve": True
                })

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "profile_image": user.profile_image,
            "theme": user.theme,
            "allowed_menus": allowed_menus
        },
    }


@router.post("/auth/logout")
def logout(request: LogoutRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    display_name = user.name if user else email

    write_auth_audit(db, user=display_name, action="Logout", detail=f"Logged out ({email})")

    return {"message": "Logout recorded"}


@router.post("/auth/send-otp")
def send_otp(request: SendOTPRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    otp = str(random.randint(100000, 999999))

    settings = db.query(PlatformSettings).first()
    expiry_minutes = settings.otp_expiry_minutes if settings else 10

    otp_store[email] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=expiry_minutes)
    }

    try:
        send_otp_email(email, otp, expiry_minutes, settings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP email: {str(e)}")

    return {"message": "OTP sent successfully to " + email}

@router.post("/auth/verify-otp")
def verify_otp(request: VerifyOTPRequest):
    email = request.email.strip().lower()
    
    if email not in otp_store:
        raise HTTPException(status_code=400, detail="No OTP found for this email. Please request a new one.")

    stored = otp_store[email]

    if datetime.utcnow() > stored["expires_at"]:
        del otp_store[email]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if request.otp != stored["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP. Please try again.")

    return {"message": "OTP verified successfully"}

@router.post("/auth/reset-password")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()

    if email not in otp_store:
        raise HTTPException(status_code=400, detail="OTP not verified. Please verify OTP first.")

    stored = otp_store[email]

    if datetime.utcnow() > stored["expires_at"]:
        del otp_store[email]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if request.otp != stored["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found for this email.")

    user.password_hash = pwd_context.hash(request.new_password)
    db.commit()

    del otp_store[email]

    return {"message": "Password reset successfully"}
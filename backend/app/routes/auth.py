from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from datetime import datetime, timedelta

router = APIRouter()

# Temporary in-memory OTP store
# Format: { email: { otp: "123456", expires_at: datetime } }
otp_store = {}

GMAIL_USER = "saniagupta2280@gmail.com"
GMAIL_APP_PASSWORD = "zzejcvoduvnbciwh"
OTP_EXPIRE_MINUTES = 10

class SendOTPRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

def send_otp_email(to_email: str, otp: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "rAnalyzer - Your OTP for Password Reset"
    msg["From"] = GMAIL_USER
    msg["To"] = to_email

    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f4f6f9; padding: 40px;">
        <div style="max-width: 480px; margin: auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <h2 style="color: #1e293b; margin-bottom: 8px;">Password Reset OTP</h2>
          <p style="color: #64748b; margin-bottom: 24px;">Use the OTP below to reset your rAnalyzer password. It expires in {OTP_EXPIRE_MINUTES} minutes.</p>
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

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.sendmail(GMAIL_USER, to_email, msg.as_string())

@router.post("/auth/send-otp")
def send_otp(request: SendOTPRequest):
    email = request.email.strip().lower()

    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))

    # Store OTP with expiry
    otp_store[email] = {
        "otp": otp,
        "expires_at": datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    }

    try:
        send_otp_email(email, otp)
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
def reset_password(request: ResetPasswordRequest):
    email = request.email.strip().lower()

    if email not in otp_store:
        raise HTTPException(status_code=400, detail="OTP not verified. Please verify OTP first.")

    stored = otp_store[email]

    if datetime.utcnow() > stored["expires_at"]:
        del otp_store[email]
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    if request.otp != stored["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    # Clear OTP after successful reset
    del otp_store[email]

    # Later: update password in database here
    # For now we just confirm success
    return {"message": "Password reset successfully"}
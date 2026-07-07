from cryptography.fernet import Fernet
import os

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "dGhlc2VjcmV0a2V5bXVzdGJlMzJieXRlc2xvbmcxMjM=")
fernet = Fernet(ENCRYPTION_KEY.encode())

def encrypt_password(password: str) -> str:
    if not password:
        return ""
    return fernet.encrypt(password.encode()).decode()

def decrypt_password(token: str) -> str:
    if not token:
        return ""
    try:
        return fernet.decrypt(token.encode()).decode()
    except Exception:
        return ""

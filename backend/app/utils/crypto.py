from cryptography.fernet import Fernet
import os

# No hardcoded fallback key here on purpose - a real placeholder-looking
# key used to live as the default value, which meant every connector
# password encrypted with it was recoverable by anyone who had this file
# (and it was also sitting in plaintext in the committed .env). Every
# deployment must set its own ENCRYPTION_KEY; if it's missing, fail loudly
# at startup instead of silently encrypting with a key that's effectively
# public.
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise RuntimeError(
        "ENCRYPTION_KEY environment variable is not set. Generate one with "
        "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"` "
        "and add it to backend/.env - connector passwords cannot be safely "
        "encrypted/decrypted without it."
    )
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

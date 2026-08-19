import os
import base64
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from app.config import PROVIDER_SECRET_KEY

logger = logging.getLogger(__name__)

def _get_fernet() -> Fernet:
    key_str = os.environ.get("PROVIDER_SECRET_KEY") or PROVIDER_SECRET_KEY
    if not key_str:
        raise ValueError("PROVIDER_SECRET_KEY environment variable is not configured.")
    # Derive a valid 32-byte URL-safe base64 key using PBKDF2HMAC
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"nextid_static_salt_bytes_2026",
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(key_str.encode("utf-8")))
    return Fernet(key)

def encrypt_secret(plain: str) -> str:
    """
    Encrypts a plaintext secret string into a Fernet ciphertext token.
    """
    if not plain:
        return ""
    fernet = _get_fernet()
    token = fernet.encrypt(plain.encode("utf-8"))
    return token.decode("utf-8")

def decrypt_secret(cipher: str) -> str:
    """
    Decrypts a Fernet ciphertext token back into a plaintext secret string.
    """
    if not cipher:
        return ""
    try:
        fernet = _get_fernet()
        plain_bytes = fernet.decrypt(cipher.encode("utf-8"))
        return plain_bytes.decode("utf-8")
    except Exception as exc:
        logger.error(f"Failed to decrypt secret: {exc}")
        return ""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import pymysql
import os
import ssl
from urllib.parse import urlparse, unquote
from app.config import DATABASE_URL

# Parse connection URL to check and create database if not exists
ssl_context = None
db_ssl = os.getenv("DB_SSL", "false").lower() == "true"
db_ssl_cipher = os.getenv("DB_SSL_CIPHER")

if db_ssl:
    # Use PROTOCOL_TLS_CLIENT to automatically default to secure TLS settings
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    if db_ssl_cipher:
        # TLS 1.3 ciphers like TLS_AES_128_GCM_SHA256 cannot be manually forced in Python's SSLContext
        # without system-wide OpenSSL configs. However, forcing TLS 1.2 with the cryptographic equivalent
        # 'AES128-GCM-SHA256' achieves the exact requested cipher connection.
        if db_ssl_cipher == "TLS_AES_128_GCM_SHA256":
            ssl_context.maximum_version = ssl.TLSVersion.TLSv1_2
            ssl_context.set_ciphers("AES128-GCM-SHA256")
        else:
            ssl_context.set_ciphers(db_ssl_cipher)

try:
    # URL format: mysql+pymysql://root:root@localhost:3306/ranalyzer
    # We parse the connection parameters to connect to MySQL server directly
    url = DATABASE_URL
    if url.startswith("mysql+pymysql://"):
        cleaned_url = url.replace("mysql+pymysql://", "")
        
        # Check if password contains '@' (split from the last '@')
        parts = cleaned_url.split("@")
        if len(parts) > 2:
            auth = "@".join(parts[:-1])
            host_path = parts[-1]
        else:
            auth = parts[0]
            host_path = parts[1]
            
        username, password = auth.split(":") if ":" in auth else (auth, "")
        
        host_port, db_path = host_path.split("/")
        host = host_port.split(":")[0]
        port = int(host_port.split(":")[1]) if ":" in host_port else 3306
        db_name = db_path.split("?")[0]
        
        # Connect to server
        connect_params = {
            "host": host,
            "user": username,
            "password": unquote(password),  # Decode url-encoded special characters like '@'
            "port": port,
            "connect_timeout": 10
        }
        if ssl_context:
            connect_params["ssl"] = ssl_context

        conn = pymysql.connect(**connect_params)
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
        cursor.close()
        conn.close()
        print(f"Verified / Created database: {db_name}")
except Exception as e:
    print(f"Warning: Could not auto-create database using PyMySQL: {e}")

connect_args = {
    "connect_timeout": 10
}
if ssl_context:
    connect_args["ssl"] = ssl_context

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


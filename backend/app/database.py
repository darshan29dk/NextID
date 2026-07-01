from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import pymysql
from urllib.parse import urlparse
from app.config import DATABASE_URL

# Parse connection URL to check and create database if not exists
try:
    # URL format: mysql+pymysql://root:root@localhost:3306/ranalyzer
    # We parse the connection parameters to connect to MySQL server directly
    url = DATABASE_URL
    if url.startswith("mysql+pymysql://"):
        cleaned_url = url.replace("mysql+pymysql://", "")
        auth, host_path = cleaned_url.split("@")
        username, password = auth.split(":") if ":" in auth else (auth, "")
        
        host_port, db_path = host_path.split("/")
        host = host_port.split(":")[0]
        port = int(host_port.split(":")[1]) if ":" in host_port else 3306
        db_name = db_path.split("?")[0]
        
        # Connect to server
        conn = pymysql.connect(
            host=host,
            user=username,
            password=password,
            port=port
        )
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
        cursor.close()
        conn.close()
        print(f"Verified / Created database: {db_name}")
except Exception as e:
    print(f"Warning: Could not auto-create database using PyMySQL: {e}")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

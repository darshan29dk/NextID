"""
One-time script to set up login credentials for Sania and Darshan
in the MySQL `users` table on the Linux server.

Run this ONCE from VS Code terminal (inside backend/, with venv activated):
    python setup_users.py
"""

import pymysql
# pyrefly: ignore [missing-import]
from passlib.context import CryptContext

# ---- DB CONNECTION SETTINGS ----
DB_HOST = "4.240.74.5"
DB_PORT = 3306
DB_USER = "root"
DB_PASSWORD = "Secure@password123."
DB_NAME = "rAanlyzer"

# ---- PASSWORD HASHING SETUP ----
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)

# ---- USER DATA TO INSERT/UPDATE ----
users_data = [
    {
        "id": 1,
        "name": "Darshan Kumar",
        "email": "darshanreddy5822@gmail.com",
        "role": "Platform Administrator",
        "password": "darshankumar",
    },
    {
        "id": None,
        "name": "Sania Gupta",
        "email": "saniagupta2280@gmail.com",
        "role": "Platform Administrator",
        "password": "saniagupta",
    },
]

def main():
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cursor:
            for u in users_data:
                hashed = hash_password(u["password"])

                if u["id"] is not None:
                    cursor.execute(
                        """
                        UPDATE users
                        SET name = %s, email = %s, role = %s, password_hash = %s
                        WHERE id = %s
                        """,
                        (u["name"], u["email"], u["role"], hashed, u["id"]),
                    )
                    print(f"Updated user id={u['id']} ({u['email']})")
                else:
                    cursor.execute(
                        """
                        INSERT INTO users (name, email, role, password_hash)
                        VALUES (%s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), password_hash = VALUES(password_hash)
                        """,
                        (u["name"], u["email"], u["role"], hashed),
                    )
                    print(f"Inserted or updated user ({u['email']})")

        conn.commit()
        print("Done. All changes committed.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
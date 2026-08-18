import os
from dotenv import load_dotenv

# Load environmental variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:root@127.0.0.1:3306/rAanlyzer")
PROVIDER_SECRET_KEY = os.getenv("PROVIDER_SECRET_KEY", "uO1xR9k5mZgT6Vn3pL8wQ2yA4cB7dF0eH1jK3mP5sN8=")
CASCADE_RETRY_INTERVAL_MINUTES = int(os.getenv("CASCADE_RETRY_INTERVAL_MINUTES", "5"))
ORPHANED_SWEEP_INTERVAL_DAYS = int(os.getenv("ORPHANED_SWEEP_INTERVAL_DAYS", "7"))

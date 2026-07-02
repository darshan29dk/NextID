import os
from dotenv import load_dotenv

# Load environmental variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:root@127.0.0.1:3306/rAanlyzer")

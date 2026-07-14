# rAnalyzer backend — FastAPI + Uvicorn
FROM python:3.11-slim

WORKDIR /app

# System deps needed to build/run pymysql + cryptography + scikit-learn/numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Bind to 0.0.0.0 (not 127.0.0.1) so the container's port mapping actually works —
# this is the same "make it reachable from outside localhost" requirement discussed
# for the non-Docker deployment path.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

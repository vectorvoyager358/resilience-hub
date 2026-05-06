# Flask API for Cloud Run (Pinecone upsert/delete). Build from repo root.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY server/ ./server/

# Cloud Run sets PORT (default 8080 in the platform)
ENV PORT=8080
CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --threads 8 --timeout 120 app:app

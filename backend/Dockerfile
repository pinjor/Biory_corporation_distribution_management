FROM python:3.12-slim

WORKDIR /app
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /data/uploads \
    && chown -R app:app /data /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
USER app
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "2"]

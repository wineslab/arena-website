# Arena web app. Built and started by `docker compose up` (see docker-compose.yml).
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["flask", "--app", "app:create_app()", "run", "--host", "0.0.0.0", "--port", "8080"]

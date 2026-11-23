# Placement Intelligence — Production Deployment & Operations Guide

**Guide Version:** 3.0.0-PROD  
**Target Environment:** Linux Production Cluster (Ubuntu 22.04 LTS / Debian 12 / Docker / Kubernetes)  
**Classification:** Enterprise System Operations Manual  
**Status:** Validated & Production Ready

---

## 1. System Topology Overview

```text
                                  +------------------------------+
                                  |     Internet / End Users     |
                                  +---------------+--------------+
                                                  |
                                                  v
                               +-----------------------------------+
                               |     Cloudflare CDN / Edge Proxy   |
                               | (DDoS Mitigation, TLS 1.3, Cache) |
                               +------------------+----------------+
                                                  |
                                                  v
                               +-----------------------------------+
                               |         Nginx Reverse Proxy       |
                               |  - Rate Limiting & SSL Offloading |
                               |  - Static Assets (/dist)          |
                               |  - API Proxy (/api/v1 -> Uvicorn) |
                               +------------------+----------------+
                                                  |
                     +----------------------------+----------------------------+
                     |                                                         |
                     v                                                         v
    +---------------------------------+                       +----------------------------------+
    |  FastAPI Web Service (Port 8000)|                       |  FastAPI Web Worker (Replica)    |
    |  Uvicorn Multi-Worker (4 Cores) |                       |  Uvicorn Multi-Worker (4 Cores)  |
    +----------------+----------------+                       +----------------+-----------------+
                     |                                                         |
                     +----------------------------+----------------------------+
                                                  |
                                                  v
                               +-----------------------------------+
                               |       MongoDB Atlas Cluster       |
                               |   (Replica Set M10+, TLS 1.3,     |
                               |    Automated Daily Snapshots)     |
                               +------------------+----------------+
                                                  |
                                                  v
                               +-----------------------------------+
                               |     Isolated Code Sandbox         |
                               |  (Docker Container, Read-Only,    |
                               |   Zero Network, 256MB RAM Cap)    |
                               +-----------------------------------+
```

---

## 2. Infrastructure Prerequisites

| Component | Minimum Specification | Recommended Production Specification |
|---|---|---|
| **Operating System** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS / Debian 12 / Alpine Linux |
| **Compute / CPU** | 2 vCPU | 4 vCPU or Kubernetes Cluster (Auto-scaling 2–8 pods) |
| **System Memory** | 4 GB RAM | 8 GB RAM (allowing 2GB for sandbox containers) |
| **Database** | MongoDB Atlas Shared | MongoDB Atlas Dedicated M10+ (Multi-Region Replica Set) |
| **Object Storage**| Local Disk Storage | Cloudflare R2 / AWS S3 with Private Bucket ACLs |
| **Container Engine**| Docker Engine 24+ | Docker Engine 26+ / containerd with gVisor / runsc |

---

## 3. Backend Deployment (FastAPI + Uvicorn)

### 3.1 Dedicated Non-Root System User
Create an isolated service account with minimal system privileges:
```bash
sudo useradd -m -d /opt/placement -s /bin/bash placement
sudo -u placement mkdir -p /opt/placement/backend /opt/placement/frontend
```

### 3.2 Install Dependencies in Virtual Environment
```bash
cd /opt/placement/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

### 3.3 Production Environment File (`/opt/placement/backend/.env`)
Ensure file permissions are restricted to the service user (`chmod 600 .env`):
```ini
ENVIRONMENT=production
SECRET_KEY=generate-at-least-64-character-random-hex-string-using-openssl-rand-hex-32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# MongoDB Atlas
MONGODB_URI=mongodb+srv://placement_svc:<STRONG_PASSWORD>@cluster0.r0fuhg3.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=placement
USE_MOCK_MONGODB_FOR_TESTS=false

# Firebase Authentication
FIREBASE_PROJECT_ID=placement-management-e89c7
FIREBASE_CREDENTIALS_PATH=/opt/placement/backend/serviceAccountKey.json
FIREBASE_MOCK_AUTH_IN_DEV=false

# CORS Configuration
BACKEND_CORS_ORIGINS=["https://placement.yourinstitution.edu"]

# Object Storage (Cloudflare R2 or AWS S3)
STORAGE_PROVIDER=cloudflare_r2
STORAGE_BUCKET_NAME=placement-resumes-prod
STORAGE_ACCESS_KEY_ID=<R2_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<R2_SECRET_KEY>
STORAGE_ENDPOINT_URL=https://<ACCOUNT_ID>.r2.cloudflarestorage.com

# Maintenance Mode
MAINTENANCE_MODE=false
```

### 3.4 Systemd Service Unit (`/etc/systemd/system/placement-api.service`)
```ini
[Unit]
Description=Placement Intelligence Enterprise API Service
After=network.target

[Service]
User=placement
Group=placement
WorkingDirectory=/opt/placement/backend
EnvironmentFile=/opt/placement/backend/.env
ExecStart=/opt/placement/backend/.venv/bin/gunicorn app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --access-logfile /var/log/placement/api_access.log \
    --error-logfile /var/log/placement/api_error.log \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5

Restart=always
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo mkdir -p /var/log/placement && sudo chown -R placement:placement /var/log/placement
sudo systemctl daemon-reload
sudo systemctl enable placement-api
sudo systemctl start placement-api
sudo systemctl status placement-api
```

---

## 4. Frontend Production Build & Nginx Configuration

### 4.1 Build Static Assets
```bash
cd /opt/placement/placemt\ inligence
npm ci
npm run build
```
Compiled production assets are output to `/opt/placement/placemt inligence/dist`.

### 4.2 Production Nginx Configuration (`/etc/nginx/sites-available/placement.conf`)
```nginx
server {
    listen 80;
    server_name placement.yourinstitution.edu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name placement.yourinstitution.edu;

    ssl_certificate /etc/letsencrypt/live/placement.yourinstitution.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/placement.yourinstitution.edu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend Single Page Application
    root /opt/placement/placemt\ inligence/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static Asset Caching
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Reverse Proxy API Traffic
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
        proxy_connect_timeout 15s;
    }

    # Health Check Endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    client_max_body_size 15M;
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/placement.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Isolated Code Sandbox Deployment

Deploy the isolated Docker container runner for executing untrusted candidate code:

```bash
cd /opt/placement/backend/sandbox_runner
docker build -t placement-sandbox-runner:latest .

# Run hardened container with resource caps
docker run -d \
    --name placement_sandbox \
    --restart always \
    -p 127.0.0.1:8088:8088 \
    --memory 512m \
    --cpus 1.0 \
    --security-opt no-new-privileges:true \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    placement-sandbox-runner:latest
```

---

## 6. MongoDB Atlas Production Configuration

1. **IP Access List:** Restrict inbound access strictly to your application server's static outbound IP addresses.
2. **Database User:** Create a least-privilege database user with `readWrite` role scoped only to the `placement` database.
3. **Automated Snapshots:** Enable continuous daily snapshots with a minimum 30-day retention policy.
4. **Index Verification:** Execute the index creation script on startup:
   ```bash
   python -m app.cli create-indexes
   ```

---

## 7. Health Probes & Monitoring

Configure your load balancer or uptime monitor (e.g. BetterStack, Datadog, Prometheus) to query:
- **Probe URL:** `https://placement.yourinstitution.edu/health`
- **Expected Status:** `200 OK`
- **Expected Payload:** `"status": "healthy"`
- **Interval:** 30 seconds (Timeout: 5 seconds)

---

## 8. Rollback Runbook

If a critical defect is identified post-deployment:
1. Revert to previous Git tag:
   ```bash
   git checkout v2.9.0-PROD
   ```
2. Rebuild frontend assets:
   ```bash
   cd "placemt inligence" && npm run build
   ```
3. Restart backend service:
   ```bash
   sudo systemctl restart placement-api
   ```
4. Confirm health:
   ```bash
   curl -s http://127.0.0.1:8000/health | grep healthy
   ```

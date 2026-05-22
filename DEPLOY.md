# Deployment

mathtrainer runs in production at **https://math.musel.dev** — an Oracle Cloud
VM, in Docker, behind nginx.

## Architecture

```
browser → math.musel.dev   (DNS A record → 145.241.168.188)
        → nginx :443       TLS termination + HTTP basic auth
        → 127.0.0.1:8001
        → Docker container "mathtrainer"   (uvicorn + FastAPI)
        → SQLite at /data/mathtrainer.db   (Docker named volume)
```

- **Container** — built from `Dockerfile` (multi-stage: Node builds the React
  SPA, Python serves it). Declared in `compose.yaml`, bound to `127.0.0.1:8001`,
  `restart: unless-stopped`.
- **Data** — the SQLite database lives in the Docker named volume
  `mathtrainer_mathtrainer-data` (mounted at `/data`), so it survives image
  rebuilds. The app reads `MATHTRAINER_DB=/data/mathtrainer.db`.
- **Reverse proxy** — nginx vhost (see `deploy/nginx-mathtrainer.conf`)
  terminates TLS and enforces the password gate.
- **TLS** — Let's Encrypt certificate via certbot (webroot mode),
  auto-renewed by the `certbot` systemd timer.
- **Auth** — the app has no login; HTTP basic auth at nginx is the gate
  (`/etc/nginx/.htpasswd-mathtrainer`).

## Server layout

- Host: `ubuntu@145.241.168.188`
- Repo checked out at `~/mathtrainer` (tracks the `main` branch)
- Two firewalls had to allow 80/443: the host `iptables` and the Oracle Cloud
  VCN **Security List** (ingress rules for TCP 80 and 443).

## Deploy an update

Push to `main`, then on the server:

```bash
ssh ubuntu@145.241.168.188
cd ~/mathtrainer
git pull
docker compose up -d --build
```

The named volume preserves the database across rebuilds.

## Operations

```bash
docker compose ps          # status / health
docker compose logs -f     # follow logs
docker compose restart     # restart
docker compose down        # stop (data kept in the volume)
```

## Back up the database

```bash
docker run --rm \
  -v mathtrainer_mathtrainer-data:/data \
  -v "$PWD":/backup \
  busybox cp /data/mathtrainer.db /backup/mathtrainer-backup.db
```

## Change the password

```bash
sudo htpasswd -B /etc/nginx/.htpasswd-mathtrainer musel
sudo systemctl reload nginx
```

## TLS certificate

certbot auto-renews via a systemd timer. To inspect:

```bash
sudo certbot certificates
systemctl list-timers | grep certbot
```

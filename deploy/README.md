# Deployment

## Files

| File | Purpose |
|------|---------|
| `nginx.conf` | nginx reverse proxy config — serves client static files, proxies `/api`, `/auth`, `/ws` to Bun on port 3737 |
| `reminder.ecosystem.config.cjs` | PM2 process config — keeps the Bun server running |
| `setup-server.sh` | One-time bootstrap — run once on a fresh droplet |
| `deploy.sh` | Deploy script — builds client, rsyncs to server, restarts PM2 |

---

## First Deploy

### 1. Bootstrap the server (once)

```bash
ssh root@YOUR_IP "mkdir -p /var/www/reminder/deploy"
rsync -az deploy/ root@YOUR_IP:/var/www/reminder/deploy/
ssh root@YOUR_IP "bash /var/www/reminder/deploy/setup-server.sh"
```

### 2. Create the server .env on the droplet

```bash
ssh root@YOUR_IP
cat > /var/www/reminder/server/.env << 'EOF'
NODE_ENV=production
DATA_DIR=/var/www/reminder/data
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://YOUR_IP/auth/google/callback
SESSION_SECRET=generate_a_random_64char_string
ALLOWED_EMAILS=your@email.com
EOF
```

### 3. Deploy

```bash
./deploy/deploy.sh root@YOUR_IP
```

---

## Subsequent Deploys

```bash
./deploy/deploy.sh root@YOUR_IP
```

That's it — builds the client, syncs both server and client, reloads PM2.

---

## Adding a Domain + HTTPS (optional)

1. Point your domain A record to the droplet IP
2. SSH in and install certbot:
   ```bash
   apt install certbot python3-certbot-nginx
   certbot --nginx -d reminder.yourdomain.com
   ```
3. Update `nginx.conf` `server_name` and `GOOGLE_REDIRECT_URI` in `.env`
4. Re-run `./deploy/deploy.sh`

---

## Useful Remote Commands

```bash
# View logs
ssh root@YOUR_IP "pm2 logs reminder-server"

# Restart server
ssh root@YOUR_IP "pm2 restart reminder-server"

# Check status
ssh root@YOUR_IP "pm2 status"

# nginx status
ssh root@YOUR_IP "systemctl status nginx"
```

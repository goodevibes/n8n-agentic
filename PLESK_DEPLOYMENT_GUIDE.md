# Plesk VPS Ubuntu Deployment Guide for n8n-agentic

This guide walks you through deploying n8n-agentic to a Plesk VPS running Ubuntu.

## Prerequisites

- Plesk VPS with Ubuntu 20.04+ or 22.04+
- Root or sudo access
- Domain name pointed to your VPS
- At least 2GB RAM (4GB+ recommended)
- Node.js 22.16+ and pnpm 10.16.1+

---

## Step 1: Install Dependencies

### 1.1 Install Node.js 22.x

```bash
# Via SSH to your VPS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v22.x.x
```

### 1.2 Install pnpm

```bash
npm install -g pnpm@10.16.1

# Verify installation
pnpm --version  # Should show 10.16.1
```

### 1.3 Install Build Tools

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

---

## Step 2: Clone and Build n8n-agentic

### 2.1 Clone Repository

```bash
cd /var/www/vhosts/yourdomain.com
git clone https://github.com/goodevibes/n8n-agentic.git
cd n8n-agentic
```

### 2.2 Install Dependencies

```bash
pnpm install
```

### 2.3 Build the Project

```bash
# Redirect output to log file for monitoring
pnpm build > build.log 2>&1

# Check for errors
tail -n 50 build.log
```

---

## Step 3: Configure Environment Variables

### 3.1 Create n8n Environment File

```bash
cd /var/www/vhosts/yourdomain.com/n8n-agentic

# Create .env file
cat > .env << 'EOF'
# n8n Configuration
N8N_PORT=5678
N8N_HOST=0.0.0.0
N8N_PROTOCOL=https
WEBHOOK_URL=https://yourdomain.com

# Database (recommended for production)
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=localhost
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=n8n
DB_POSTGRESDB_USER=n8n
DB_POSTGRESDB_PASSWORD=your-secure-password

# Security
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-admin-password

# MCP Agent (vibe8n)
VITE_MCP_AGENT_API_URL=https://api.vibe8n.io
# OR for self-hosted:
# VITE_MCP_AGENT_API_URL=http://localhost:8000
# VITE_MCP_AGENT_REQUIRE_AUTH=true

# Timezone
GENERIC_TIMEZONE=America/New_York
TZ=America/New_York
EOF

chmod 600 .env
```

### 3.2 Set Up PostgreSQL Database (Recommended)

```bash
# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE n8n;
CREATE USER n8n WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE n8n TO n8n;
\q
EOF
```

---

## Step 4: Set Up Systemd Service

### 4.1 Create systemd Service File

```bash
sudo cat > /etc/systemd/system/n8n.service << 'EOF'
[Unit]
Description=n8n - Workflow Automation with AI Agent
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/vhosts/yourdomain.com/n8n-agentic
EnvironmentFile=/var/www/vhosts/yourdomain.com/n8n-agentic/.env
ExecStart=/usr/bin/node packages/cli/bin/n8n start
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=n8n

[Install]
WantedBy=multi-user.target
EOF
```

### 4.2 Start and Enable Service

```bash
# Set correct permissions
sudo chown -R www-data:www-data /var/www/vhosts/yourdomain.com/n8n-agentic

# Reload systemd
sudo systemctl daemon-reload

# Start n8n
sudo systemctl start n8n

# Enable autostart on boot
sudo systemctl enable n8n

# Check status
sudo systemctl status n8n
```

---

## Step 5: Configure Nginx Reverse Proxy in Plesk

### 5.1 Via Plesk Panel

1. Go to **Domains** > **yourdomain.com** > **Apache & nginx Settings**
2. In the **Additional nginx directives** box, add:

```nginx
location / {
    proxy_pass http://localhost:5678;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # Increase timeouts for long-running workflows
    proxy_connect_timeout 3600;
    proxy_send_timeout 3600;
    proxy_read_timeout 3600;
}

# WebSocket support for n8n
location ~* ^/rest/push {
    proxy_pass http://localhost:5678;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

3. Click **OK** to save

### 5.2 Enable SSL/TLS

1. Go to **Domains** > **yourdomain.com** > **SSL/TLS Certificates**
2. Click **Install** and select **Let's Encrypt**
3. Click **Get it free** to obtain a free SSL certificate
4. Enable **Permanent SEO-safe 301 redirect from HTTP to HTTPS**

---

## Step 6: Optional - Set Up Self-Hosted Agent

If you want to run your own AI agent instead of using the cloud service:

### 6.1 Install Python Dependencies

```bash
cd /var/www/vhosts/yourdomain.com/n8n-agentic/examples
pip3 install -r requirements.txt
```

### 6.2 Configure Agent Environment

```bash
cp .env.example .env

# Edit .env with your settings
nano .env
```

Example `.env`:
```bash
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=n8n-mcp
MCP_SERVER_ENV_N8N_API_URL=http://localhost:5678
MCP_SERVER_ENV_N8N_API_KEY=your-n8n-api-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 6.3 Create Agent Service

```bash
sudo cat > /etc/systemd/system/n8n-agent.service << 'EOF'
[Unit]
Description=n8n MCP Agent
After=network.target n8n.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/vhosts/yourdomain.com/n8n-agentic/examples
EnvironmentFile=/var/www/vhosts/yourdomain.com/n8n-agentic/examples/.env
ExecStart=/usr/bin/python3 simple_agent.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl start n8n-agent
sudo systemctl enable n8n-agent
```

### 6.4 Update n8n Environment

```bash
# In /var/www/vhosts/yourdomain.com/n8n-agentic/.env
VITE_MCP_AGENT_API_URL=http://localhost:8000
VITE_MCP_AGENT_REQUIRE_AUTH=false  # Optional: enable for auth
```

---

## Step 7: Verify Deployment

### 7.1 Check Services

```bash
# Check n8n status
sudo systemctl status n8n

# Check logs
sudo journalctl -u n8n -f

# If using self-hosted agent
sudo systemctl status n8n-agent
sudo journalctl -u n8n-agent -f
```

### 7.2 Access n8n

1. Open browser: `https://yourdomain.com`
2. Log in with credentials from `.env` file
3. Click the **vibe8n** button (lower right)
4. Test the AI agent

---

## Step 8: Maintenance

### 8.1 Update n8n-agentic

```bash
cd /var/www/vhosts/yourdomain.com/n8n-agentic

# Pull latest changes
git pull

# Install dependencies
pnpm install

# Rebuild
pnpm build > build.log 2>&1

# Restart service
sudo systemctl restart n8n
```

### 8.2 Backup

```bash
# Backup database
sudo -u postgres pg_dump n8n > n8n-backup-$(date +%Y%m%d).sql

# Backup workflows (if using SQLite)
cp ~/.n8n/database.sqlite ~/.n8n/database-backup-$(date +%Y%m%d).sqlite
```

### 8.3 Monitor Logs

```bash
# n8n logs
sudo journalctl -u n8n -f

# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

### Issue: n8n won't start

```bash
# Check logs
sudo journalctl -u n8n -n 50

# Check if port is in use
sudo netstat -tulpn | grep 5678

# Check permissions
ls -la /var/www/vhosts/yourdomain.com/n8n-agentic
```

### Issue: vibe8n button doesn't appear

```bash
# Verify environment variable
echo $VITE_MCP_AGENT_API_URL

# Rebuild frontend
cd /var/www/vhosts/yourdomain.com/n8n-agentic
pnpm --filter n8n-editor-ui build

# Restart n8n
sudo systemctl restart n8n
```

### Issue: Agent connection refused

```bash
# For cloud agent: check if n8n is publicly accessible
curl https://yourdomain.com/api/v1/workflows

# For self-hosted agent: check if agent is running
sudo systemctl status n8n-agent
curl http://localhost:8000/health
```

---

## Security Best Practices

1. **Always use HTTPS** - Configure SSL/TLS through Plesk
2. **Strong passwords** - Use strong passwords for n8n and database
3. **Firewall rules** - Only expose ports 80/443, keep 5678 internal
4. **Regular updates** - Keep n8n, Node.js, and system packages updated
5. **Backup regularly** - Automate database backups
6. **API key security** - Never commit `.env` files to git
7. **Rate limiting** - Consider nginx rate limiting for production

---

## Performance Tuning

### For VPS with 4GB RAM:

```bash
# In /etc/systemd/system/n8n.service, add under [Service]:
Environment="NODE_OPTIONS=--max-old-space-size=2048"
```

### For High Traffic:

```bash
# In nginx configuration, add:
proxy_buffering off;
client_max_body_size 50M;
```

---

## Support

- **n8n Documentation**: https://docs.n8n.io
- **n8n-agentic Issues**: https://github.com/goodevibes/n8n-agentic/issues
- **vibe8n Support**: guillaume.gay@protonmail.com

---

## Quick Commands Reference

```bash
# Start n8n
sudo systemctl start n8n

# Stop n8n
sudo systemctl stop n8n

# Restart n8n
sudo systemctl restart n8n

# View logs
sudo journalctl -u n8n -f

# Update n8n-agentic
cd /var/www/vhosts/yourdomain.com/n8n-agentic && git pull && pnpm install && pnpm build && sudo systemctl restart n8n
```

---

**Deployment Status:** Production Ready ✅  
**Estimated Setup Time:** 30-60 minutes  
**Maintenance Time:** 2-4 hours/month

# Deploying FlowTech Hub → `hub.flowtechapps.com`

Target: **Hostinger VPS srv1232566 (31.97.103.80)**, which already serves other
sites behind a reverse proxy. So the hub runs in Docker on **localhost:8080**
and your existing web server proxies the subdomain to it — ports 80/443 and your
other sites are untouched.

FlowTech Hub is **one container**: the Node BFF serves the built React app and
proxies Microsoft Graph / Dataverse / SharePoint.

---

## 1. DNS — point the subdomain at the VPS
hPanel → **Domains → flowtechapps.com → DNS**, add:

| Type | Name | Value          | TTL  |
|------|------|----------------|------|
| A    | hub  | `31.97.103.80` | 3600 |

Verify (from anywhere): `ping hub.flowtechapps.com` → `31.97.103.80`.

## 2. Entra app registration — add the production redirect URI
Azure Portal → **Entra ID → App registrations →** FlowTech app →
**Authentication → Web → Redirect URIs**, add:
- `https://hub.flowtechapps.com/auth/redirect`

(Keep `http://localhost:4000/auth/redirect` for local dev.)

## 3. Get the code + secrets onto the VPS
SSH in (`ssh root@31.97.103.80`). Install Docker once if needed:
```bash
curl -fsSL https://get.docker.com | sh
```
Put the repo on the box (git clone your private remote, or upload via SFTP to
e.g. `/opt/flowtech`), then:
```bash
cd /opt/flowtech
cp .env.production.example .env.production
nano .env.production      # fill the CHANGE_ME values
```
Set at least:
- `SESSION_SECRET` → `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `AZURE_CLIENT_SECRET` → the Entra client secret
- confirm the `hub.flowtechapps.com` URLs + `ADMIN_EMAILS`.

## 4. Start the container (localhost only)
```bash
docker compose up -d --build
curl -I http://127.0.0.1:8080/healthz    # expect 200
```
Sessions/tokens persist in the `hub_data` volume, so redeploys don't sign users out.

## 5. Proxy the subdomain → the container (pick your web server)

**A) CloudPanel** (if that's your panel): Sites → **Add Site → Reverse Proxy**
- Domain: `hub.flowtechapps.com`
- Reverse Proxy URL: `http://127.0.0.1:8080`
- Then the site's **SSL/TLS → Let's Encrypt** to issue the cert. Done.
- In the site's Nginx vhost settings, raise the upload limit to `client_max_body_size 12m;`.

**B) Plain Nginx**
```bash
cp deploy/nginx-hub.conf /etc/nginx/sites-available/hub.flowtechapps.com
ln -s /etc/nginx/sites-available/hub.flowtechapps.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d hub.flowtechapps.com      # issues cert + adds 443 + auto-renew
```

**C) Apache** — enable proxy modules, add a vhost, then certbot:
```bash
a2enmod proxy proxy_http headers ssl && systemctl restart apache2
```
```apache
<VirtualHost *:80>
  ServerName hub.flowtechapps.com
  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"
  ProxyPass        / http://127.0.0.1:8080/
  ProxyPassReverse / http://127.0.0.1:8080/
  LimitRequestBody 12582912
</VirtualHost>
```
```bash
certbot --apache -d hub.flowtechapps.com
```

## 6. Done
Open **https://hub.flowtechapps.com** and sign in with a `@flowtechapps.com`
account. The 3 `ADMIN_EMAILS` (or M365 Global Admins) also get `/admin`.

---

## Updating after code changes
```bash
cd /opt/flowtech && git pull    # or re-upload
docker compose up -d --build
```

## Notes / limits (current build)
- **Single instance.** Auth/sessions persist (volume); most feature data
  (tickets, expenses, notes, vault PIN, company events, menu order, uploaded
  logos/banners, attendance records) is **in-memory** and resets on `--build` redeploy. Vault text is
  already wired to Dataverse; the rest can be on request. Don't run >1 replica yet.
- **Uploads:** the app caps images ~8 MB; the proxy must allow a large body
  (`client_max_body_size 12m` for Nginx / `LimitRequestBody` for Apache) — already
  in the provided configs.
- **Backup the volume:**
  `docker run --rm -v flowtech_hub_data:/d -v $PWD:/b alpine tar czf /b/hub_data.tgz -C /d .`
- **Secrets:** keep `.env.production` `chmod 600`, never commit it. Rotate the
  Entra client secret before it expires.

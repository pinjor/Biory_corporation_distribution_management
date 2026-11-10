#!/usr/bin/env bash
# Install BIORY from /tmp/biory-incoming onto this server.
# Other Docker projects are not stopped. The database volume is not deleted.
set -euo pipefail

SRC="${SRC:-/tmp/biory-incoming}"
APP_DIR="${APP_DIR:-}"

if [[ ! -f "$SRC/docker-compose.yml" ]]; then
  echo "Missing $SRC/docker-compose.yml. Unpack the archive into /tmp/biory-incoming first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is not available. Install Docker, then run this script again:"
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

echo "======== Ports already in use ========"
ss -tlnp || netstat -tlnp || true
echo
echo "======== Containers already running ========"
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
echo

port_busy() {
  local port="$1"
  ss -tlnH | awk '{print $4}' | grep -Eq "(^|:)${port}$"
}

# Stay on an existing BIORY checkout so its database volume is reused.
if [[ -z "$APP_DIR" ]]; then
  mapfile -t found < <(
    {
      docker ps -a --format '{{.Label "com.docker.compose.project.working_dir"}}'
      find /opt /root /var/www /srv /home -maxdepth 3 -type f -name docker-compose.yml 2>/dev/null \
        | while read -r file; do
            if grep -q 'biory_owner' "$file" 2>/dev/null; then dirname "$file"; fi
          done
    } | sed '/^$/d' | sort -u
  )
  biory_dirs=()
  for dir in "${found[@]}"; do
    [[ -f "$dir/docker-compose.yml" ]] || continue
    if grep -q 'biory_owner' "$dir/docker-compose.yml" 2>/dev/null; then
      biory_dirs+=("$dir")
    fi
  done
  if [[ ${#biory_dirs[@]} -eq 1 ]]; then
    APP_DIR="${biory_dirs[0]}"
    echo "Updating the existing BIORY folder: $APP_DIR"
  elif [[ ${#biory_dirs[@]} -gt 1 ]]; then
    echo "More than one BIORY folder was found. Re-run with the one you want:"
    printf '  %s\n' "${biory_dirs[@]}"
    echo "Example: APP_DIR='${biory_dirs[0]}' bash $SRC/deploy/remote-up.sh"
    exit 2
  else
    APP_DIR=/opt/biory
    echo "No older BIORY install found. Using a new folder: $APP_DIR"
  fi
fi

mkdir -p "$APP_DIR"
FRESH=0
if [[ -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env" "/tmp/biory.env.backup.$(date +%Y%m%d%H%M%S)"
  echo "Kept the existing .env (a backup is in /tmp)."
else
  FRESH=1
fi

# Replace the old code. Files removed in this version must not stay behind and break the build.
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' -exec rm -rf {} +
tar -C "$SRC" --exclude='./.env' -cf - . | tar -C "$APP_DIR" -xf -
find "$APP_DIR" -name '*.sh' -exec sed -i 's/\r$//' {} +

cd "$APP_DIR"

SERVER_IP="$(ip -4 route get 1.1.1.1 | awk '{print $7; exit}')"
if [[ -z "${SERVER_IP}" ]]; then
  SERVER_IP="84.247.147.198"
fi

if [[ ! -f .env ]]; then
  HTTP_PORT=""
  for candidate in 8090 8091 8092 8093 8094 18090 18091; do
    if ! port_busy "$candidate"; then
      HTTP_PORT="$candidate"
      break
    fi
  done
  if [[ -z "$HTTP_PORT" ]]; then
    echo "Could not find a free port in 8090-8094 or 18090-18091."
    exit 1
  fi
  echo "Chosen free port: $HTTP_PORT"
  umask 077
  cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40)
APP_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=' )
FILE_TOKEN_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=' )
HTTP_PORT=${HTTP_PORT}
PUBLIC_APP_URL=http://${SERVER_IP}:${HTTP_PORT}
CORS_ORIGINS=http://${SERVER_IP}:${HTTP_PORT}
BOOTSTRAP_ADMIN_EMAIL=admin@biory.local
BOOTSTRAP_ADMIN_PASSWORD=BioryAdmin@2026
BOOTSTRAP_ADMIN_NAME=Super Admin
ALLOW_SIGNUP=true
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@biory.local
SMTP_TLS=true
EOF
else
  HTTP_PORT="$(grep -E '^HTTP_PORT=' .env | cut -d= -f2- | tr -d '"' || true)"
  HTTP_PORT="${HTTP_PORT:-80}"
  if port_busy "$HTTP_PORT"; then
    holder="$(ss -tlnp | grep -E ":${HTTP_PORT}\\s" || true)"
    echo "Port ${HTTP_PORT} is already listening:"
    echo "$holder"
    echo "Keeping it. If this is the current BIORY gateway, the update reuses it."
  fi
  public="http://${SERVER_IP}:${HTTP_PORT}"
  if grep -qE '^PUBLIC_APP_URL=http://localhost' .env; then
    sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=${public}|" .env
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${public}|" .env
    echo "Pointed PUBLIC_APP_URL and CORS_ORIGINS at ${public}"
  fi
fi

HTTP_PORT="$(grep -E '^HTTP_PORT=' .env | cut -d= -f2- | tr -d '"')"
echo "Building and starting BIORY on port ${HTTP_PORT}. Other projects stay as they are."
docker compose up -d --build

shopt -s nullglob
for sql in backend/sql/0[2-9]_*.sql backend/sql/1[0-9]_*.sql; do
  echo "Updating the database from ${sql}."
  docker compose exec -T postgres psql -U biory_owner -d biory -v ON_ERROR_STOP=1 < "$sql"
done

# Nginx resolves container addresses only at start. Recreated API and web containers need a fresh gateway.
docker compose restart gateway

echo "Waiting for the API..."
ok=0
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT}/api/v1/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 3
done
if [[ "$ok" != 1 ]]; then
  echo "The API did not become healthy. Last logs:"
  docker compose logs --tail 80 backend gateway
  exit 1
fi

python3 - "$HTTP_PORT" <<'PY'
import json, sys, urllib.error, urllib.request

port = sys.argv[1]
base = f"http://127.0.0.1:{port}/api/v1"
admin_email = "admin@biory.local"
admin_password = "BioryAdmin@2026"
accounts = [
    ("admin.ops@biory.local", "BioryAdminOps@2026", "Operations Admin", "admin"),
    ("finance@biory.local", "BioryFinance@2026", "Finance Admin", "finance_admin"),
    ("warehouse@biory.local", "BioryWarehouse@2026", "Warehouse Admin", "warehouse_admin"),
    ("so@biory.local", "BiorySales@2026", "Field Sales Officer", "sales_officer"),
]

def call(path, body, token=None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return exc.code, payload

status, login = call("/auth/login", {"email": admin_email, "password": admin_password})
if status != 200 or "access_token" not in login:
    print("Super Admin login failed:", status, login)
    sys.exit(1)
token = login["access_token"]
print("Super Admin login: ok")

for email, password, name, role in accounts:
    code, _ = call("/auth/signup", {"email": email, "password": password, "full_name": name})
    print(f"signup {email}: {code}")

_, people = call("/query", {"table": "profiles", "select": "id,email"}, token)
rows = people.get("data") or []
by_email = {row["email"]: row["id"] for row in rows}
for email, _password, _name, role in accounts:
    user_id = by_email.get(email)
    if not user_id:
        print(f"missing profile {email}")
        sys.exit(1)
    code, result = call("/rpc", {"fn": "set_user_role", "args": {"p_user": user_id, "p_role": role, "p_grant": True}}, token)
    print(f"role {role}: {code}")
    check, session = call("/auth/login", {"email": email, "password": _password})
    print(f"login {email}: {check} {'ok' if check == 200 and 'access_token' in session else session}")

_, products = call("/query", {"table": "products", "select": "code"}, token)
codes = sorted(row["code"] for row in (products.get("data") or []))
print("products:", ",".join(codes))
PY

docker compose exec -T postgres psql -U biory_owner -d biory -v ON_ERROR_STOP=1 <<'SQL'
update public.chemists
   set assigned_so = (select id from public.users where email = 'so@biory.local')
 where assigned_so is null;
update public.doctors
   set assigned_so = (select id from public.users where email = 'so@biory.local')
 where assigned_so is null;
SQL

if [[ "$FRESH" == 1 ]]; then
  sed -i 's/^ALLOW_SIGNUP=.*/ALLOW_SIGNUP=false/' .env
  docker compose up -d backend
  echo "Public signup is now off. Staff accounts are already created."
fi

echo
echo "BIORY is up at http://${SERVER_IP}:${HTTP_PORT}"
echo "Super Admin: admin@biory.local / BioryAdmin@2026"
echo "Database files stay in the Docker volume. Do not run: docker compose down -v"

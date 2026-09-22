#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
umask 077
action=${1:-deploy}
case "$action" in deploy|setup|status|logs|stop) ;; *) echo 'Use make deploy, setup, status, logs, or stop.' >&2; exit 1;; esac

root=()
if (( EUID != 0 )); then root=(sudo); fi

install_docker() {
  if [[ ! -r /etc/os-release ]]; then echo 'Install Docker Engine and Compose v2 on this OS first.' >&2; exit 1; fi
  # System-owned OS metadata, never a user-provided configuration file.
  source /etc/os-release
  case "$ID" in ubuntu|debian) ;; *) echo 'Automatic Docker installation supports Ubuntu/Debian. Install Docker + Compose v2 first.' >&2; exit 1;; esac
  # Do not uninstall packages or disturb an existing container runtime.
  if command -v containerd >/dev/null || command -v podman >/dev/null; then
    echo 'An existing container runtime was found. Install compatible Docker/Compose without replacing your running services, then retry.' >&2; exit 1
  fi
  echo 'Installing Docker Engine and Compose from Docker’s official apt repository.'
  "${root[@]}" apt-get update
  "${root[@]}" apt-get install -y ca-certificates curl
  "${root[@]}" install -m 0755 -d /etc/apt/keyrings
  "${root[@]}" curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  "${root[@]}" chmod a+r /etc/apt/keyrings/docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/%s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "$ID" "${UBUNTU_CODENAME:-$VERSION_CODENAME}" "$(dpkg --print-architecture)" |
    "${root[@]}" tee /etc/apt/sources.list.d/docker.sources >/dev/null
  "${root[@]}" apt-get update
  "${root[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  "${root[@]}" systemctl enable --now docker
}

if ! command -v docker >/dev/null; then
  if [[ "$action" != deploy && "$action" != setup ]]; then echo 'Docker is not installed.' >&2; exit 1; fi
  install_docker
fi
docker_cmd=(docker)
if ! docker info >/dev/null 2>&1; then docker_cmd=("${root[@]}" docker); fi
"${docker_cmd[@]}" info >/dev/null
version=$("${docker_cmd[@]}" compose version --short)
version=${version#v}
IFS=. read -r major minor _ <<< "$version"
if (( major < 2 || (major == 2 && minor < 30) )); then
  echo 'Docker Compose 2.30+ is required for safe literal secret handling. Upgrade the Compose plugin, then retry.' >&2; exit 1
fi
mkdir -p .deploy
chmod 700 .deploy
# Protect updates from simultaneous make deploy invocations on this checkout.
exec 9>.deploy/lock
if ! flock -n 9; then echo 'Another deployment command is running.' >&2; exit 1; fi

if [[ "$action" == deploy || "$action" == setup ]]; then
  "${docker_cmd[@]}" build -t papersend:local .
  if [[ "$action" == setup || ! -s .deploy/runtime.env || ! -s .deploy/settings.env ]]; then
    if [[ ! -t 0 ]]; then echo 'First run needs a terminal. Run make deploy interactively to configure Neon and the domain.' >&2; exit 1; fi
    "${docker_cmd[@]}" run --rm -it --user "$(id -u):$(id -g)" \
      -v "$PWD/.deploy:/config" -e PAPERSEND_SETUP_DIR=/config \
      --entrypoint node papersend:local scripts/setup.js
  fi
fi
[[ -s .deploy/runtime.env && -s .deploy/settings.env ]] || { echo 'Run make deploy first.' >&2; exit 1; }

# Parse only nonsecret deployment fields. Never source an env file as shell code.
while IFS='=' read -r key value; do
  case "$key" in DOMAIN|DEPLOY_PROXY|APP_PORT|ACME_EMAIL|PROJECT) printf -v "$key" '%s' "$value";; esac
done < .deploy/settings.env
[[ "$PROJECT" =~ ^papersend-(demo|test|live)$ && "$APP_PORT" =~ ^[0-9]+$ ]] || { echo 'Invalid deployment settings.' >&2; exit 1; }
export DOMAIN DEPLOY_PROXY APP_PORT ACME_EMAIL
compose=("${docker_cmd[@]}" compose --env-file .deploy/settings.env -p "$PROJECT" -f compose.deploy.yaml)
if [[ "$DEPLOY_PROXY" == caddy ]]; then compose+=(--profile edge); fi

case "$action" in
  setup) exit 0;;
  status) "${compose[@]}" ps; exit 0;;
  logs) "${compose[@]}" logs --tail=100 -f papersend; exit 0;;
  stop) "${compose[@]}" stop; exit 0;;
esac

"${compose[@]}" config --quiet
if command -v ss >/dev/null; then
  ports=("$APP_PORT")
  if [[ "$DEPLOY_PROXY" == caddy ]]; then ports+=(80 443); fi
  own_ports=$("${docker_cmd[@]}" ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Ports}}')
  for port in "${ports[@]}"; do
    if [[ -n "$(ss -H -ltn "sport = :$port")" ]] && ! grep -Eq ":${port}->" <<< "$own_ports"; then
      echo "Port $port is already in use by another service. Choose an unused app port or your existing HTTPS proxy in make setup." >&2
      exit 1
    fi
  done
fi
# Validate the config and remote database before replacing the existing app.
"${compose[@]}" run --rm --no-deps --entrypoint node papersend scripts/preflight.js
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" exec -T papersend node scripts/deployment-health.js
if [[ "$DEPLOY_PROXY" == existing ]]; then
  echo "App healthy on 127.0.0.1:$APP_PORT. Route https://$DOMAIN to that port through your existing proxy."
  echo 'The proxy must replace X-Forwarded-For and X-Forwarded-Proto; see docs/vps-deployment.md.'
else
  echo "App healthy. Caddy is requesting HTTPS for $DOMAIN. DNS must point here and ports 80/443 must be reachable."
fi
# A successful local health check alone is not a verified public deployment.
if "${compose[@]}" exec -T papersend node scripts/deployment-health.js --public; then
  echo "Public deployment verified: https://$DOMAIN"
else
  echo 'App is running, but public HTTPS verification failed. Check DNS, proxy, and firewall; then rerun make deploy.' >&2
  exit 1
fi

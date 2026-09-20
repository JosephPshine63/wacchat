#!/usr/bin/env bash
# Runs ON THE PRODUCTION HOST, called by the GitHub Actions `deploy` job right after it
# `git pull`ed the new commit:
#
#   PREV=$(git rev-parse HEAD) && git pull --ff-only && bash ci-deploy.sh "$PREV" [--full]
#
# Works out which services the pulled commits touched and redeploys only those with
# `deploy-prod.sh --only=<service>`. deploy-prod.sh itself never fails on an unhealthy
# service (it only logs), so this script health-checks afterwards and, if anything is
# wrong, rolls the checkout back to <prev> and redeploys the same services from it.
#
# A change under wac/keycloak/themes also makes it (idempotently) enable the realm's
# internationalization and restart just the Keycloak container so the theme is reloaded
# (Keycloak caches themes in production mode). --keycloak forces that step by itself.
#
# Other infra-level changes (docker-compose*.yml, deploy-prod.sh, Keycloak realm template,
# RabbitMQ, observability) are NOT applied automatically: a full deploy restarts
# PostgreSQL/Keycloak/RabbitMQ on a shared host. They are reported, and applied only with
# --full (the workflow's manual "full" dispatch) or by running ./deploy-prod.sh by hand.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PREV="${1:?usage: ci-deploy.sh <previous-commit-sha> [--full|--keycloak]}"
FULL=false
KEYCLOAK=false
case "${2:-}" in
  --full)     FULL=true ;;
  --keycloak) KEYCLOAK=true ;;
esac

log() { echo "[ci-deploy $(date '+%H:%M:%S')] $*"; }

# Same host ports as deploy-prod.sh.
PORT_BACKEND=8082
PORT_FRONTEND=4200
PORT_API_GATEWAY=8085
PORT_NOTIFICATION_SERVICE=8084
PORT_CALL_SERVICE=8086
PORT_KEYCLOAK=8180                       # published on the host loopback only
KEYCLOAK_CONTAINER=keycloak-wacchat

# One deploy at a time, including against a manual ./deploy-prod.sh started with the same lock.
exec 9>/tmp/wacchat-deploy.lock
flock -n 9 || { log "another deploy is running, aborting"; exit 1; }

NEW="$(git rev-parse HEAD)"

# ─── What changed? ───────────────────────────────────────────────────────────
declare -A selected=()
INFRA_CHANGED=()

if [[ "$PREV" != "$NEW" ]]; then
  while IFS= read -r file; do
    case "$file" in
      wac/backend/*)              selected[backend]=1 ;;
      wac/api-gateway/*)          selected[api-gateway]=1 ;;
      wac/file-service/*)         selected[file-service]=1 ;;
      wac/notification-service/*) selected[notification-service]=1 ;;
      wac/call-service/*)         selected[call-service]=1 ;;
      wac/frontend/*)             selected[frontend]=1 ;;
      # Library baked into these four images at build time (multi-stage Dockerfile).
      wac/shared-security/*)
        selected[backend]=1; selected[file-service]=1; selected[notification-service]=1; selected[call-service]=1 ;;
      wac/keycloak/themes/*)      KEYCLOAK=true ;;
      docker-compose*.yml|deploy-prod.sh|wac/keycloak/*|wac/rabbitmq/*|observability/*|wac/database/*)
        INFRA_CHANGED+=("$file") ;;
    esac
  done < <(git diff --name-only "$PREV" "$NEW")
fi

if $FULL; then
  log "full deploy requested"
  if ! ./deploy-prod.sh; then
    log "full deploy failed — rolling back to ${PREV:0:7}"
    git reset --hard "$PREV"
    ./deploy-prod.sh || true
    exit 1
  fi
  exit 0
fi

if ((${#INFRA_CHANGED[@]})); then
  log "WARNING: infra files changed, NOT applied automatically (run ./deploy-prod.sh, or dispatch the workflow with full=true):"
  printf '  %s\n' "${INFRA_CHANGED[@]}"
fi

# Fixed order: backend first (others call it), gateway and frontend last.
ORDER=(backend file-service notification-service call-service api-gateway frontend)
TO_DEPLOY=()
for svc in "${ORDER[@]}"; do [[ -n "${selected[$svc]:-}" ]] && TO_DEPLOY+=("$svc"); done

if ((${#TO_DEPLOY[@]} == 0)) && ! $KEYCLOAK; then
  log "no service touched between ${PREV:0:7} and ${NEW:0:7} — nothing to deploy"
  exit 0
fi
log "deploying ${PREV:0:7} -> ${NEW:0:7}: ${TO_DEPLOY[*]:-}$($KEYCLOAK && echo ' +keycloak theme')"

# ─── Deploy + verify ─────────────────────────────────────────────────────────
wait_for() { # name url
  local i
  for ((i = 1; i <= 40; i++)); do
    if curl -fsS -o /dev/null "$2" 2>/dev/null; then log "$1 is up"; return 0; fi
    sleep 3
  done
  log "$1 did not become healthy ($2)"
  return 1
}

verify() {
  local svc rc=0
  for svc in "$@"; do
    case "$svc" in
      backend)              wait_for backend "http://localhost:$PORT_BACKEND/actuator/health" || rc=1 ;;
      api-gateway)          wait_for api-gateway "http://localhost:$PORT_API_GATEWAY/actuator/health" || rc=1 ;;
      notification-service) wait_for notification-service "http://localhost:$PORT_NOTIFICATION_SERVICE/actuator/health" || rc=1 ;;
      call-service)         wait_for call-service "http://localhost:$PORT_CALL_SERVICE/actuator/health" || rc=1 ;;
      frontend)             wait_for frontend "http://localhost:$PORT_FRONTEND/" || rc=1 ;;
      keycloak)             wait_for keycloak "http://localhost:$PORT_KEYCLOAK/realms/wacchat/.well-known/openid-configuration" || rc=1 ;;
      file-service)
        # No host health probe in deploy-prod.sh for it: the container must at least be running.
        if [[ "$(docker inspect -f '{{.State.Running}}' wacchat-file-service 2>/dev/null)" == "true" ]]; then
          log "file-service is running"
        else
          log "file-service container is not running"; rc=1
        fi ;;
    esac
  done
  return $rc
}

deploy_all() {
  local svc
  for svc in "$@"; do
    log "=== deploy-prod.sh --only=$svc ==="
    ./deploy-prod.sh --only="$svc" || return 1
  done
}

# Keycloak caches themes in production mode, so a theme change needs a container restart. The realm
# setting is (re)applied first because --import-realm only applies at first creation; it is
# idempotent, and a failure there is only a warning (the theme still loads, just no language picker).
sync_keycloak() {
  log "=== keycloak: enable realm i18n + restart to reload the theme ==="
  docker exec "$KEYCLOAK_CONTAINER" sh -c '
    K=/opt/keycloak/bin/kcadm.sh
    $K config credentials --server http://localhost:8080 --realm master \
       --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" &&
    $K update realms/wacchat -s internationalizationEnabled=true \
       -s "supportedLocales=[\"it\",\"en\",\"fr\",\"de\",\"es\"]" -s defaultLocale=it
  ' || log "WARNING: could not enable realm i18n (enable it in Realm settings > Localization)"
  docker restart "$KEYCLOAK_CONTAINER" >/dev/null
}

VERIFY=("${TO_DEPLOY[@]}")
if $KEYCLOAK; then VERIFY+=(keycloak); fi

ok=true
if ((${#TO_DEPLOY[@]})); then deploy_all "${TO_DEPLOY[@]}" || ok=false; fi
if $ok && $KEYCLOAK; then sync_keycloak || ok=false; fi
if $ok && verify "${VERIFY[@]}"; then
  log "deploy OK"
  exit 0
fi

log "deploy FAILED — rolling back to ${PREV:0:7} and redeploying ${VERIFY[*]}"
git reset --hard "$PREV"
if ((${#TO_DEPLOY[@]})); then deploy_all "${TO_DEPLOY[@]}" || true; fi
if $KEYCLOAK; then docker restart "$KEYCLOAK_CONTAINER" >/dev/null || true; fi
verify "${VERIFY[@]}" || log "WARNING: rollback is not healthy either — manual intervention needed"
log "note: schema changes applied by ddl-auto=update are not undone by the rollback"
exit 1

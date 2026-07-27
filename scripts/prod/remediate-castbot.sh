#!/bin/bash
# remediate-castbot.sh
# SOLE command runnable via the castbot-blue test box forced-command SSH key.
# Modes (via $SSH_ORIGINAL_COMMAND): "status" = read-only health report; anything else = full remediation.
# Idempotent; safe to run repeatedly. Brings prod CastBot back up when Reece is away.
#
# ⚠️ DEPLOYED COPY LIVES ON PROD at /home/bitnami/remediate-castbot.sh — this repo copy is the
# source of truth (added after incident 08; the prod copy was previously untracked). Deploying an
# update to prod requires Reece's explicit permission:
#   scp scripts/prod/remediate-castbot.sh castbot-lightsail:/home/bitnami/remediate-castbot.sh
#
# Incident 08 fix: web_status() used `curl -w "%{http_code}" ... || echo "DOWN"` — on failure curl
# still prints its code ("000", or e.g. "503" with -f), and the echo APPENDED "DOWN", yielding
# "000DOWN"/"503DOWN". The `!= "DOWN"` check therefore always saw the web layer as responding and
# the Apache-repair branch was unreachable (defeating the AWS-reboot/nginx scenario this script
# was written for). Now the code is captured once and mapped to DOWN explicitly.
set -uo pipefail
LOG=/home/bitnami/remediate-castbot.log
MODE="${SSH_ORIGINAL_COMMAND:-restart}"
echo "$(date -u +%FT%TZ) invoked from ${SSH_CLIENT:-?} mode=[$MODE]" >> "$LOG"

web_status() {
  local code
  code=$(curl -sk -o /dev/null -w "%{http_code}" -m 5 https://127.0.0.1:443 2>/dev/null) || true
  case "$code" in ""|000) echo "DOWN";; *) echo "$code";; esac
}

if [ "$MODE" = "status" ]; then
  echo "=== CastBot prod STATUS $(date -u +%FT%TZ) ==="
  pm2 list 2>&1 | grep -E "castbot-pm" || echo "castbot-pm NOT in pm2 list!"
  echo "[web] https://127.0.0.1:443 -> $(web_status)"
  echo "=== status check complete (no changes made) ==="
  exit 0
fi

echo "=== CastBot prod REMEDIATION $(date -u +%FT%TZ) ==="
# 1) Web layer: ensure Apache serves HTTPS. After an AWS reboot nginx can grab port 80
#    and block Apache. Fix = stop nginx, (re)start Apache via the Bitnami ctlscript.
#    DOWN here also covers a worker-pool exhausted Apache (incident 08: every worker stuck on
#    proxy timeouts to a frozen backend → local curl gets no response) — a restart frees it.
WS=$(web_status)
if [ "$WS" = "DOWN" ]; then
  echo "[web] 443 DOWN -> stopping nginx, restarting Apache"
  sudo systemctl stop nginx 2>/dev/null || true
  sudo /opt/bitnami/ctlscript.sh restart apache 2>&1 | tail -3 \
    || sudo /opt/bitnami/apache/bin/apachectl start 2>&1 | tail -3
else
  echo "[web] 443 responding ($WS)"
fi

# 2) Bot layer: restart Node. Plain restart preserves PM2 saved env (NODE_OPTIONS). No --update-env.
echo "[bot] restarting castbot-pm"
pm2 restart castbot-pm 2>&1 | tail -2
pm2 save 2>&1 | tail -1

echo "=== status ==="
pm2 list 2>&1 | grep -E "castbot-pm" || echo "castbot-pm NOT in pm2 list!"
echo "[web] https://127.0.0.1:443 -> $(web_status)"
echo "=== remediation complete ==="

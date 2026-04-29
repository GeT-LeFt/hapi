#!/bin/sh
set -e

HAPI_PORT="${HAPI_LISTEN_PORT:-3006}"

/usr/bin/hapi hub &
HUB_PID=$!

echo "[entrypoint] Waiting for hub on port ${HAPI_PORT}..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${HAPI_PORT}/health" > /dev/null 2>&1; then
    echo "[entrypoint] Hub is healthy."
    break
  fi
  if [ "$i" = "30" ]; then
    echo "[entrypoint] Hub failed to start within 60s, exiting."
    exit 1
  fi
  sleep 2
done

HAPI_HOME="${HAPI_HOME:-/root/.hapi}"
rm -f "${HAPI_HOME}/runner.state.json" "${HAPI_HOME}/runner.state.json.lock"

echo "[entrypoint] Starting runner (api=${HAPI_API_URL:-http://localhost:${HAPI_PORT}})..."
export HAPI_API_URL="${HAPI_API_URL:-http://localhost:${HAPI_PORT}}"
/usr/bin/hapi runner start || echo "[entrypoint] Runner start returned non-zero, check logs."

wait $HUB_PID

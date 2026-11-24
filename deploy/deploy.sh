#!/bin/sh
# Runs on the VPS: brings this checkout to origin/master and rebuilds the stack.
# GitHub Actions calls it over SSH (.github/workflows/deploy.yml); its key is
# restricted to this command in root's authorized_keys. .env is untracked,
# so the reset keeps it.
set -eu
cd "$(dirname "$0")/.."

git fetch --quiet origin master
git reset --hard origin/master
echo "[deploy] $(git log -1 --format='%h %s')"

docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

# The API is not published on the host; ask it from inside its container.
for _ in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T api wget -qO- http://localhost:4000/health >/dev/null 2>&1; then
    echo "[deploy] API healthy"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 2
done
echo "[deploy] API did not become healthy" >&2
docker compose -f docker-compose.prod.yml logs --tail 50 api >&2
exit 1

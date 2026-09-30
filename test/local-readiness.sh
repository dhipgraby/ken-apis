#!/usr/bin/env bash
# One owned, disposable local database; never install or prepare dependencies here.
set -euo pipefail
[[ ! ${DATABASE_URL+x} ]] || { echo 'Unset DATABASE_URL first' >&2; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$root"
[[ ! -e .env && ! -L .env && ! -e prisma/.env && ! -L prisma/.env ]] || {
  echo 'Use an env-free fixture' >&2; exit 1;
}
prerequisite='Native prepared cached dependencies required: Prisma CLI and native engines, Prisma client generated for this schema and host, bcrypt, Nest/Jest, Node and pnpm. No installs, generation or downloads are performed.'
for tool in node pnpm docker timeout; do
  command -v "$tool" >/dev/null || { echo "$prerequisite Missing: $tool" >&2; exit 1; }
done
[[ $(timeout --version) == *'GNU coreutils'* ]] || { echo 'GNU timeout required' >&2; exit 1; }
node_bin=$(command -v node)
pnpm_bin=$(command -v pnpm)
docker_bin=$(command -v docker)
cli="$root/node_modules/prisma/build/index.js"
[[ -f "$cli" ]] || { echo "$prerequisite" >&2; exit 1; }
# Resolve once, then pin every Docker operation to this local Unix endpoint.
if [[ ${DOCKER_HOST+x} ]]; then
  docker_host=$DOCKER_HOST
else
  docker_host=$(timeout --kill-after=2s 15s "$docker_bin" context inspect --format '{{.Endpoints.docker.Host}}')
fi
[[ "$docker_host" == unix:///* && "$docker_host" != *$'\n'* ]] || {
  echo 'Only a local Unix Docker socket is allowed' >&2; exit 1;
}
[[ -S "${docker_host#unix://}" ]] || { echo 'Docker endpoint is not a Unix socket' >&2; exit 1; }
docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    timeout --kill-after=2s 15s "$docker_bin" --host "$docker_host" "$@"
}
nonce=$(env -i PATH="$PATH" "$node_bin" -e 'process.stdout.write(require("node:crypto").randomBytes(12).toString("hex"))')
name="ken-framework-db-e2e-$nonce"
owner=$name
db="ken_e2e_$nonce"
work=$(mktemp -d)
chmod 700 "$work"
# Linux /proc identity checks are required for bounded process-group recovery.
[[ $(uname -s) == Linux ]] || { echo 'Local process tests require Linux' >&2; exit 1; }
registry="$work/processes.jsonl"
(umask 077; : > "$registry")
chmod 600 "$registry"
cidfile="$work/container.cid"
cid=''
printf '%s\n' "$docker_host" > "$work/docker-host"
echo "E2E owner: $owner; recovery metadata: $work"

cleanup() {
  status=$?
  trap - EXIT
  trap '' INT TERM
  set +e
  failed=0
  # Recover registered API leaders BEFORE stopping their owned database.
  # A signal between spawn and registration remains an explicit generation gap;
  # SIGKILL of this shell cannot run this trap and is not certified as recovered.
  env -i PATH="$PATH" "$node_bin" "$root/test/cleanup-local-processes.cjs" \
    "$registry" "$owner" || failed=1
  # CID file survives a signal between Docker creation and shell assignment.
  if [[ -s "$cidfile" ]]; then cid=$(<"$cidfile"); fi
  if [[ -n "$cid" ]]; then
    actual=$(docker inspect --format '{{ index .Config.Labels "ken.e2e.owner" }}' "$cid")
    if [[ "$actual" == "$owner" ]]; then
      state=$(docker inspect --format '{{.State.Status}}' "$cid")
      if [[ "$state" == created ]]; then
        docker rm "$cid" >/dev/null || failed=1
      else
        docker stop --time 5 "$cid" >/dev/null || failed=1
      fi
      # --rm is asynchronous. A daemon failure is not proof of absence.
      deadline=$((SECONDS + 20))
      while :; do
        remaining=$(docker ps -aq --no-trunc --filter "id=$cid") || { failed=1; break; }
        [[ -z "$remaining" ]] && break
        if (( SECONDS >= deadline )); then failed=1; break; fi
        sleep 1
      done
    else
      remaining=$(docker ps -aq --no-trunc --filter "id=$cid")
      if [[ $? != 0 || -n "$remaining" ]]; then failed=1; fi
    fi
  else
    remaining=$(docker ps -aq --filter "name=^/${name}$")
    if [[ $? != 0 || -n "$remaining" ]]; then failed=1; fi
  fi
  if (( failed )); then
    echo "CLEANUP FAILED: inspect owner $owner using metadata $work" >&2
    (( status != 0 )) || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$work/home"
clean() {
  env -i PATH="$PATH" HOME="$work/home" CI=1 CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 PRISMA_SKIP_POSTINSTALL_GENERATE=1 \
    COREPACK_ENABLE_NETWORK=0 "$@"
}
# Fail before creating a container if native cached prerequisites are absent.
# Explicit engine paths prevent Prisma from attempting engine acquisition.
if ! engine=$(cd "$work" && clean "$node_bin" - "$cli" <<'NODE'
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const fromCLI = createRequire(process.argv[2]);
  const fromPrisma = createRequire(fromCLI.resolve('prisma/package.json'));
  const engines = fromPrisma.resolve('@prisma/engines/package.json');
  const fromEngines = createRequire(engines);
  const platform = await fromEngines('@prisma/get-platform').getBinaryTargetForCurrentPlatform();
  const binary = path.join(path.dirname(engines), `schema-engine-${platform}`);
  fs.accessSync(binary, fs.constants.X_OK);
  const fromRoot = createRequire(path.join(path.dirname(process.argv[2]), '../../../package.json'));
  const { PrismaClient } = fromRoot('@prisma/client');
  const client = new PrismaClient();
  await client.$disconnect();
  fromRoot('bcrypt');
  process.stdout.write(binary);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE
); then
  echo "$prerequisite" >&2; exit 1
fi

docker create --pull=never --rm --name "$name" --cidfile "$cidfile" \
  --label "ken.e2e.owner=$owner" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=ken_e2e -e POSTGRES_PASSWORD=e2e_dummy \
  -e "POSTGRES_DB=$db" -p 127.0.0.1::5432 postgres:16 >/dev/null
cid=$(<"$cidfile")
[[ $(docker inspect --format '{{ index .Config.Labels "ken.e2e.owner" }}' "$cid") == "$owner" ]]
docker start "$cid" >/dev/null
deadline=$((SECONDS + 60))
until docker exec "$cid" pg_isready -U ken_e2e -d "$db" >/dev/null 2>&1; do
  (( SECONDS < deadline )) || { echo 'PostgreSQL readiness timed out' >&2; exit 1; }
  sleep 1
done
binding=$(docker inspect --format '{{range (index .NetworkSettings.Ports "5432/tcp")}}{{.HostIp}}:{{.HostPort}}{{end}}' "$cid")
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]
port=${BASH_REMATCH[1]}
url="postgresql://ken_e2e:e2e_dummy@127.0.0.1:$port/$db"
sql() { docker exec "$cid" psql -X -v ON_ERROR_STOP=1 -U ken_e2e -d "$db" -Atc "$1"; }
tables=$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")
[[ "$tables" == 0 ]] || { echo 'New database is not empty' >&2; exit 1; }

cp prisma/schema.prisma "$work/schema.prisma"
if [[ -d prisma/migrations ]]; then cp -R prisma/migrations "$work/migrations"; fi
prisma() {
  (cd "$work" && clean DATABASE_URL="$url" PRISMA_SCHEMA_ENGINE_BINARY="$engine" \
    "$node_bin" "$cli" "$@") || {
    echo "Prisma failed. $prerequisite" >&2; return 1;
  }
}
prisma migrate deploy --schema "$work/schema.prisma"
tables=$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name IN ('User','UserInfo','EmailCode','TwoFactorCode')")
[[ "$tables" == 4 ]] || {
  echo "MIGRATION_SCHEMA_CONTRACT_FAILED expected=4 actual=$tables" >&2; exit 1;
}
prisma migrate diff --from-url "$url" --to-schema-datamodel "$work/schema.prisma" --exit-code

build_failed=0
for app in auth users admin; do
  if clean "$pnpm_bin" run build "$app" > "$work/build-$app.log" 2>&1; then
    echo "BUILD PASSED: $app ($work/build-$app.log)"
  else
    echo "BUILD FAILED: $app ($work/build-$app.log)" >&2
    build_failed=1
  fi
done
(( build_failed == 0 )) || exit 1
# One Jest run includes module fixtures and explicitly gated compiled processes.
test_status=0
clean KEN_E2E_DISPOSABLE=1 KEN_E2E_DATABASE_URL="$url" KEN_E2E_PROCESS=1 \
  KEN_E2E_OWNER="$owner" KEN_E2E_PROCESS_REGISTRY="$registry" \
  "$pnpm_bin" run test:e2e || test_status=$?
rows=$(sql 'SELECT (SELECT count(*) FROM public."User") + (SELECT count(*) FROM public."UserInfo") + (SELECT count(*) FROM public."EmailCode") + (SELECT count(*) FROM public."TwoFactorCode")')
if [[ "$rows" != 0 ]]; then
  echo "FIXTURE_CLEANUP_FAILED expected=0 actual=$rows" >&2
  (( test_status != 0 )) || test_status=1
fi
exit "$test_status"

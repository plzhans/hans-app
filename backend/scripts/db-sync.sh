#!/usr/bin/env bash
#
# 환경 DB 데이터를 백업하고, 그 백업으로 다른 환경 DB 를 통째로 채운다.
#
#   db-sync.sh export <env>                backups/<env>.sql 로 백업
#   db-sync.sh import <env> --from <src>   backups/<src>.sql 로 <env> DB 전체 교체
#
# 예) 개발 데이터를 운영으로:
#   db-sync.sh export develop
#   db-sync.sh import production --from develop
#
# 접속정보는 config/<env>/<env>.env 의 DATABASE_URL 에서 읽는다.
# (평문 env 는 env-decrypt.sh 가 .enc 에서 만들어 둔다. gitignore 라 커밋 안 됨.)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # backend/
BACKUP_DIR="$ROOT/backups"

usage() {
  sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

# config/<env>/<env>.env 의 DATABASE_URL(mysql://user:pass@host:port/db?..)을
# HOST/PORT/USER/PASS/DB 전역변수로 푼다.
load_db() {
  local env="$1"
  local file="$ROOT/config/$env/$env.env"
  [ -f "$file" ] || { echo "환경파일 없음: $file" >&2; exit 1; }
  local url
  url=$(grep -m1 '^DATABASE_URL=' "$file" | sed -E 's/^DATABASE_URL=|"//g; s/\?.*//')
  [ -n "$url" ] || { echo "DATABASE_URL 없음: $file" >&2; exit 1; }
  url=${url#mysql://}
  local cred=${url%@*} hostdb=${url##*@}   # 마지막 @ 기준으로 분리(비번에 @ 있어도 안전)
  USER=${cred%%:*}; PASS=${cred#*:}
  local hostport=${hostdb%%/*}
  DB=${hostdb#*/}
  HOST=${hostport%%:*}; PORT=${hostport#*:}
  if [ "$PORT" = "$HOST" ]; then PORT=3306; fi   # 포트 생략 시 기본값
}

cmd_export() {
  local env="$1"
  load_db "$env"
  mkdir -p "$BACKUP_DIR"
  local out="$BACKUP_DIR/${env}_hansapp_${DB}.sql"
  echo "[export] $env ($HOST:$PORT/$DB) → $out"
  MYSQL_PWD="$PASS" mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF \
    -h "$HOST" -P "$PORT" -u "$USER" "$DB" > "$out"
  echo "[export] 완료 ($(du -h "$out" | cut -f1))"
}

cmd_import() {
  local env="$1"; shift
  local src=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) src="${2:-}"; shift 2 ;;
      *) echo "알 수 없는 옵션: $1" >&2; usage ;;
    esac
  done
  [ -n "$src" ] || { echo "--from <env> 필요" >&2; usage; }
  load_db "$src"                                   # src DB 이름으로 백업 파일명 구성
  local in="$BACKUP_DIR/${src}_hansapp_${DB}.sql"
  [ -f "$in" ] || { echo "백업 없음: $in  (먼저: db-sync.sh export $src)" >&2; exit 1; }
  load_db "$env"                                   # 대상 접속정보로 덮어씀
  echo "[import] $src 백업 → $env ($HOST:$PORT/$DB) 전체 교체"
  read -r -p "정말 '$env' DB 를 덮어씁니다. 환경명을 다시 입력: " confirm
  [ "$confirm" = "$env" ] || { echo "취소됨"; exit 1; }
  MYSQL_PWD="$PASS" mysql -h "$HOST" -P "$PORT" -u "$USER" "$DB" < "$in"
  echo "[import] 완료"
}

case "${1:-}" in
  export) shift; [ $# -ge 1 ] || usage; cmd_export "$1" ;;
  import) shift; [ $# -ge 1 ] || usage; cmd_import "$@" ;;
  *) usage ;;
esac

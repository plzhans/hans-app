#!/usr/bin/env bash
# manage-dns.sh · manage-rules.sh · purge-cache.sh 가 함께 쓰는 것들.
# 단독으로 실행하지 않는다.
#
# [자격증명]
# **레포 루트의 .env** 에서 읽는다 (gitignore). 이미 셸에 export 되어 있으면 그쪽이 이긴다.
#
# 서브트리(frontend/.env, backend/config/.env)를 읽지 않는다. 이건 zone(도메인) 을 다루는
# 도구라 어느 한쪽에 속하지 않는다 — api.plzhans.com 처럼 백엔드가 서빙하는 호스트도
# 같은 zone 에 있다. 한쪽 서브트리의 파일을 읽게 하면 그 서브트리에 딸린 도구처럼 굳는다.
#
# 필요한 권한은 루트 .env.example 참고 — 배포 토큰보다 넓다.

CF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$CF_DIR/.." && pwd)"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if [ ! -f "$REPO_ROOT/.env" ]; then
    echo "CLOUDFLARE_API_TOKEN 이 없다. 레포 루트에 .env 를 만들거나 셸에 export 할 것." >&2
    echo "  cp .env.example .env" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq 가 필요하다: brew install jq" >&2
  exit 1
fi

api() {
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -s -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" "https://api.cloudflare.com/client/v4$path" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json"
  fi
}

# 다룰 zone 디렉터리 목록. 인자가 있으면 그 zone 하나, 없으면 zones/ 아래 전부.
#
# **zone 을 디렉터리 이름으로 가른다.** 이 레포는 zone 이 둘이고(medifinder.kr, plzhans.com)
# Cloudflare 의 규칙 entrypoint 는 zone 마다 따로다. 한 폴더에 섞으면 어느 zone 에
# 올릴 규칙인지 파일만 봐서는 알 수 없다.
zone_dirs() {
  local want="${1:-}"
  if [ -n "$want" ]; then
    if [ ! -d "$CF_DIR/zones/$want" ]; then
      echo "zones/$want 가 없다. 있는 zone: $(ls "$CF_DIR/zones")" >&2
      exit 1
    fi
    echo "$CF_DIR/zones/$want"
    return
  fi
  local d
  for d in "$CF_DIR"/zones/*/; do
    [ -d "$d" ] || continue
    echo "${d%/}"
  done
}

# zone 이름 → zone id. 못 찾으면 멈춘다.
zone_id_of() {
  local zone_name="$1" id
  id=$(api GET "/zones?name=$zone_name" | jq -r '.result[0].id // empty')
  if [ -z "$id" ]; then
    echo "zone($zone_name)을 찾지 못했다. 토큰에 Zone · Zone · Read 권한이 있는지 확인할 것." >&2
    exit 1
  fi
  echo "$id"
}

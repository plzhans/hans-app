#!/usr/bin/env bash
# Cloudflare 엣지 캐시를 퍼지한다.
#
#   cloudflare/purge-cache.sh medifinder.kr                    # zone 의 hosts 전부
#   cloudflare/purge-cache.sh medifinder.kr medifinder.kr      # 그 호스트만
#
# **purge_everything 은 쓰지 않는다.** zone 을 여러 호스트가 나눠 쓰기 때문에
# hosts 필터로 대상을 좁힌다. 대상 호스트는 zones/<zone>/settings.json 의 hosts 다.
set -euo pipefail

# shellcheck source=cloudflare/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

zone_arg="${1:-}"
if [ -z "$zone_arg" ]; then
  echo "zone 을 지정할 것: $(basename "$0") <zone> [host ...]" >&2
  echo "  있는 zone: $(ls "$CF_DIR/zones")" >&2
  exit 1
fi
shift

zone_dir=$(zone_dirs "$zone_arg")
zone_name=$(jq -r '.zone_name' "$zone_dir/settings.json")

if [ "$#" -gt 0 ]; then
  hosts=$(printf '%s\n' "$@" | jq -R . | jq -sc .)
else
  hosts=$(jq -c '.hosts' "$zone_dir/settings.json")
fi

echo "=== zone: $zone_name ==="
echo "대상 호스트: $hosts"
zone_id=$(zone_id_of "$zone_name")

result=$(api POST "/zones/$zone_id/purge_cache" "$(jq -nc --argjson h "$hosts" '{hosts: $h}')")
if [ "$(echo "$result" | jq -r '.success')" != "true" ]; then
  echo "실패: $(echo "$result" | jq -c '.errors')" >&2
  exit 1
fi

echo "완료."

#!/usr/bin/env bash
# zones/<zone>/dns/ 아래 레코드를 Cloudflare 에 적용한다(idempotent).
#
#   cloudflare/manage-dns.sh                 # 모든 zone
#   cloudflare/manage-dns.sh medifinder.kr   # 한 zone 만
#
# **name+type 이 일치하는 레코드만 건드린다.** zone 에는 이 레포가 모르는 레코드가 많다
# (메일·소유권 확인·다른 서비스). 파일에 적힌 것만 만들거나 고친다.
#
# 새 레코드는 zones/<zone>/dns/<이름>.json 을 만들면 된다.
# **삭제는 하지 않는다** — 파일을 지워도 Cloudflare 에는 남는다. 남의 레코드를 지우는 사고를
# 막으려는 것이다. 지울 때는 record id 를 확인해 수동으로 DELETE 한다.
set -euo pipefail

# shellcheck source=cloudflare/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

for zone_dir in $(zone_dirs "${1:-}"); do
  zone_name=$(jq -r '.zone_name' "$zone_dir/settings.json")
  files=("$zone_dir"/dns/*.json)
  [ -e "${files[0]}" ] || continue

  echo "=== zone: $zone_name ==="
  zone_id=$(zone_id_of "$zone_name")

  for f in "${files[@]}"; do
    name=$(jq -r '.name' "$f")
    type=$(jq -r '.type' "$f")
    existing_id=$(api GET "/zones/$zone_id/dns_records?name=$name&type=$type" | jq -r '.result[0].id // empty')

    if [ -n "$existing_id" ]; then
      echo "- [$type $name] 기존 레코드 업데이트 (id=$existing_id)"
      result=$(api PATCH "/zones/$zone_id/dns_records/$existing_id" "$(cat "$f")")
    else
      echo "- [$type $name] 새 레코드 생성"
      result=$(api POST "/zones/$zone_id/dns_records" "$(cat "$f")")
    fi

    if [ "$(echo "$result" | jq -r '.success')" != "true" ]; then
      echo "  실패: $(echo "$result" | jq -c '.errors')" >&2
      exit 1
    fi
    echo "  OK"
  done
  echo
done

echo "완료."

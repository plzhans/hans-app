#!/usr/bin/env bash
# zones/<zone>/rules/<phase>/ 아래 규칙을 Cloudflare 에 적용한다(idempotent).
#
#   cloudflare/manage-rules.sh                 # 모든 zone
#   cloudflare/manage-rules.sh medifinder.kr   # 한 zone 만
#
# [왜 Terraform 이 아니라 이 방식인가]
# Cloudflare 는 zone 당 phase 별로 ruleset 이 하나뿐이고, 그 ruleset 을 여러 서비스가 공유한다.
# Terraform 의 cloudflare_ruleset 은 rules 전체를 통째로 관리해서, 다른 서비스가 콘솔에서
# 추가한 규칙까지 지워 버린다. 그래서 Rulesets API 의 **개별 rule 엔드포인트**
# (POST/PATCH .../rules/{rule_id})로 우리 rule 만 ref 기준으로 찾아 건드린다.
#
# 새 규칙은 zones/<zone>/rules/<phase>/<ref>.json 을 만들면 된다.
# **삭제는 하지 않는다** — manage-dns.sh 와 같은 이유다. rule id 를 확인해 수동으로 DELETE 한다.
set -euo pipefail

# shellcheck source=cloudflare/lib.sh
. "$(cd "$(dirname "$0")" && pwd)/lib.sh"

for zone_dir in $(zone_dirs "${1:-}"); do
  zone_name=$(jq -r '.zone_name' "$zone_dir/settings.json")
  [ -d "$zone_dir/rules" ] || continue

  echo "=== zone: $zone_name ==="
  zone_id=$(zone_id_of "$zone_name")

  for phase_dir in "$zone_dir"/rules/*/; do
    phase=$(basename "$phase_dir")
    files=("$phase_dir"*.json)
    [ -e "${files[0]}" ] || continue

    echo "--- phase: $phase ---"
    entrypoint=$(api GET "/zones/$zone_id/rulesets/phases/$phase/entrypoint")
    if [ "$(echo "$entrypoint" | jq -r '.success')" != "true" ]; then
      # 10003 = 이 phase 에 ruleset 이 아직 하나도 없다. 규칙을 한 번도 만든 적 없는 zone 이다.
      # 그때만 빈 ruleset 을 만들어 준다.
      #
      # **PUT 은 rules 를 통째로 갈아 끼운다.** 그래서 여기 말고는 절대 쓰지 않는다 —
      # 이미 규칙이 있는 zone 에 쓰면 다른 서비스가 콘솔에서 넣은 규칙까지 날아간다.
      # 없는 것이 확인된 순간에만 부르므로 지울 것이 없다.
      if [ "$(echo "$entrypoint" | jq -r '.errors[0].code // empty')" = "10003" ]; then
        echo "  (ruleset 없음 — 빈 것으로 만든다)"
        entrypoint=$(api PUT "/zones/$zone_id/rulesets/phases/$phase/entrypoint" '{"rules":[]}')
      fi
    fi
    if [ "$(echo "$entrypoint" | jq -r '.success')" != "true" ]; then
      echo "entrypoint 조회/생성 실패: $(echo "$entrypoint" | jq -c '.errors')" >&2
      exit 1
    fi
    ruleset_id=$(echo "$entrypoint" | jq -r '.result.id')
    existing_rules=$(echo "$entrypoint" | jq -c '.result.rules // []')

    for f in "${files[@]}"; do
      ref=$(jq -r '.ref' "$f")
      existing_id=$(echo "$existing_rules" | jq -r --arg ref "$ref" '.[] | select(.ref == $ref) | .id')

      if [ -n "$existing_id" ] && [ "$existing_id" != "null" ]; then
        echo "- [$ref] 기존 규칙 업데이트 (id=$existing_id)"
        result=$(api PATCH "/zones/$zone_id/rulesets/$ruleset_id/rules/$existing_id" "$(cat "$f")")
      else
        echo "- [$ref] 새 규칙 생성"
        result=$(api POST "/zones/$zone_id/rulesets/$ruleset_id/rules" "$(cat "$f")")
      fi

      if [ "$(echo "$result" | jq -r '.success')" != "true" ]; then
        echo "  실패: $(echo "$result" | jq -c '.errors')" >&2
        exit 1
      fi
      echo "  OK"
    done
  done
  echo
done

echo "완료."

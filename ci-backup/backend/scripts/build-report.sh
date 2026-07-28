#!/usr/bin/env bash
#
# `pnpm -r build` 뒤에 붙어, **방금 만든 산출물이 어디에 무슨 버전으로 있는지** 찍는다.
#
#   pnpm -r build && ./scripts/build-report.sh
#
# 왜 필요한가. 날 것의 `pnpm -r build` 는 각 패키지 tsc 만 돌 뿐 아무 말도 안 한다.
# 그래서 "빌드는 됐다는데 결과물이 어디 있지?" 를 매번 눈으로 찾아야 했다.
# build.sh 의 build-info 구간이 하던 일과 같지만, 그건 검사·번들까지 다 도는 무거운 경로다.
# 이건 dist 만 보고 끝내는 가벼운 요약이다.
#
# **경로는 dist 다. 번들(.deploy/*.tar.gz)이 아니다.** `pnpm -r build` 는 dist 까지만 만든다.
# 번들은 리눅스 컨테이너에서 build.sh 가 따로 굽는다(pnpm ci:bundle). 없는 걸 가리킬 순 없다.
#
# 버전은 version.sh 가 계산한다(0.0.1+a1b2c3d). 신원의 유일한 출처를 하나로 둔다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo
echo "빌드 산출물 (dist):"

found=0
for app_dir in apps/*/; do
  app="$(basename "$app_dir")"
  [ -d "$app_dir/dist" ] || continue
  found=1
  printf '  %-16s %-24s %s\n' \
    "$app" \
    "$("$SCRIPT_DIR/version.sh" "$app_dir" | jq -r .version)" \
    "$PWD/${app_dir}dist"
done

if [ "$found" = 0 ]; then
  echo "  (dist 가 있는 앱이 없다. 먼저 pnpm -r build 를 돌렸는지 확인할 것)"
  exit 1
fi

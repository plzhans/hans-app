#!/usr/bin/env bash
#
# backend 빌드·검사. **빌드 로직의 유일한 출처다.**
#
# CI 워크플로우는 이 스크립트를 호출만 한다. 로직을 워크플로우 YAML 에 두면
# 로컬에서 재현할 방법이 없어서 "CI 에서만 깨지는" 실패가 생긴다.
#
#   ./backend/scripts/build.sh                  # full — 전부 (기본값)
#   ./backend/scripts/build.sh full
#   ./backend/scripts/build.sh hansapi-server   # 그 앱 + 의존 패키지만
#   ./backend/scripts/build.sh api              # 같은 것 (별칭 — lib/apps.sh)
#
# **기본값이 full 인 이유.** 좁은 빌드가 기본이면, 전체를 검사했다고 착각한 채로 통과한다.
# 느린 쪽이 안전한 쪽이므로 느린 쪽을 기본으로 둔다. 빠른 쪽은 명시적으로 고르게 한다.
#
# 앱 이름을 주면 pnpm 필터(`<앱>...`)로 **그 앱이 실제로 의존하는 패키지만** 잡는다.
# hansapi-server 는 워크스페이스 12개 중 7개만 필요하다 — admin-application, cli,
# seouldata-subway 는 건드릴 이유가 없다. install·build·lint·format·test·번들이 전부 좁아진다.
#
#   로컬:  pnpm ci:build [앱]      ← 검사만
#          pnpm ci:bundle [앱]     ← 검사 + 번들 (CI 와 같은 컨테이너)
#   CI:             .github/workflows/build-backend.yml
#
# 호스트에서 그냥 돌려도 된다. 다만 그때는 호스트의 node 를 쓰므로 CI 와 완전히 같지는 않고,
# **배포 번들은 안 만든다**(아래 리눅스 조건 참고).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# shellcheck source=lib/apps.sh
source "$SCRIPT_DIR/lib/apps.sh"

target="${1:-full}"

usage() {
  echo "사용법: $(basename "$0") [full | <앱 이름>]" >&2
  echo >&2
  echo "  full        전부 빌드·검사 (기본값)" >&2
  echo "  <앱 이름>   그 앱과 의존 패키지만. 빌드 시간이 준다" >&2
  echo >&2
  echo "있는 앱 (괄호 안 이름으로도 부를 수 있다):" >&2
  app_help >&2
}

case "$target" in
  -h | --help | help)
    usage
    exit 0
    ;;
esac

# 스코프를 여기서 한 번 정하고 아래 단계들이 그대로 쓴다.
if [ "$target" = 'full' ]; then
  install_scope=()
  run_scope=(-r)
  apps=()
  for d in apps/*/; do apps+=("$(basename "$d")"); done
else
  # api → hansapi-server. 규칙은 lib/apps.sh 가 갖는다(deploy 도 같은 걸 쓴다).
  if ! target="$(resolve_app "$target")"; then
    echo "❌ 그런 앱이 없다: $1" >&2
    echo >&2
    usage
    exit 2
  fi
  # `<앱>...` 의 점 셋이 **의존하는 워크스페이스 패키지까지** 끌어온다. 앱만 잡으면
  # @hansapi/* 가 빌드되지 않아 곧바로 깨진다.
  install_scope=(--filter "$target...")
  run_scope=(-r --filter "$target...")
  apps=("$target")
fi

# 린트·포맷은 pnpm 스크립트가 아니라 글롭으로 도는 단계라 대상 디렉터리를 직접 받아야 한다.
# **빌드 범위와 검사 범위를 같은 곳에서 뽑는다.** 둘이 어긋나면 빌드는 좁게 하고 린트는 넓게
# 도는 조합이 나오는데, 그러면 "이 앱만 빌드" 의 의미가 사라진다.
pkg_dirs=()
while IFS= read -r dir; do
  [ "$dir" = "$PWD" ] && continue # 워크스페이스 루트는 패키지가 아니다
  pkg_dirs+=("${dir#"$PWD"/}")
done < <(pnpm "${run_scope[@]}" list --depth -1 --parseable)

# GitHub Actions 에서는 접히는 그룹으로, 로컬에서는 그냥 한 줄로 보이게 한다.
group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

echo "▶ 대상: $target   (패키지 ${#pkg_dirs[@]}개)"
printf '    %s\n' "${pkg_dirs[@]}"
echo

group "install"
# --frozen-lockfile: lockfile 과 package.json 이 어긋나면 조용히 고치지 말고 실패해야 한다.
# CI 가 lockfile 을 고쳐버리면 그 빌드가 무엇으로 만들어졌는지 아무도 모르게 된다.
pnpm ${install_scope[@]+"${install_scope[@]}"} install --frozen-lockfile
endgroup

group "build"
# 빌드가 곧 타입 검사다(각 패키지의 build 가 tsc). 개발 서버는 swc 라 타입을 보지 않으므로
# 타입 에러는 여기서만 걸린다. 실제로 level→tier 개명 잔재가 이 단계에서 잡혔다.
pnpm "${run_scope[@]}" build
endgroup

# 린트는 반드시 빌드 **뒤**여야 한다.
# packages/* 는 서로의 타입을 dist/*.d.ts 에서 읽는다(apps/* 만 customConditions:["src"] 로
# 소스를 직접 본다). 그래서 dist 가 없으면 @hansapi/* 임포트가 전부 unresolved 가 되고,
# 타입 기반 규칙(no-unsafe-*)이 실제 코드와 무관하게 쏟아진다.
# 개발자 머신에는 dist 가 이미 있어서 이 순서 문제가 잘 안 드러난다. 깨끗한 환경에서만 터진다.
group "lint"
# husky 훅이 커밋 때 이미 돌지만 --no-verify 로 우회할 수 있다. 여기가 마지막 방어선이다.
lint_globs=()
for d in "${pkg_dirs[@]}"; do lint_globs+=("$d/src/**/*.ts"); done
# --no-error-on-unmatched-pattern: src 가 없는 패키지가 섞여도 그걸로 죽지 않는다.
pnpm exec eslint --no-error-on-unmatched-pattern "${lint_globs[@]}"
endgroup

group "format"
fmt_globs=()
for d in "${pkg_dirs[@]}"; do fmt_globs+=("$d/**/*.{ts,js,json}"); done
pnpm exec prettier --check --ignore-unknown "${fmt_globs[@]}"
endgroup

group "test"
# 지금은 스캐폴드 테스트 1 개뿐이다. 늘어나면 여기가 그대로 받는다.
pnpm "${run_scope[@]}" test
endgroup

# 산출물 안에 자기 신원을 박는다. 이게 없으면 서버에 뭐가 떠 있는지 알 방법이 없다.
# 배포 단위(dist)와 같이 다니므로, 산출물만 보고도 어느 커밋인지 알 수 있다.
group "build-info"
for app in "${apps[@]}"; do
  app_dir="apps/$app"
  [ -d "$app_dir/dist" ] || continue
  "$SCRIPT_DIR/version.sh" "$app_dir" > "$app_dir/dist/build-info.json"
  printf '  %-16s %s\n' \
    "$app" \
    "$(jq -r .version "$app_dir/dist/build-info.json")"
done
endgroup

# --- 배포 번들 ----------------------------------------------------------------
#
# **빌드가 번들까지 만든다. 배포는 만들지 않는다.**
#
# 예전에는 deploy-backend.sh 가 install·build·번들링을 다시 했다. 그러면 두 가지가 어긋난다.
#   - 배포할 때마다 다시 빌드하니, **검사를 통과한 그 산출물이 배포된다는 보장이 없다.**
#     (빌드 사이에 워킹트리가 바뀌면 조용히 다른 게 나간다)
#   - 앱이 여럿이고 목적 서버가 다르면 배포를 앱마다 돌려야 하는데, 그때마다 전체를 다시 빌드한다.
#
# 이제 순서가 이렇다.  빌드 1번 → 배포 N번(앱마다, 서버마다)
#
#   ./backend/scripts/build.sh
#   ./backend/scripts/deploy-backend.sh hansapi-server
#   ./backend/scripts/deploy-backend.sh hansapi-batch
#
# 산출 위치는 backend/.deploy/<app>.tar.gz 다. deploy-backend.sh 가 여기만 본다.
#
# **리눅스에서만 만든다.**
#
# Node 도 OS 를 탄다. 순수 JS 패키지는 어디서 압축해도 되지만 네이티브 애드온(.node)은 아니다.
# 우리 스택에는 정확히 하나 있다 — Prisma 다. schema.prisma 의 binaryTargets 가
# ["native", "linux-arm64-openssl-3.0.x"] 인데, **native 는 빌드한 머신의 것**이다.
# 맥에서 구우면 native = darwin-arm64 가 되고, 그 번들에는 서버가 못 쓰는 dylib 이 들어간다.
# (schema-engine 은 darwin 것만 들어가서, 서버에서 마이그레이션을 돌리면 실패한다)
#
# 지금 런타임이 겨우 사는 건 linux-arm64 를 **명시**해 뒀기 때문이다. 그 실 하나에 매달려 있다 —
# bcrypt·sharp 같은 네이티브 의존이 하나만 늘면 조용히 깨진다. 조용히 깨지는 게 제일 나쁘다.
#
# 그래서 맥에서는 아예 안 만든다. 컨테이너(리눅스)에서 구워야 native 가 곧 서버의 것이 된다.
if [ "$(uname -s)" != 'Linux' ]; then
  # **성공 문구를 먼저 낸다.** 예전엔 "배포 번들을 만들지 않았다" 로 시작하고 "다 통과했다" 는
  # 맨 아래 괄호에 넣었더니, 통과한 빌드를 보고도 실패한 줄 알았다. 사람은 첫 줄을 보고 판단한다.
  echo
  echo "✅ 빌드 · 린트 · 테스트 전부 통과.   (대상: $target)"
  echo
  echo "ℹ️  다만 **배포 번들은 안 만들었다** ($(uname -s) 에서 돌고 있어서다). 의도한 동작이다."
  echo
  echo "   Prisma 엔진은 **빌드한 OS 의 것**으로 구워진다. 맥에서 만든 번들을 리눅스 서버에"
  echo "   올리면 못 쓴다. 배포용 번들은 리눅스 컨테이너에서 만들어야 한다."
  echo
  echo "     pnpm ci:bundle      ← CI 와 같은 컨테이너. 번들이 backend/.deploy/ 로 나온다"
  echo
  echo "   검사 목적이었다면 여기서 끝이다. 더 할 일 없다."
  exit 0
fi

group "배포 번들"

# 산출물은 **앱마다 tarball 하나**다. 디렉터리를 그대로 내놓지 않는다.
#
# 이유가 둘이다.
#   - **pnpm deploy 를 마운트 위에서 돌리면 깨진다.** 임시 디렉터리를 만든 뒤 rename 으로
#     자리를 바꾸는데, 바인드 마운트 경계를 넘는 rename 이 조용히 어긋난다. 실제로 그랬다
#     (hansapi-batch_tmp_615_0 만 남고 dist 가 안 들어왔다). 그래서 **컨테이너 안 로컬 디스크에서
#     굽고**, 다 된 것만 마운트로 내보낸다.
#   - 360MB 짜리 디렉터리를 마운트 너머로 파일 단위 복사하면 느리다. tar.gz 하나면 한 번에 쓴다.
#     어차피 deploy 가 tar 로 묶어 보내던 것이라, 그 단계가 여기로 옮겨왔을 뿐이다.
bundle_root="$PWD/.deploy"
mkdir -p "$bundle_root"

# **디렉터리째 지우지 않는다. 내용만 비운다.**
# 컨테이너에서 돌 때 이 경로는 호스트를 가리키는 **마운트 포인트**다(run-in-builder.sh).
# rm -rf 로 지우려 들면 "Device or resource busy" 로 죽는다.
#
# 그리고 **이번에 굽는 앱의 것만 지운다.** 앱 하나만 빌드했는데 남의 번들까지 치우면
# "hansapi-server 를 빌드했더니 hansapi-batch 배포가 번들이 없다고 한다" 가 된다.
# 반대로 자기 것을 안 지우면 옛 번들이 그대로 나갈 수 있다.
if [ "$target" = 'full' ]; then
  find "$bundle_root" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
else
  rm -f "$bundle_root/$target.tar.gz"
fi

# 굽는 자리. 마운트가 아닌 로컬 디스크다.
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

built=()

for app in "${apps[@]}"; do
  app_dir="apps/$app"
  [ -d "$app_dir/dist" ] || {
    echo "  $app: dist 가 없다 — 건너뜀"
    continue
  }

  # pnpm deploy: 이 앱과 그 의존성만 추려 자립형 디렉터리를 만든다(node_modules 포함).
  #
  # --legacy: pnpm 10 부터는 inject-workspace-packages=true 인 워크스페이스에서만 기본 동작한다.
  #   그 설정을 켜면 워크스페이스 전체의 설치 방식이 바뀌므로(심볼릭 링크 → 복사) 여기서만 우회한다.
  #
  # 앱의 package.json 에 "files": ["dist"] 가 있어야 dist 가 담긴다.
  #   pnpm deploy 는 배포 루트가 되는 패키지를 npm pack 규칙으로 담는데, dist 는 gitignore 라
  #   그냥 두면 통째로 빠진다(워크스페이스 의존성은 디렉터리째 복사돼서 이 함정이 안 보인다).
  pnpm deploy --filter "$app" --prod --legacy "$stage/$app" > /dev/null

  # **dist 만 보면 안 된다.** 빌드가 중간에 끊기면 dist 는 있는데 node_modules 가 없는
  # 반쪽 번들이 남는다(실제로 그랬다). 그걸 그대로 보내면 서버에서 앱이 안 뜬다 —
  # 그것도 배포가 "성공" 한 뒤에.
  [ -f "$stage/$app/dist/main.js" ] || {
    echo "  ❌ $app: 번들에 dist/main.js 가 없다. apps/$app/package.json 의 files 를 확인할 것." >&2
    exit 1
  }
  [ -d "$stage/$app/node_modules" ] || {
    echo "  ❌ $app: 번들에 node_modules 가 없다. 반쪽짜리다." >&2
    exit 1
  }

  tar -czf "$bundle_root/$app.tar.gz" -C "$stage/$app" .
  rm -rf "$stage/$app" # 앱 셋이면 1GB 가 넘는다. 다음 앱을 굽기 전에 비운다.

  built+=("$app")
done
endgroup

# **번들이 어디에 생겼는지 반드시 찍는다.**
# 빌드와 배포를 나눈 뒤로, 다음 사람(그리고 CI)이 알아야 할 유일한 값이 이 경로다.
# 안 찍으면 "빌드는 됐다는데 배포가 번들이 없다고 한다" 를 스크립트를 열어봐야 알 수 있다.
echo
echo "✅ backend OK   (대상: $target · 플랫폼: $(uname -sm))"
echo
echo "배포 번들: $bundle_root"
for app in "${built[@]}"; do
  printf '  %-16s %-24s %6s   %s\n' \
    "$app" \
    "$(jq -r .version "apps/$app/dist/build-info.json" 2> /dev/null || echo unknown)" \
    "$(du -h "$bundle_root/$app.tar.gz" | cut -f1)" \
    "$bundle_root/$app.tar.gz"
done
echo
echo "다음 단계 (앱마다 따로, 서버가 달라도 된다):"
for app in "${built[@]}"; do
  echo "  ./backend/scripts/deploy-backend.sh $app"
done

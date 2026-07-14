#!/usr/bin/env bash
#
# backend 빌드·검사. **빌드 로직의 유일한 출처다.**
#
# CI 워크플로우는 이 스크립트를 호출만 한다. 로직을 워크플로우 YAML 에 두면
# 로컬에서 재현할 방법이 없어서 "CI 에서만 깨지는" 실패가 생긴다.
#
#   로컬:  make ci-build-backend   ← CI 와 같은 컨테이너·같은 스크립트
#   CI:    .github/workflows/build-backend.yml
#
# 호스트에서 그냥 ./scripts/ci/build-backend.sh 로 돌려도 된다. 다만 그때는
# 호스트의 node 버전을 쓰므로 CI 와 완전히 같지는 않다. make 타겟은 컨테이너 안에서 돈다.
set -euo pipefail

cd "$(dirname "$0")/../../backend"

# GitHub Actions 에서는 접히는 그룹으로, 로컬에서는 그냥 한 줄로 보이게 한다.
group() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$1"; else echo "▶ $1"; fi
}
endgroup() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::endgroup::"; fi
}

group "install"
# --frozen-lockfile: lockfile 과 package.json 이 어긋나면 조용히 고치지 말고 실패해야 한다.
# CI 가 lockfile 을 고쳐버리면 그 빌드가 무엇으로 만들어졌는지 아무도 모르게 된다.
pnpm install --frozen-lockfile
endgroup

group "build"
# 빌드가 곧 타입 검사다(각 패키지의 build 가 tsc). 개발 서버는 swc 라 타입을 보지 않으므로
# 타입 에러는 여기서만 걸린다. 실제로 level→tier 개명 잔재가 이 단계에서 잡혔다.
pnpm -r build
endgroup

# 린트는 반드시 빌드 **뒤**여야 한다.
# packages/* 는 서로의 타입을 dist/*.d.ts 에서 읽는다(apps/* 만 customConditions:["src"] 로
# 소스를 직접 본다). 그래서 dist 가 없으면 @hansapi/* 임포트가 전부 unresolved 가 되고,
# 타입 기반 규칙(no-unsafe-*)이 실제 코드와 무관하게 쏟아진다.
# 개발자 머신에는 dist 가 이미 있어서 이 순서 문제가 잘 안 드러난다. 깨끗한 환경에서만 터진다.
group "lint"
# husky 훅이 커밋 때 이미 돌지만 --no-verify 로 우회할 수 있다. 여기가 마지막 방어선이다.
pnpm exec eslint "{apps,packages,clients}/*/src/**/*.ts"
endgroup

group "format"
pnpm exec prettier --check "{apps,packages,clients}/*/**/*.{ts,js,json}"
endgroup

group "test"
# 지금은 스캐폴드 테스트 1 개뿐이다. 늘어나면 여기가 그대로 받는다.
pnpm -r test
endgroup

echo "✅ backend OK"

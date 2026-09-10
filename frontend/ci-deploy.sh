#!/usr/bin/env bash
#
# 이미 빌드된 frontend 산출물을 Cloudflare Workers 에 올린다. **빌드하지 않는다.**
#
#   APP_ENV=develop frontend/ci-deploy.sh medifinder-web
#
# 먼저 ci-build.sh 로 dist 를 만들어 둔다. 왜 나뉘어 있는지는 ci-build.sh 헤더 참고 —
# 요약하면 "backend 를 배포한 뒤 frontend 빌드가 깨져 운영이 반쪽만 갱신되는 것" 을 막기
# 위해서다. 릴리스는 전부 빌드한 다음에 배포를 시작한다.
#
# **backend 는 여기 없다.** 산출물(자립형 번들), 전송 수단(SSH·WireGuard), 배포처(사설망
# 서버)가 전부 다르다. 한 파일이 둘 다 알게 하면 대상에 따라 갈라지는 분기만 늘고, 한쪽을
# 고칠 때 다른 쪽을 깨뜨린다. backend 는 backend/ci-deploy.sh 다.
#
# **값은 오로지 환경변수로만 받는다. 누가 채웠는지 이 스크립트는 모른다.**
#
#   CI     .github/workflows/fe-deploy-<환경>.yml 이 secrets/vars 로 주입한다
#   로컬   frontend/deploy.sh 가 **같은 규칙으로** 주입한다
#
# 그래서 배포를 CI 에 태우지 않고 로컬에서 그대로 검증할 수 있고, 급할 때는 로컬이
# 우회로가 아니라 정식 배포 경로가 된다. 둘이 같은 코드를 지나가기 때문이다.
#
# **폴백을 두지 않는다.** ${GITHUB_SHA:-$(git rev-parse HEAD)} 같은 걸 쓰면 로컬과 CI 가
# 서로 다른 값으로 조용히 갈라지고, 그 차이는 배포된 뒤에야 드러난다. 없으면 여기서 죽는다.
#
# [환경변수]
#   APP_ENV                 develop | production
#   GITHUB_SHA              배포하는 커밋. Worker 버전 태그로 박힌다
#   GITHUB_REF_NAME         어디서 나갔는지(브랜치·태그). Worker 버전 메시지로 박힌다
#   CLOUDFLARE_API_TOKEN    Cloudflare API 토큰 (Workers 편집 권한)
#   CLOUDFLARE_ACCOUNT_ID   Cloudflare account id
#   CF_WORKER_NAME          (선택) Worker 이름. 없으면 규칙으로 유도한다
#   CF_ALLOW_CREATE         (선택) 없는 Worker 를 만들도록 허용
#   GITHUB_ACTIONS          (선택) 있으면 로그를 접는다. 그 외 동작 차이는 없다
#
# 이름을 CLOUDFLARE_* 로 맞춘 것은 wrangler 가 그 이름을 직접 읽기 때문이다.
# 우리가 다시 export 해 넘길 필요가 없어진다 — 중간 단계가 없으면 어긋날 곳도 없다.
#
# [Pages 가 아니라 Workers Static Assets 로 올린다]
# 정적 파일만 담은 Worker 를 만든다(코드 없음). Cloudflare 가 신규 정적 호스팅을 이쪽으로
# 몰고 있어서 대시보드에 Pages 생성 경로가 아예 안 뜨는 계정이 있다.
#
# Pages 를 쓸 이유였던 --branch(= production/preview 판정)는 우리에겐 필요가 없다.
# 환경마다 Worker 를 따로 두기 때문이다. 그래서 preview 라는 개념 자체가 등장하지 않고,
# **"배포는 성공했는데 도메인은 안 바뀌는" 실패가 원천적으로 생기지 않는다** —
# `deploy --name X` 는 언제나 그 Worker 를 갱신한다.
set -euo pipefail

# shellcheck source=frontend/ci-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/ci-lib.sh"

# wrangler 는 배포 도구지 배포 입력이 아니다. 기본값을 두되 올리고 싶으면 덮어쓸 수 있게 한다.
WRANGLER_VERSION="${WRANGLER_VERSION:-4}"

# 런타임 동작 기준일은 **각 프로젝트의 wrangler.jsonc 가 정한다.**
# 예전엔 여기서 --compatibility-date 로 전부에 같은 값을 밀어 넣었는데, 그러면 한 프로젝트에서
# 검증하고 올린 날짜가 나머지 전부에 함께 적용된다. 그 날짜는 "이 워커를 어느 런타임 동작에
# 고정할 것인가" 라서, 올리는 사람과 검증하는 사람이 같아야 한다.

resolve_project "${1:-}"
require_app_env

# **Worker 로 안 나가는 대상이 있다.** hansapp-admin 은 backend 이미지 안에서 API 와 같이
# 나간다 — 여기로 오면 이름만 맞는 빈 Worker 가 하나 생기고, 정작 보고 있는 콘솔은 안 바뀐다.
case " $WORKER_TARGETS " in
  *" $project "*) ;;
  *) die "$project 은 Cloudflare Worker 로 배포하지 않는다.
   빌드만 여기서 하고(ci-build.sh), 담는 것은 backend/docker/$project.Dockerfile 이다." ;;
esac

require_env GITHUB_SHA GITHUB_REF_NAME CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

dist_dir="$(dist_dir_for "$project")"
cd "$target_dir"

# 빌드를 여기서 하지 않으므로, 산출물이 없다는 건 순서가 틀렸다는 뜻이다.
[ -d "$dist_dir" ] || die "빌드 산출물이 없다: $AREA/$project/$dist_dir
   먼저 빌드할 것:  APP_ENV=$APP_ENV $AREA/ci-build.sh $project"

CF_WORKER_NAME="$(worker_name_for "$project")"

# **없는 Worker 에는 그냥 배포하지 않는다.**
#
# `wrangler deploy --name X` 는 X 가 없으면 만들고, 있으면 덮어쓴다. 편해 보이지만
# 이름을 잘못 준 배포가 조용히 "성공" 한다 — 엉뚱한 Worker 가 새로 생기고, 정작 보고 있는
# 사이트는 안 바뀐다. 계정에 이미 다른 용도의 Worker 가 같은 이름으로 있으면 그걸
# 덮어쓰는 것도 같은 통로다.
#
# **"없음" 과 "권한 없음" 을 반드시 구분한다.** 둘 다 실패로 뭉뚱그리면, 토큰 권한이
# 모자란 상황에서 "처음 만드는 거니 CF_ALLOW_CREATE 를 주라" 고 엉뚱한 안내를 하게 된다.
# 그 말을 따르면 배포가 인증에서 다시 죽고, 사람은 두 번 헤맨다.
http_code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$CF_WORKER_NAME")

case "$http_code" in
  # 2xx 를 통째로 받는다. 있는 Worker 가 늘 200 을 주지 않는다 — 이 엔드포인트는 스크립트
  # 본문을 돌려주는데, 정적 자산만 담은 Worker 는 본문이 비어서 204 가 온다.
  # 200 만 보면 두 번째 배포부터 전부 막힌다.
  2[0-9][0-9])
    ;;
  400)
    die "Worker 이름 '$CF_WORKER_NAME' 이 유효하지 않다 (HTTP 400). 영문 소문자·숫자·하이픈만 쓸 수 있다."
    ;;
  404)
    # 첫 생성은 의사표시를 받는다. 받는 방법이 상황에 따라 둘이다.
    #
    #   사람이 보고 있으면(tty)  물어본다 — 매번 변수를 앞에 붙이는 건 번거롭고,
    #                            번거로우면 나중엔 무의식적으로 붙이게 되어 의미가 없어진다
    #   CI 면(tty 없음)          CF_ALLOW_CREATE 를 요구한다 — 물어볼 상대가 없고,
    #                            여기서 조용히 만들면 오타 하나가 유령 Worker 를 만든다
    #
    # **CI 는 Worker 를 만들지 않는다.** 새 프론트를 추가할 때는 로컬에서 한 번 만들고
    # CI 를 건다. 그 순서가 규칙이다(docs/cloudflare.md).
    if [ -n "${CF_ALLOW_CREATE:-}" ]; then
      echo "· '$CF_WORKER_NAME' 이 없다. 새로 만든다 (CF_ALLOW_CREATE)."
    elif [ -t 0 ]; then
      echo
      echo "· '$CF_WORKER_NAME' Worker 가 계정에 없다. 처음 배포하는 것으로 보인다."
      echo "    환경 $APP_ENV · 대상 $AREA/$project"
      printf '  이 이름으로 새로 만들까? [y/N] '
      read -r answer
      case "$answer" in
        y | Y | yes | YES) ;;
        *)
          echo "취소했다. 이름이 틀렸다면 APP_ENV($APP_ENV)와 대상($project)을 확인할 것." >&2
          exit 1
          ;;
      esac
    else
      echo "❌ '$CF_WORKER_NAME' Worker 가 계정에 없다." >&2
      echo >&2
      echo "   이름이 맞다면 처음 만드는 것이니 한 번만 허용한다:" >&2
      echo "     CF_ALLOW_CREATE=1 $AREA/deploy.sh $APP_ENV $project" >&2
      echo >&2
      echo "   이름이 틀렸다면 APP_ENV($APP_ENV)와 대상($project)을 확인할 것." >&2
      exit 1
    fi
    ;;
  401 | 403)
    echo "❌ 토큰에 Workers 권한이 없다 (HTTP $http_code)." >&2
    echo "   Cloudflare → My Profile → API Tokens → 해당 토큰 편집" >&2
    echo "   권한에 'Account · Workers Scripts · Edit' 를 추가할 것." >&2
    exit 1
    ;;
  *)
    die "Worker 존재 확인에 실패했다 (HTTP $http_code). 계정 id 와 네트워크를 확인할 것."
    ;;
esac

echo
echo "배포:"
echo "  대상       $AREA/$project"
echo "  환경       $APP_ENV"
echo "  산출물     $AREA/$project/$dist_dir"
echo "  Worker     $CF_WORKER_NAME"
echo "  ref        $GITHUB_REF_NAME"
echo "  커밋       $GITHUB_SHA"
echo

group "deploy ($CF_WORKER_NAME)"
# 정적 파일만 올린다. 엔트리포인트(Worker 코드)를 주지 않으면 assets 전용 Worker 가 된다.
#
# --compatibility-date 를 고정값으로 박는 이유. 안 주면 wrangler 가 "오늘" 을 쓰는데,
# 그러면 같은 산출물을 다시 배포하는 것만으로 런타임 동작이 달라질 수 있다. 배포 시점이
# 결과에 영향을 주면 롤백이 롤백이 아니게 된다. 올릴 때는 사람이 의도해서 올린다.
#
# --tag / --message 는 Worker 버전에 붙는 라벨이다. 대시보드에서 "지금 떠 있는 게 어느
# 커밋인가" 를 답하게 한다. 없으면 롤백할 때 눈으로 맞춰야 한다.
# message 에 'ref:' 를 붙이는 건, 그 자리가 자유 텍스트라 'main' 만 있으면 무슨 값인지
# 읽는 사람이 알 수 없기 때문이다.
#
# CI=true 로 대화형 프롬프트를 막는다. wrangler 는 배포 끝에 이것저것 물어본다
# (텔레메트리 동의, "AI 코딩 에이전트를 감지했는데 Cloudflare skills 를 설치할까?" 등).
# CI 에는 답할 사람이 없어 배포가 거기서 멈추고, 로컬에서는 사람이 매번 다른 답을 하면
# 로컬과 CI 가 갈린다. 배포 명령이 부수효과로 레포에 파일을 쓰는 것도 원치 않는다.
# **워커 런타임 변수.** 빌드가 읽는 것과 **같은 .env.<환경> 파일**에서 읽어 넘긴다.
# wrangler.jsonc 의 vars 에 적으면 값이 두 곳이 되고, 어긋나면 워커가 API 호출에 실패해
# **화면은 멀쩡한 채로 메타만 조용히 빠진다.** 이름을 VITE_ 그대로 두는 것도 같은 이유다 —
# 별명을 만들면 그 매핑표가 또 하나의 틀릴 수 있는 자리가 된다.
var_args=()
case " $WORKER_SCRIPT_TARGETS " in
  *" $project "*)
    env_file=".env.$APP_ENV"
    [ -f "$env_file" ] || die "$AREA/$project/$env_file 이 없다. 워커가 쓸 값을 읽을 수 없다."
    # shellcheck disable=SC1090
    . "./$env_file"
    for key in VITE_SITE_URL VITE_HANSAPP_BASE_URL VITE_HANSAPP_CLIENT_ID; do
      [ -n "${!key:-}" ] || die "$env_file 에 $key 가 비어 있다. 워커가 그 값 없이는 동작하지 않는다."
      var_args+=(--var "$key:${!key}")
    done
    # 워커가 색인 허용 여부를 가르는 데 쓴다. .env 가 아니라 배포 환경에서 온다 —
    # 어느 환경으로 나가는지는 파일이 아니라 이 실행이 아는 값이다.
    var_args+=(--var "APP_ENV:$APP_ENV")
    ;;
esac

# `${arr[@]+"${arr[@]}"}` 인 이유: macOS 기본 bash(3.2)는 set -u 에서 **빈 배열 전개를
# unbound variable 로 보고 죽는다.** `"${arr[@]}"` 로 줄이면 로컬에서만 터진다.
# --allow-build 가 없으면 **pnpm 이 빌드 스크립트를 실행할지 대화형으로 묻고 거기서 멈춘다.**
# dlx 는 임시 스토어에 새로 받으므로 프로젝트의 pnpm-workspace.yaml(allowBuilds)이 닿지 않는다.
# wrangler 가 esbuild 로 번들하고 workerd 로 로컬 실행하므로 둘 다 필요하다.
CI=true WRANGLER_SEND_METRICS=false \
pnpm --allow-build=esbuild,workerd dlx "wrangler@$WRANGLER_VERSION" deploy \
  --name "$CF_WORKER_NAME" \
  --assets "$dist_dir" \
  ${var_args[@]+"${var_args[@]}"} \
  --tag "$GITHUB_SHA" \
  --message "ref: $GITHUB_REF_NAME"
endgroup

echo "✅ $AREA/$project ($APP_ENV) → $CF_WORKER_NAME"

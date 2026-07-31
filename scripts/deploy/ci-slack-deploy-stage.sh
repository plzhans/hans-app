#!/usr/bin/env bash
#
# 배포 카드의 **진행 단계 줄만** 바꾼다. 새 메시지를 올리지 않는다.
#
#   ./scripts/deploy/ci-slack-deploy-stage.sh '이미지를 굽는 중'
#
# chat.update 는 알림을 다시 울리지 않으므로, 단계마다 불러도 채널이 시끄러워지지 않는다.
# 카드 한 장이 조용히 바뀌기만 한다.
#
# [값을 거의 안 받는 이유]
# 카드에 들어갈 것(커밋·작성자·링크)은 매번 같은데, 잡마다 env 블록을 열 줄씩 베끼면
# 한 곳만 고쳐지고 나머지가 남는다. GitHub 이 넣어 주는 환경변수(GITHUB_SHA·GITHUB_ACTOR
# 등)에서 직접 읽어 그 반복을 없앤다.
#
# [환경변수]
#   SLACK_DEPLOY_THREAD_TIMESTAMP   고칠 카드의 ts. **비면 아무것도 안 한다**
#   SLACK_BOT_TOKEN · SLACK_CHANNEL ci-slack-send.sh 가 쓴다
#   APP_ENV                         (선택) 기본 develop
#
# 나머지(GITHUB_SHA·GITHUB_ACTOR·GITHUB_RUN_ID·GITHUB_REPOSITORY·GITHUB_SERVER_URL)는
# Actions 러너가 알아서 넣어 준다.
#
# **어떤 경우에도 0 으로 끝난다.** 부르는 쪽이 `set -e` 라 여기서 1 을 뱉으면 알림 때문에
# 배포가 죽는다.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

stage="${1:-}"
if [ -z "$stage" ]; then
  echo "⚠️  slack: 단계 이름이 없다." >&2
  exit 0
fi

# 알림이 꺼져 있거나 첫 카드가 안 올라갔으면 고칠 대상이 없다.
[ -n "${SLACK_DEPLOY_THREAD_TIMESTAMP:-}" ] || exit 0

server="${GITHUB_SERVER_URL:-https://github.com}"
repo="${GITHUB_REPOSITORY:-}"
sha="${GITHUB_SHA:-}"

card="$(
  CURRENT_STAGE="$stage" \
  DEPLOY_STATUS=started \
  UPDATE_TIMESTAMP="$SLACK_DEPLOY_THREAD_TIMESTAMP" \
  APP_ENV="${APP_ENV:-develop}" \
  GIT_SHA="$sha" \
  GIT_ACTOR="${GITHUB_ACTOR:-}" \
  GIT_SUBJECT="$(git log -1 --pretty=%s 2>/dev/null || true)" \
  RUN_URL="$server/$repo/actions/runs/${GITHUB_RUN_ID:-}" \
  COMMIT_URL="$server/$repo/commit/$sha" \
    "$here/ci-slack-deploy-card.sh" 2>&1
)" || {
  echo "⚠️  slack: 카드를 못 그렸다." >&2
  printf '%s\n' "$card" | sed 's/^/   /' >&2
  exit 0
}

printf '%s' "$card" \
  | "$here/ci-slack-send.sh" --update "$SLACK_DEPLOY_THREAD_TIMESTAMP" --json - >/dev/null
echo "  슬랙 카드: $stage"
exit 0

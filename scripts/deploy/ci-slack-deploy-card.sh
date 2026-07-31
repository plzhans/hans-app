#!/usr/bin/env bash
#
# 배포 스레드의 **루트 카드**를 그린다. 네트워크를 타지 않는다 — JSON 을 stdout 으로 뱉을
# 뿐이고, 부치는 것은 워크플로의 slack-github-action 이 한다.
#
#   DEPLOY_STATUS=started scripts/deploy/ci-slack-deploy-card.sh > card.json
#
# [왜 스크립트로 빼는가]
# 이 카드는 **한 번 그려지고 끝나지 않는다.** 배포가 시작될 때 chat.postMessage 로 올라가고,
# 끝날 때 chat.update 로 같은 자리에 다시 그려진다. 두 곳에서 각자 조립하면 색·문구·링크가
# 어긋나기 시작하고, 그 어긋남은 배포가 실패한 날에야 눈에 띈다.
#
# [왜 워크플로에 JSON 을 직접 쓰지 않는가]
# 커밋 제목이 들어가기 때문이다. `${{ github.event.head_commit.message }}` 를 YAML 안의
# JSON 에 그대로 끼우면 따옴표 하나에 페이로드가 깨지고, 더 나쁘게는 커밋 메시지가 워크플로
# 표현식으로 해석될 여지가 생긴다. 값은 환경변수로 받고 jq 가 이스케이프한다.
#
# [환경변수]
#   DEPLOY_STATUS          started | success | failure | cancelled
#   SLACK_CHANNEL          C… 또는 #이름
#   APP_ENV                develop | production
#   GIT_SHA                전체 sha. 앞 7자만 보여준다
#   GIT_SUBJECT            커밋 제목 한 줄
#   GIT_ACTOR              배포를 요청한 사람
#   RUN_URL                이 워크플로 실행 링크
#   COMMIT_URL             커밋 링크
#   CURRENT_STAGE          (선택) 진행 중일 때 지금 어느 단계인지. "⏳ 이미지를 굽는 중"
#   FAILED_STAGE           (선택) 실패했을 때 어느 단계였는지
#   UPDATE_TIMESTAMP       (선택) 채우면 그 메시지를 고치는 페이로드가 된다(ts 를 넣는다)
set -euo pipefail

: "${DEPLOY_STATUS:?DEPLOY_STATUS 가 필요하다}"
: "${SLACK_CHANNEL:?SLACK_CHANNEL 이 필요하다}"

app_env="${APP_ENV:-develop}"
sha="${GIT_SHA:-}"
short_sha="${sha:0:7}"

# **production 만 다른 색을 쓴다**(앱의 기동 알림과 같은 규칙). develop 은 하루에도 몇 번씩
# 도니 흘려보내도 되지만, 운영이 나간 것은 스크롤하다 걸려야 하는 사건이다.
case "$DEPLOY_STATUS" in
  started)
    emoji='🚀'; label='배포 시작'
    if [ "$app_env" = 'production' ]; then color='#e8912d'; else color='#4a90d9'; fi
    ;;
  success)   emoji='✅'; label='배포 완료'; color='#2eb886' ;;
  failure)   emoji='❌'; label='배포 실패'; color='#d93025' ;;
  # **취소는 빨강이 아니다.** 배포가 줄을 서다 밀려나는 정상적인 일이라, 사고 색을 칠하면
  # 정작 진짜 실패가 눈에 안 걸린다. 앱의 종료 알림이 회색을 쓰는 것과 같은 이유다.
  cancelled) emoji='⚪'; label='배포 취소'; color='#9aa0a6' ;;
  *) echo "❌ DEPLOY_STATUS 가 이상하다: $DEPLOY_STATUS" >&2; exit 1 ;;
esac

# 슬랙 mrkdwn 에서 특별한 뜻을 갖는 세 글자만 막는다. 우리가 `<url|텍스트>` 를 직접 쓰므로,
# 값에 섞여 들어온 꺾쇠는 반드시 죽여야 한다 — 커밋 제목에 `<` 가 들어오면 링크가 깨진다.
escape_mrkdwn() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

subject="$(escape_mrkdwn "${GIT_SUBJECT:-(제목 없음)}")"
actor="$(escape_mrkdwn "${GIT_ACTOR:-unknown}")"

# 커밋 한 줄. 링크가 있으면 sha 를 링크로 건다.
if [ -n "${COMMIT_URL:-}" ] && [ -n "$short_sha" ]; then
  commit_line="<$COMMIT_URL|\`$short_sha\`>  $subject"
elif [ -n "$short_sha" ]; then
  commit_line="\`$short_sha\`  $subject"
else
  commit_line="$subject"
fi

# 한 줄짜리 부연. 진행 중이면 **지금 어느 단계인지**, 실패면 어디서 멈췄는지.
# 이 줄 때문에 채널만 보고도 진행 상황을 알 수 있다 — 깃허브를 열 이유가 사라진다.
detail=''
if [ "$DEPLOY_STATUS" = 'started' ] && [ -n "${CURRENT_STAGE:-}" ]; then
  detail="⏳  $(escape_mrkdwn "$CURRENT_STAGE")"
elif [ "$DEPLOY_STATUS" = 'failure' ] && [ -n "${FAILED_STAGE:-}" ]; then
  detail="$(escape_mrkdwn "$FAILED_STAGE") 단계에서 멈췄다."
fi

context="요청 $actor"
[ -n "${RUN_URL:-}" ] && context="<$RUN_URL|실행 로그>  ·  $context"

jq -n \
  --arg channel  "$SLACK_CHANNEL" \
  --arg update   "${UPDATE_TIMESTAMP:-}" \
  --arg preview  "$emoji $app_env $label · $short_sha" \
  --arg color    "$color" \
  --arg headline "$emoji  *$app_env $label*" \
  --arg commit   "$commit_line" \
  --arg detail   "$detail" \
  --arg context  "$context" '
    { channel: $channel, text: $preview }
    # chat.update 는 고칠 대상을 ts 로 받는다. 없으면 새 메시지가 된다.
    + (if $update != "" then { ts: $update } else {} end)
    + { attachments: [ {
        color: $color,
        blocks: (
          # 객체 값 자리에서 + 를 쓰려면 괄호로 묶어야 한다. jq 문법이 그렇다.
          [ { type: "section", text: { type: "mrkdwn", text: ($headline + "\n" + $commit) } } ]
          + (if $detail != ""
             then [ { type: "section", text: { type: "mrkdwn", text: $detail } } ]
             else [] end)
          + [ { type: "context", elements: [ { type: "mrkdwn", text: $context } ] } ]
        )
      } ] }
  '

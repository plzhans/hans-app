#!/usr/bin/env bash
#
# 사설망으로 가는 터널을 올리고 내린다. **배포 절차가 아니라 인프라다.**
#
#   scripts/deploy/wireguard.sh up
#   scripts/deploy/wireguard.sh down
#
# [왜 배포 스크립트에서 떼어냈나]
# wg-quick 은 시스템 네트워크 인터페이스를 만든다 — 이 프로세스가 끝나도 남는다. 그래서
# 한 번 올려두면 뒤의 단계들은 "서버에 닿는다" 고만 알면 되고, 자기가 VPN 안인지 밖인지
# 몰라도 된다.
#
# 떼어내기 전에는 배포 스크립트마다 이런 분기가 있었다:
#
#   if [ -n "$BE_WIREGUARD_PEER_CONF_FILE" ]; then wg-quick up ...; else echo "이미 붙었다고 본다"; fi
#
# **로컬은 VPN 이 이미 붙어 있어서 그 분기가 항상 else 로 갔다.** 즉 배포 로직 한가운데에
# CI 에서만 도는 코드가 끼어 있었던 것이다. 이제 로컬은 이 파일을 그냥 안 부르면 된다.
#
# [환경변수]
#   APP_ENV                       develop | production  (작업 디렉터리를 가른다)
#   BE_WIREGUARD_PEER_CONF_FILE   WireGuard 설정. **경로 또는 내용**
set -euo pipefail

# shellcheck source=scripts/deploy/stage/_common.sh
. "$(cd "$(dirname "$0")" && pwd)/stage/_common.sh"

action="${1:-}"

# 인터페이스 이름은 wg-quick 이 **설정 파일 이름에서 딴다** → wg.conf 면 'wg'.
conf="$DEPLOY_WORK/wg.conf"

case "$action" in
  up)
    stage_start 'wireguard 연결'
    require_env BE_WIREGUARD_PEER_CONF_FILE
    command -v wg-quick >/dev/null || die 'wg-quick 이 없다.'

    materialize "$BE_WIREGUARD_PEER_CONF_FILE" "$conf"
    wg-quick up "$conf"

    # **핸드셰이크를 확인한다.** WireGuard 는 UDP 라 wg-quick up 이 성공해도 상대가
    # 응답했는지는 알 수 없다. 확인하지 않으면 터널이 안 뚫린 채로 SSH 를 시도하다
    # 60초 timeout 을 기다리게 되고, 에러 메시지도 "connect timed out" 뿐이라
    # 원인이 VPN 인지 서버인지 방화벽인지 구분이 안 된다.
    handshake=0
    for _ in $(seq 1 15); do
      handshake=$(wg show wg latest-handshakes 2>/dev/null | awk '{print $2}' | sort -rn | head -1)
      [ "${handshake:-0}" -gt 0 ] && break
      sleep 1
    done
    if [ "${handshake:-0}" -eq 0 ]; then
      echo '--- wg show ---' >&2
      wg show wg >&2 || true
      die "WireGuard 핸드셰이크가 없다(15초).
   확인할 것:
     - 피어 공개키가 서버에 등록되어 있는지
     - Endpoint 주소·포트가 맞고 UDP 가 막히지 않았는지
     - **같은 키를 다른 곳에서 쓰고 있지 않은지** — 피어는 동시 접속이 안 된다"
    fi
    echo "  핸드셰이크 확인됨"
    ;;

  down)
    # **실패해도 넘어간다.** 정리하는 쪽이라 여기서 멈춰봐야 할 일이 없고, CI 는 이것을
    # always() 로 부르므로 앞이 이미 실패한 상태로 들어오는 것이 정상이다.
    stage_start 'wireguard 해제'
    if [ -f "$conf" ]; then
      wg-quick down "$conf" 2>/dev/null || echo "  (이미 내려가 있다)"
      rm -f "$conf"
    else
      echo "  (올린 적 없다)"
    fi
    ;;

  *)
    echo "사용법: $0 up | down" >&2
    exit 1
    ;;
esac

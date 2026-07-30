#!/bin/sh
#
# 마이그레이션 이미지의 진입점. 두 스키마를 순서대로 반영한다.
#
# **이 컨테이너는 한 번 돌고 죽는다.** 서비스가 아니라 작업이다. compose 에서는
# `docker compose run --rm migrate`, 쿠버네티스에서는 Job 이 이 자리를 맡는다.
#
#   DATABASE_URL       main 스키마
#   DATABASE_LOG_URL   log 스키마 (로그인 기록 등. 보존주기가 달라 분리돼 있다)
#
# [왜 순서대로인가]
# 두 스키마가 shadow DB 를 공유한다. `migrate deploy` 는 shadow 를 쓰지 않지만,
# 동시에 돌릴 이유도 없어 순서대로 둔다 — 어디서 실패했는지가 분명해진다.
#
# [되돌리기]
# `migrate deploy` 에는 down 이 없다. 되돌리려면 새 마이그레이션을 쓴다. 그래서
# 컬럼 삭제·이름 변경은 두 번에 나눈다(코드에서 안 쓰게 배포 → 다음 릴리스에서 삭제).
set -eu

fail() {
  echo "❌ $*" >&2
  exit 1
}

[ -n "${DATABASE_URL:-}" ] || fail 'DATABASE_URL 이 없다.'
[ -n "${DATABASE_LOG_URL:-}" ] || fail 'DATABASE_LOG_URL 이 없다.'

# 적용할 것이 없으면 그냥 통과한다(멱등). 그래서 배포마다 조건 없이 돌려도 무해하다.
for target in main log; do
  echo "▶ $target"
  prisma migrate deploy --schema "prisma/$target"
done

echo "✅ 마이그레이션 완료"

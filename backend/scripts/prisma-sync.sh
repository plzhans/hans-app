#!/bin/sh
# 두 git 시점 사이에 Prisma schema 가 바뀌었으면 클라이언트를 재생성한다.
# 사용법: prisma-sync.sh <ref1> <ref2>
# (git 훅이 시점만 넘겨주면, "무엇이 바뀌면 무엇을 한다"는 backend 가 결정)
git diff --name-only "$1" "$2" 2>/dev/null | grep -q 'schema\.prisma$' || exit 0

echo "[prisma] schema 변경 감지 → 클라이언트 재생성"
pnpm --filter @hansapi/data prisma:generate

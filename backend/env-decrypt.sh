#!/usr/bin/env bash
#
# config/ 아래 암호화된 env 를 sops 로 복호화한다.
# 대상: .env.enc, *.env.enc (예: develop.env.enc, local.env.enc)
# 결과: .enc 를 뗀 평문 (develop.env.enc → develop.env). 평문은 gitignore 라 커밋되지 않는다.
#
# **-name 을 둘 나란히 쓰면 find 가 AND 로 묶어 .env.enc 하나만 걸린다.** -o 로 OR 해야
# <환경>.env.enc 까지 잡힌다.
set -euo pipefail

find . -type f \( -name '.env.enc' -o -name '*.env.enc' \) |
while IFS= read -r file; do
  output="${file%.enc}"
  echo "Decrypting: $file -> $output"
  sops --decrypt "$file" > "$output"
done

echo "Done."

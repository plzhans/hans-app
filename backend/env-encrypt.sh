#!/usr/bin/env bash
#
# config/ 아래 평문 env 를 sops 로 암호화한다. (env-decrypt.sh 의 짝)
# 대상: .env, *.env (예: develop.env, local.env). 이미 암호화된 *.enc 는 건너뛴다.
# 결과: 같은 이름 + .enc (develop.env → develop.env.enc). 키는 .sops.yaml 이 경로로 고른다.
set -euo pipefail

find . -type f \( -name '.env' -o -name '*.env' \) ! -name '*.enc' |
while IFS= read -r file; do
  echo "Encrypting: $file -> $file.enc"
  sops --encrypt "$file" > "$file.enc"
done

echo "Done."

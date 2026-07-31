#!/usr/bin/env bash
#
# config/ 아래 암호화된 env 를 sops 로 복호화한다.
# 대상: .env.enc, .env.<환경>.enc(.env.develop.enc …), local-deploy-<환경>.env.enc.
# 결과: .enc 를 뗀 평문 (.env.develop.enc → .env.develop). 평문은 gitignore 라 커밋되지 않는다.
set -euo pipefail

# sops 가 실패해도 반쪽짜리 평문을 남기지 않는다. 리다이렉트는 파일을 먼저 비우기 때문에
# 그냥 `> "$output"` 로 쓰면 실패 시 0바이트 평문이 남고, 그걸 정상으로 착각하기 쉽다.
decrypt() {
  local src="$1" out="$2" tmp
  tmp="$(mktemp)"
  if sops --decrypt "${@:3}" "$src" > "$tmp"; then
    mv "$tmp" "$out"
  else
    rm -f "$tmp"
    echo "  ❌ 실패: $src" >&2
    return 1
  fi
}

# **config/ 와 infra/ 만 훑는다**(env-encrypt.sh 와 같은 범위). backend/.env 는 앱 설정이
# 아니라 deploy.sh 가 읽는 로컬 배포 변수 파일이라 .sops.yaml 에 규칙이 없다.
# infra/ 쪽은 compose 옆의 서비스별 env(infra/<환경>/.env.redis)다.
find config infra -type f \
  \( -name '.env*.enc' -o -name '*.env.enc' \) |
while IFS= read -r file; do
  output="${file%.enc}"
  echo "Decrypting: $file -> $output"
  decrypt "$file" "$output"
done

# PEM 자산(*.key.enc, *.pem.enc). binary 모드로 복호화한다(env-encrypt.sh 의 짝).
find config -type f \( -name '*.key.enc' -o -name '*.pem.enc' \) 2>/dev/null |
while IFS= read -r file; do
  output="${file%.enc}"
  echo "Decrypting (binary): $file -> $output"
  decrypt "$file" "$output" --input-type binary --output-type binary
done

echo "Done."

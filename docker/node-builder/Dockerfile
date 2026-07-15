# CI 빌드/배포 전용 툴체인 이미지.
# 설치 단계를 이미지에 미리 구워두어 CI 파이프라인에서 apt/npm 설치를 생략한다.
# 설정(ssh key, wireguard conf, pnpm store 경로)은 굽지 않는다. 각 CI 잡에서 주입한다.
#
# NODE_VERSION 은 레포 루트 .nvmrc 값과 반드시 일치해야 한다.
# PNPM_VERSION 은 package.json 의 packageManager 필드와 일치해야 한다.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim

ARG PNPM_VERSION=11.10.0
# 시크릿 암복호화 툴체인. apt 에는 sops 가 없고 age 도 버전이 낮아 릴리스 바이너리로 고정한다.
ARG SOPS_VERSION=3.9.4
ARG AGE_VERSION=1.2.1

ENV DEBIAN_FRONTEND=noninteractive

# bash / tar / gzip 은 base 이미지에 이미 있다.
# native 모듈(node-gyp) 의존성이 없으므로 make/g++/python3 는 넣지 않는다.
# 추가하려면 pnpm-lock.yaml 에 node-gyp 가 등장하는지 먼저 확인할 것.
RUN apt-get update && apt-get install -y --no-install-recommends \
      # 기본
      ca-certificates curl git \
      # 배포 (ssh 원격 실행 + 파일 전송)
      openssh-client rsync \
      # CI 스크립트용
      jq \
      # wireguard. wireguard-go 는 커널 모듈이 없는 컨테이너용 userspace 폴백.
      wireguard-tools wireguard-go iproute2 iptables openresolv \
    && rm -rf /var/lib/apt/lists/*

# sops / age. SOPS 로 암호화된 시크릿을 CI 에서 복호화하는 데 쓴다.
# amd64/arm64 러너 모두 지원하도록 dpkg 아키텍처로 분기한다.
RUN arch="$(dpkg --print-architecture)" \
    && curl -fsSL -o /usr/local/bin/sops \
         "https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.${arch}" \
    && chmod +x /usr/local/bin/sops \
    && curl -fsSL -o /tmp/age.tar.gz \
         "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-${arch}.tar.gz" \
    && tar -xzf /tmp/age.tar.gz -C /tmp \
    && mv /tmp/age/age /tmp/age/age-keygen /usr/local/bin/ \
    && rm -rf /tmp/age /tmp/age.tar.gz \
    && sops --version && age --version

RUN npm install -g pnpm@${PNPM_VERSION} && pnpm --version

# 커널 모듈이 없는 환경에서 wg-quick 이 wireguard-go 를 쓰도록 하는 스위치.
# 커널 모듈이 있는 러너라면 이 값을 빈 문자열로 덮어쓰면 된다.
ENV WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go

WORKDIR /workspace

CMD ["bash"]

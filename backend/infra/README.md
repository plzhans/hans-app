# 서버 인프라 구축 가이드

빈 **OCI Ubuntu 24.04** 인스턴스를 hansapi 백엔드가 돌아가는 상태까지 세팅하는 절차서.
위에서 아래로 순서대로 따라간다.

> 이 문서는 **절차서**다. 실제 설정 파일은 옆의 [`develop/`](./develop/) · [`local/`](./local/) 에 있다.
> 값이 어긋나면 설정 파일 쪽이 정답이다.

## 대상 환경

| 항목            | 값                             |
| --------------- | ------------------------------ |
| OS              | Ubuntu 24.04 LTS (OCI)         |
| 접속 유저       | `ubuntu` (기본 sudo 유저)      |
| Node            | `24.18.0` (nvm 으로 설치)      |
| 패키지 매니저   | `pnpm@11.10.0`                 |
| 프로세스 매니저 | pm2                            |
| 리버스 프록시   | nginx                          |
| 배포 루트       | `~/app/hansapi-develop` (예시) |

## 목차

1. [OS 기본 세팅 (update / upgrade / 필수 유틸)](#1-os-기본-세팅)
2. [WireGuard 설정](#2-wireguard-설정)
3. [Node 설치 (nvm)](#3-node-설치-nvm)
4. [pm2 구축](#4-pm2-구축)
5. [nginx 설치](#5-nginx-설치)

---

## 1. OS 기본 세팅

빈 인스턴스에 처음 붙었을 때 제일 먼저.

```bash
# 패키지 목록 갱신 + 전체 업그레이드
sudo apt update && sudo apt upgrade -y

# 필수 유틸리티
sudo apt install -y \
  build-essential \
  curl wget git \
  ca-certificates gnupg \
  htop vim \
  unzip

# 타임존 (로그 시간 맞추기)
sudo timedatectl set-timezone Asia/Seoul
```

> **OCI 보안 목록 / 방화벽**
> OCI 는 포트 접근을 **VCN 보안 목록(Security List, 또는 NSG)** 이 앞단에서 통제한다.
> 포트를 열어도 안 열리면 콘솔의 Security List 를 먼저 확인한다.

---

## 2. WireGuard 설정

<!-- TODO: 실제 피어/키/서브넷 값 채우기 -->

```bash
sudo apt install -y wireguard
```

키 생성:

```bash
umask 077
wg genkey | tee privatekey | wg pubkey > publickey
```

`/etc/wireguard/wg0.conf` 작성 (값은 환경에 맞게):

```ini
[Interface]
Address    = 10.0.0.X/24
PrivateKey = <이 서버의 privatekey>
ListenPort = 51820

[Peer]
PublicKey  = <상대 publickey>
AllowedIPs = 10.0.0.0/24
Endpoint   = <상대 공인IP>:51820
PersistentKeepalive = 25
```

기동 + 부팅 시 자동 실행:

```bash
sudo systemctl enable --now wg-quick@wg0
sudo wg           # 상태 확인 (handshake 잡히는지)
```

> WireGuard 포트(기본 51820/udp)도 **OCI Security List 에서 열어야** 통한다.

---

## 3. Node 설치 (nvm)

버전 고정을 위해 시스템 패키지 대신 **nvm** 으로 설치한다.

```bash
# nvm 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 현재 쉘에 로드 (또는 재로그인)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 프로젝트 버전 설치 + 기본 지정
nvm install 24.18.0
nvm alias default 24.18.0

node -v   # v24.18.0

# 패키지 매니저 (corepack 으로 pnpm 고정)
corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm -v   # 11.10.0
```

---

## 4. pm2 구축

앱은 pm2 로 띄운다. 설정은 배포 루트에 놓이는 [`develop/ecosystem.config.js`](./develop/ecosystem.config.js) 가 담당한다
(배포 스크립트가 번들과 함께 보낸다).

```bash
# 전역 설치
npm install -g pm2

# 부팅 시 pm2 자동 복구 (출력되는 sudo 명령을 그대로 실행)
pm2 startup systemd
# 예: sudo env PATH=$PATH:... pm2 startup systemd -u ubuntu --hp /home/ubuntu

# (배포 후) 앱 기동 — deploy-backend.sh 가 아래를 만든다
cd ~/app/hansapi-develop
pm2 startOrReload ecosystem.config.js --only develop-hansapi-server

# 현재 프로세스 목록을 저장해 두면 재부팅 후 자동 복구
pm2 save

pm2 status
pm2 logs develop-hansapi-server
```

> 앱은 `127.0.0.1:3000` 에서 뜬다 (nginx 가 이리로 프록시). 외부에 3000 을 직접 열지 않는다.

---

## 5. nginx 설치

리버스 프록시. 설정 파일은 [`develop/config/nginx-http.conf`](./develop/config/nginx-http.conf) ·
[`develop/config/nginx-https.conf`](./develop/config/nginx-https.conf) 를 그대로 쓴다.

```bash
sudo apt install -y nginx

# 설정 배치: 이 저장소의 conf 를 sites-available 로 복사 후 활성화
sudo cp develop/config/nginx-http.conf  /etc/nginx/sites-available/develop-api.plzhans.com
# (https 까지 한 파일로 합쳐 쓰거나, conf.d/ 에 직접 넣어도 된다)
sudo ln -s /etc/nginx/sites-available/develop-api.plzhans.com /etc/nginx/sites-enabled/

# 문법 검사 후 반영
sudo nginx -t
sudo systemctl reload nginx
```

TLS 인증서는 nginx 가 아니라 **acme.sh** 로 따로 발급·갱신한다 (자세한 경로는 `nginx-https.conf` 주석 참고):

```bash
curl https://get.acme.sh | sh
acme.sh --issue -d develop-api.plzhans.com -w /home/ubuntu/app/www/acme
acme.sh --install-cert -d develop-api.plzhans.com \
  --key-file       /home/ubuntu/app/ssl/develop-api.plzhans.com/privkey.pem \
  --fullchain-file /home/ubuntu/app/ssl/develop-api.plzhans.com/fullchain.pem \
  --reloadcmd      "sudo nginx -s reload"
```

> 80/443 포트도 **OCI Security List 에서 열어야** 외부에서 붙는다.

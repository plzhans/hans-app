# 서버 인프라 구축 가이드

빈 **OCI Ubuntu 24.04** 인스턴스를 hansapp 백엔드가 돌아가는 상태까지 세팅하는 절차서.
위에서 아래로 순서대로 따라간다.

> 이 문서는 **절차서**다. 실제 설정 파일은 옆에 있고, 값이 어긋나면 그쪽이 정답이다.
>
> - [`develop/`](./develop/) · [`production/`](./production/) — 환경별. 앱 compose + redis(설정·env)
> - [`shared/`](./shared/) — 환경 무관 공유. 지금은 Elasticsearch 하나
> - [`local/`](./local/) — 로컬 개발용

## 대상 환경

| 항목            | 값                             |
| --------------- | ------------------------------ |
| OS              | Ubuntu 24.04 LTS (OCI)         |
| 접속 유저       | `ubuntu` (기본 sudo 유저)      |
| Node            | `24.18.0` (nvm 으로 설치)      |
| 패키지 매니저   | `pnpm@11.10.0`                 |
| 프로세스 매니저 | Docker (compose)               |
| 배포 루트       | `~/app/hansapp-develop` (예시) |

> **pm2 와 nginx 는 더 이상 안 쓴다.** 앱은 컨테이너로 뜨고(`infra/<환경>/docker-compose.yml`),
> TLS 는 앱이 직접 끝낸다(Origin CA) — Cloudflare 가 오리진에 바로 붙으므로 앞단에 프록시가
> 없다. 그 시절 설정 파일(`ecosystem.config.js` · `nginx-*.conf`)은 지웠다.

## 목차

1. [OS 기본 세팅 (update / upgrade / 필수 유틸)](#1-os-기본-세팅)
2. [WireGuard 설정](#2-wireguard-설정)
3. [Node 설치 (nvm)](#3-node-설치-nvm)
4. [미들웨어 (Docker: Elasticsearch / Redis)](#4-미들웨어-docker-elasticsearch--redis)

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

## 4. 미들웨어 (Docker: Elasticsearch / Redis)

미들웨어는 Docker 로 올린다. **둘의 관리 방식이 정반대다:**

- 검색: [`shared/elasticsearch/`](./shared/elasticsearch/) — ES 9 + 다국어 형태소(nori/kuromoji/smartcn/icu).
  **develop 과 production 이 한 인스턴스를 같이 쓴다** — 그래서 `<환경>/` 이 아니라
  `shared/` 에 있다. 독립 compose 이고 **배포가 나르지 않는다.** 아래 4-3 대로 서버에서 직접 올린다.
- 캐시: **환경마다 하나씩, 앱 compose 안에 있다**
  ([`develop/docker-compose.yml`](./develop/docker-compose.yml) 의 `redis` 서비스).
  Redis 7, AOF, `maxmemory 128mb` — 튜닝은 [`develop/config/redis/redis.conf`](./develop/config/redis/redis.conf).
  **배포가 compose·conf·env 를 같이 날라 띄우므로 이 절에서 할 일이 없다.**

**왜 하나는 공유고 하나는 갈랐나.** ES 는 인덱스 이름으로 환경이 갈리고, 이미지를 직접
굽는 데다(형태소 플러그인) 인덱스 수명이 배포와 별개라 한 인스턴스로 충분하다. 캐시는
접두사만으로는 한쪽이 메모리를 다 먹으면 다른 쪽 키가 밀려나는 것을 못 막아서 프로세스를
나눴다. 실제로 갈라 두기 전에는 develop 의 `REDIS_URL` 이 production 캐시를 가리키고
있었는데, 같은 스택 안에서 서비스 이름(`redis:6379`)으로 부르게 되면서 저절로 정리됐다.

비밀번호의 **원본은 `infra/<환경>/.env.redis`** 다(sops). compose·redis.conf 와 한 폴더에
두어, 배포가 나르는 것과 읽는 사람이 보는 곳을 맞췄다. 앱은 `config/.env.<환경>` 의
`REDIS_URL` 안에 든 같은 값으로 붙는다 — **두 값이 어긋나면 NOAUTH 로 튕기니 같이 고친다.**

배포 경로의 파일은 이렇게 갈린다:

| 파일         | 쓰는 곳                          | 시크릿      |
| ------------ | -------------------------------- | ----------- |
| `.env`       | compose 보간(`${IMAGE_TAG}`·uid) | 없음        |
| `.env.redis` | redis 서비스의 `env_file`        | 있음 (0600) |
| `config/`    | api·batch 의 설정·시크릿 마운트  | 있음 (0600) |
| `redis/`     | redis.conf 마운트                | 없음 (0644) |

> **호스트 포트는 `.env.redis` 가 아니라 compose 에 박혀 있다.** `ports:` 의 `${...}` 는
> `env_file` 이 아니라 **보간**이라 출처가 `.env` 여야 하는데, 그 `.env` 는 배포가 매번 새로
> 쓴다 — 사설 IP 한 줄 때문에 그 왕복을 만들 이유가 없어 api 포트(8443/443)처럼 그냥 적었다.

앱 시크릿 뭉치(`config/.env.<환경>`)를 redis 에 통째로 주지 않는 이유는, 그 안에 DB 접속
문자열·JWT 키·슬랙 토큰까지 들어 있어서다 — 캐시 컨테이너 환경에 그것들이 있을 이유가 없다.

### 4-1. Docker 설치

```bash
sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu   # 재로그인 후 sudo 없이 docker 사용
```

### 4-2. 호스트 커널 파라미터 (필수)

> 이건 **호스트 커널 설정**이라 Dockerfile/컨테이너 안에서 못 바꾼다. 서버에서 한 번만 잡아준다.
> 안 잡으면 ES 는 기동 실패, Redis 는 백그라운드 저장(fork) 시 경고/실패가 난다.
> Redis 쪽은 배포가 띄우는 컨테이너에도 그대로 해당하니, **첫 배포 전에** 잡아 둔다.

```bash
# Elasticsearch: mmap 카운트 상한 (미설정 시 부팅 거부)
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf

# Redis: 백그라운드 저장(fork) 안정화
echo 'vm.overcommit_memory=1'  | sudo tee /etc/sysctl.d/99-redis.conf

# 재부팅 없이 즉시 반영
sudo sysctl --system
```

### 4-3. Elasticsearch 기동

독립 compose 다. `.env`(비밀번호)는 git 에 없으니 서버에서 직접 만든다.

```bash
cd ~/app/hansapp-develop/backend/infra/shared/elasticsearch
echo 'ELASTIC_PASSWORD=<비밀번호>' > .env
docker compose up -d --build
```

> **한 번만 올린다.** develop 과 production 이 같이 쓰므로 환경마다 반복하지 않는다.

> **바인딩 주의**: 앱과 **같은 서버**면 `127.0.0.1:9200` 로 loopback 바인딩(외부 차단).
> 앱이 **다른 서버에서 WireGuard 로** 붙으면 compose 의 `ports` 를 `<wg-ip>:9200` 으로 바꾼다.
> 어느 쪽이든 **OCI Security List 에는 열지 않는다** — `0.0.0.0` 로 열어두면 인터넷에 노출된다.

### 4-4. Redis — 옛 독립 스택 정리 (이관 시 1회)

배포가 앱 스택 안에서 redis 를 띄우므로, 예전 컨테이너가 남아 있으면 **이름만 다른 두
인스턴스가 같이 돈다.** 앱은 새 쪽에 붙지만 옛 쪽이 메모리를 계속 물고 있다. 첫 배포
전후에 한 번 내린다.

```bash
# 서버에서 (환경마다)
docker rm -f hansapp-redis-develop hansapp-redis-production 2>/dev/null
rm -rf ~/app/hansapp-*/backend/infra/*/redis
```

담긴 것은 캐시뿐이고 세션·토큰은 DB 에 있으므로 **옛 `data/` 는 그냥 버리면 된다.**
새 인스턴스는 빈 채로 떠서 첫 조회부터 다시 채운다.

### 4-5. Redis 들여다보기

**VPN 에서 붙는다.** 환경별로 포트가 갈린다 — 같은 호스트에 둘 다 뜨기 때문이다.
앱은 이 포트를 안 쓴다(compose 네트워크의 `redis:6379`).

| 환경       | 포트   |
| ---------- | ------ |
| develop    | `6379` |
| production | `6380` |

```bash
redis-cli -h <서버 사설 IP> -p 6379 -a '<비밀번호>'     # develop
```

> ⚠️ **이 포트들은 `0.0.0.0` 에 열린다.** compose 에 바인드 주소를 적지 않았으므로 공인 NIC
> 에도 리스닝이 뜬다. **막는 것은 OCI Security List 하나뿐이다** — 6379·6380 을 보안목록에서
> 절대 열지 말 것. 호스트의 ufw 는 소용없다(도커가 iptables 를 직접 만져 우회한다).
>
> 노출됐는지 밖에서 확인하려면: `nc -vz <서버 공인IP> 6379` — 붙으면 보안목록을 고쳐야 한다.

서버에 이미 들어가 있다면 VPN 없이 컨테이너로:

```bash
cd ~/app/hansapp-develop/backend   # 배포 경로
docker compose exec redis sh -c 'redis-cli -a "$REDIS_PASSWORD"'
```

비밀번호는 **환경마다 다르다**(`infra/<환경>/.env.redis`). 예전에는 develop 과 production
이 같은 값을 썼는데, 캐시가 한 인스턴스이던 시절의 잔재다.

**영숫자만 쓴다.** 강도 때문이 아니라 이 값이 `REDIS_URL` 안에 그대로 들어가기 때문이다 —
`@` 가 섞이면 redis-cli 는 첫 `@` 에서 호스트를 끊고(`Name does not resolve`) 앱
(`normalizeConnectionUrl`)은 마지막 `@` 기준으로 잘라, 같은 문자열을 둘이 다르게 읽는다.
`$` 는 compose 보간에 먹힌다. 길이로 채우는 편이 조용하다.

> **`-u` 로 확인할 때는 username 을 적어야 한다.** `redis://:<pw>@redis:6379` 처럼 비우면
> redis-cli 가 빈 문자열을 username 으로 AUTH 를 보내 `WRONGPASS` 가 난다. `redis://default:<pw>@…`
> 로 하면 통한다. **앱은 무관하다** — node-redis 는 username 이 비면 아예 안 보낸다.
> 그래서 `REDIS_URL` 은 지금 형태 그대로 두면 된다.

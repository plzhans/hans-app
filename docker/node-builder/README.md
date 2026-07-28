# node-builder

CI 빌드/배포용 툴체인 이미지. 매 잡마다 apt/npm 설치를 반복하지 않기 위해 미리 구워둔다.

## 태그

```
ghcr.io/plzhans/hans-api/node-builder:latest         ← 이걸 쓴다. 최신 빌드로 계속 옮겨간다
ghcr.io/plzhans/hans-api/node-builder:node24         ← node 메이저를 고정하고 싶을 때. 최신 빌드로 옮겨간다
ghcr.io/plzhans/hans-api/node-builder:node24.18.0    ← 실제로 깔린 패치까지. 안 움직인다
ghcr.io/plzhans/hans-api/node-builder:node24-<sha>   ← 특정 커밋으로 고정하고 싶을 때. 안 움직인다
```

**`latest` 는 `.nvmrc` 가 가리키는 node 버전에만 붙는다.** 그냥 "가장 최근에 구운 것" 에 붙이면 버전이 둘 이상이 되는 순간 `latest` 가 무엇인지 모호해지고, 소비하는 잡이 조용히 엉뚱한 node 를 물게 된다. `.nvmrc` = "이 레포의 표준 node" 를 기준으로 삼으면 나중에 22 를 추가해도 뜻이 안 흔들린다.

**움직이는 태그(`latest`, `node24`)는 `main` 에서만 찍는다.** 브랜치에서 `workflow_dispatch` 로 시험 삼아 돌린 이미지가 `latest` 를 덮으면 그 순간부터 모든 fe/be 빌드가 검증 안 된 툴체인을 문다. 브랜치 실행은 `:node24-<sha>` 만 남기므로, 시험할 땐 그 태그를 명시해서 쓴다.

`latest` 를 쓰면 잡 로그만 봐서는 어느 이미지였는지 알 수 없다. 그래서 라벨에 `revision`(커밋 sha)까지 박아둔다 — 아래 [포함된 것](#포함된-것) 참고.

## 아키텍처

`linux/amd64` 와 `linux/arm64` 를 같이 굽는다. 매니페스트 하나로 묶여 있어 `docker pull` 하는 쪽이 알아서 고른다.

- **amd64** — CI 러너(`ubuntu-latest`). 이 이미지의 본래 용도다.
- **arm64** — 로컬 맥(Apple Silicon). 에뮬레이션 없이 네이티브로 돌리기 위해 굽는다.

arm64 는 amd64 러너에서 QEMU 로 에뮬레이션해 빌드하므로 그쪽 `apt` 설치가 느리다. 그래도 이 이미지는 `paths` 필터 때문에 `docker/node-builder/**` 가 바뀔 때만 빌드된다(1 년에 몇 번). 매 커밋마다 도는 게 아니라 감수할 만하다.

베이스(`node:24-bookworm-slim`)는 패치 버전이 떠 있다. Dockerfile 을 안 고쳐도 재빌드하면 24.18.0 이 24.19.x 가 된다. 그래서 워크플로우가 빌드 직전에 실제로 깔릴 버전을 확인해 `:node24.18.0` 태그와 라벨에 박는다. 보안 패치는 자동으로 따라가되, "이 이미지에 뭐가 들었나" 는 이미지 자신이 답하게 하기 위해서다.

```bash
docker inspect --format '{{json .Config.Labels}}' ghcr.io/plzhans/hans-api/node-builder:latest | jq
# io.hansapi.node-builder.node = 24.18.0
# io.hansapi.node-builder.pnpm = 11.10.0
# org.opencontainers.image.revision = <이 이미지를 구운 커밋>
```

현재 굽는 버전은 `24` 하나다 (루트 `.nvmrc`). backend/frontend 공용이다.

프론트/백엔드의 node 버전이 갈릴 때 워크플로우의 `NODE_VERSIONS` 에 추가하면 matrix 가 따라온다. 그때도 `latest` 는 `.nvmrc` 쪽에만 붙으므로, 나머지 버전을 쓰는 잡은 `:node<버전>` 으로 명시해야 한다.

## 포함된 것

| | 버전 | 비고 |
|---|---|---|
| node | 24 | 태그별. 워크플로우의 `NODE_VERSIONS` 기준 |
| pnpm | 11.10.0 | `package.json` 의 `packageManager` 기준 (node 버전 무관) |
| git, curl, jq | - | 체크아웃 / CI 스크립트 |
| openssh-client, rsync | - | 원격 배포 |
| wireguard-tools, wireguard-go, iproute2, iptables, openresolv | - | VPN 경유 배포 |

`bash`, `tar`, `gzip` 은 base 이미지에 이미 있다. 현재 `pnpm-lock.yaml` 에 native 모듈(node-gyp) 의존성이 없어 `make/g++/python3` 는 빼뒀다 (이미지 648MB → 372MB). native 의존성이 생기면 그때 추가할 것.

설정은 이미지에 굽지 않는다. ssh key, wireguard 설정, pnpm store 경로는 전부 사용하는 CI 잡에서 주입한다.

## 최초 1회: 패키지 공개 전환

GHCR 패키지는 레포가 public 이어도 **처음엔 private 으로 생성된다** (레포 visibility 를 상속하지 않는다).
첫 푸시가 성공한 뒤 한 번만 바꿔주면 된다.

> 레포 → Packages → `node-builder` → Package settings → Danger Zone → Change visibility → Public

private 인 채로 두면 같은 레포 워크플로우에서는 `GITHUB_TOKEN` 으로 pull 되지만,
로컬 `docker pull` 이나 다른 레포에서는 401 이 난다.

## 버전 갱신

node 버전 목록의 유일한 진실은 워크플로우 상단의 `NODE_VERSIONS` 다. 여기만 고치면 matrix 가 따라온다.

`.nvmrc` 가 `NODE_VERSIONS` 에 없는 버전을 가리키면 `setup` 잡이 실패한다. 존재하지 않는 태그를 pull 하다가 나중에 터지는 것보다 낫기 때문이다. 그러니 프론트/백엔드가 새 버전으로 갈릴 땐 `NODE_VERSIONS` 에 먼저 추가할 것.

pnpm 은 `packageManager` 필드에서 읽어온다. Dockerfile 의 `ARG` 기본값은 로컬 빌드용 폴백일 뿐이다.

`.nvmrc` 와 루트 `package.json` 도 워크플로우의 `paths` 에 들어 있다. node/pnpm 을 올렸는데 이미지가 그대로면 로컬과 CI 의 툴체인이 조용히 어긋나기 때문이다.

## 사용 예

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    container:
      # 평소엔 latest. 매 빌드가 최신 툴체인을 문다.
      image: ghcr.io/<owner>/hans-api/node-builder:latest
      # wg-quick 은 커널 모듈이 있든(NET_ADMIN) 없든(TUN) 둘 다 필요하다.
      options: --cap-add NET_ADMIN --device /dev/net/tun
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
```

### wireguard

`WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go` 가 기본값이라, 커널 모듈이 없는 컨테이너에서도 `wg-quick` 이 userspace 로 붙는다. 커널 모듈을 쓰는 러너라면 이 값을 빈 문자열로 덮어쓴다.

설정 파일은 `/etc/wireguard` 를 쓰지 않아도 된다. 임의 경로를 `wg-quick` 에 직접 넘기면 된다.

```bash
umask 077
printf '%s' "$WG_CONFIG" > "$RUNNER_TEMP/wg0.conf"
wg-quick up "$RUNNER_TEMP/wg0.conf"
# ... 배포 ...
wg-quick down "$RUNNER_TEMP/wg0.conf"
```

`wg-quick` 은 설정 파일 이름에서 인터페이스 이름을 딴다. 즉 `wg0.conf` → `wg0`.

### ssh

```bash
umask 077
mkdir -p ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY"  > ~/.ssh/id_deploy
printf '%s\n' "$SSH_KNOWN_HOSTS"  > ~/.ssh/known_hosts
ssh -i ~/.ssh/id_deploy deploy@10.0.0.5 'systemctl restart hans-api'
```

`known_hosts` 없이 `StrictHostKeyChecking=no` 로 넘기면 MITM 에 노출된다. VPN 안이라도 host key 는 고정해두는 게 맞다.

## 로컬 빌드

```bash
docker build \
  --build-arg NODE_VERSION=24 \
  --build-arg PNPM_VERSION=11.10.0 \
  -t node-builder:node24-local .
```

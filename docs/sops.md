# SOPS — 시크릿 암호화

`.env`·서명키 같은 시크릿을 **암호화한 채로 git 에 커밋**하기 위해 [SOPS](https://github.com/getsops/sops)
를 쓴다. SOPS 는 파일 전체를 뭉개지 않고 **값만 암호화**해서, diff 로 "어떤 키가 바뀌었나"
는 보이되 값은 감춘다. 평문은 각자 로컬에서 복호화해서만 존재하고 커밋되지 않는다.

---

## 키 방식 — 이 프로젝트는 age 를 쓴다

SOPS 는 도구(매니저)일 뿐이고, 실제 암복호화 키는 **백엔드**를 골라 붙인다. age · gpg ·
클라우드 KMS(AWS/GCP/Azure) 등이 있다. **이 저장소는 `age` 로 통일했다** — 파일 하나짜리
키라 다루기 쉽고, gpg 키체인이나 클라우드 계정 없이 개발자·서버가 바로 쓴다.

어떤 파일을 **누구 앞으로** 암호화할지는 `backend/.sops.yaml` 이 **경로 규칙**으로 정한다.
그래서 암호화할 때 수신자를 손으로 지정할 필요가 없다 — SOPS 가 파일 경로를 보고 고른다.

키는 두 역할로 나뉜다.

| 역할 | 공개키(수신자) | 어디에 붙나 | 누가 복호화하나 |
| --- | --- | --- | --- |
| **개인키** | `age1hay0w…92s26` | 모든 규칙 | 개발자 로컬 |
| **서버키** | `age1zg5n5z…mmm54` | `config/develop/*` · `config/production/*` | 배포 대상 서버 |

한 파일을 **여러 수신자 앞으로** 암호화하면 그중 아무 개인키로나 풀 수 있다. 그래서
`config/develop/develop.env` 는 개인키·서버키 둘 다로 암호화돼 — 개발자도 로컬에서 풀고,
develop 서버도 배포 때 자기 키로 푼다. 반대로 `local-deploy-*.env` 는 개인키만 앞으로 하니
서버는 못 읽는다(그 파일은 개발자 머신에서만 쓰는 배포 설정이라 서버가 알 필요가 없다).

> 위 `age1…` 은 **공개키(수신자)** 라 저장소에 그대로 있어도 된다. 비밀은 짝이 되는
> **개인키(`AGE-SECRET-KEY-1…`)** 이고, 이건 절대 커밋하지 않는다.

---

## 키 생성

`age-keygen` 으로 한 쌍을 만든다.

```bash
age-keygen -o keys.txt
# 출력: Public key: age1abc...      ← 이게 수신자. .sops.yaml 에 넣는다
# keys.txt 안에는 AGE-SECRET-KEY-1... (개인키) 가 들어 있다 — 이 파일을 지키면 된다
```

- **공개키(`age1…`)** 는 새 파일을 그 사람/서버 앞으로 암호화하고 싶을 때 `.sops.yaml` 의
  해당 규칙 `age:` 에 콤마로 덧붙인다. (새 팀원·새 서버를 들일 때 하는 일이다.)
- **개인키가 든 `keys.txt`** 는 복호화할 사람의 머신에만 둔다. 아래 위치에 놓거나 환경변수로
  경로를 알려준다.

## 개인키를 어디에 두나 — SOPS 가 age 키를 찾는 곳

SOPS 는 복호화할 때 age 개인키를 **정해진 파일에서** 찾는다. 우선순위는 이렇다.

1. `SOPS_AGE_KEY` — 개인키 문자열을 값으로 직접 넘긴다. CI 에서 시크릿으로 주입할 때 쓴다.
2. `SOPS_AGE_KEY_FILE` — **임의 경로**의 keys.txt 를 가리킨다. 프로젝트별로 키를 나눠 둘 때.
   ```bash
   export SOPS_AGE_KEY_FILE="$HOME/.keys/hans-api/keys.txt"
   ```
3. 위 둘 다 없을 때만 **OS 기본 위치**의 `sops/age/keys.txt` 를 읽는다. 이 기본은 sops 가
   Go 의 `os.UserConfigDir()` 을 따르므로 OS 마다 다르다 — macOS 는
   `~/Library/Application Support/sops/age/keys.txt`, Linux 는 `~/.config/sops/age/keys.txt`.

**실무에선 보통 `SOPS_AGE_KEY_FILE` 을 걸어 두고 기본 위치는 안 쓴다** — 프로젝트마다 키를
분리하고, macOS 의 `Library/Application Support` 대신 원하는 경로에 두기 위해서다. 그래서
"기본 위치에 없는데 왜 복호화가 되지" 는 대개 env 가 잡혀 있는 것이다. 지금 어디를 보는지
확인:

```bash
echo "$SOPS_AGE_KEY_FILE"
# 예) /Users/plzhans/.config/age/key.txt  ← 이 경로가 잡혀 있으면 OS 기본은 안 본다
```

---

## 보통 암호화 / 복호화

`.sops.yaml` 이 수신자를 경로로 골라 주므로 명령은 단순하다.

```bash
# 암호화 — 평문을 .enc 로
sops --encrypt config/develop/develop.env > config/develop/develop.env.enc

# 복호화 — .enc 를 평문으로
sops --decrypt config/develop/develop.env.enc > config/develop/develop.env

# 값만 고칠 때 — 복호화된 내용이 $EDITOR 로 열리고, 저장하면 자동으로 다시 암호화된다
sops config/develop/develop.env.enc
```

세 번째(`sops <파일>`)가 가장 안전하다 — 평문이 디스크에 남지 않고, 저장 시 원래 수신자
그대로 재암호화된다.

---

## 이 프로젝트는 스크립트로 자동화돼 있다

파일마다 `sops` 를 치는 대신, `backend/config/` 아래를 **한 번에** 처리하는 짝 스크립트가
있다. 자세한 대상·동작은 스크립트 주석을 직접 본다.

| 스크립트 | 하는 일 | 언제 |
| --- | --- | --- |
| [`backend/env-decrypt.sh`](../backend/env-decrypt.sh) | `.enc` → 평문 | 클론·pull 후 |
| [`backend/env-encrypt.sh`](../backend/env-encrypt.sh) | 평문 → `.enc` | 값 고친 뒤, 커밋 전 |

```bash
cd backend
./env-decrypt.sh   # 처음 받았을 때
./env-encrypt.sh   # 값 고친 뒤
```

두 스크립트가 챙기는 대상은 두 종류다 — **env 파일**(`.env`, `<환경>.env`)은 값 단위로,
**서명키 PEM**(`config/**/*.key`)은 통짜 바이너리로 암호화한다.

### 커밋되는 것과 안 되는 것

`backend/.gitignore` 가 **평문은 전부 막고 `.enc`·`.example` 만 추적**한다.

```
*.env          → 무시 (시크릿)
!*.enc         → .enc 만 추적
*.key          → 무시 (평문 PEM)
!*.key.enc     → .key.enc 만 추적
```

그래서 순서가 중요하다 — **값을 고쳤으면 `env-encrypt.sh` 를 돌려 `.enc` 를 갱신한 뒤
커밋**한다. 평문 `.env` 는 어차피 커밋되지 않으니, `.enc` 를 다시 만들지 않으면 변경이
저장소에 안 올라간다.

---

CI/서버는 [`docker/node-builder`](../docker/node-builder/Dockerfile) 이미지에 sops·age 를
담아 두고, `SOPS_AGE_KEY`(또는 키 파일)로 서버키를 주입해 배포 시점에 복호화한다.

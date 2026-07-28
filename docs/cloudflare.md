# Cloudflare — 프론트 배포

정적 사이트(문서·웹)는 **Cloudflare Workers** 로 나간다(정적 자산만 담은 Worker). 예전처럼
빌드 결과를 public 레포로 밀어 GitHub Pages 에 태우지 않는다 — 그 우회는 hans-app 이 private 이라 필요했던 것이고, Cloudflare 는 소스 공개 여부와 무관하다.

> **Pages 가 아니라 Workers 인 이유.** Cloudflare 가 신규 정적 호스팅을 Workers 로 몰고
> 있다. 대시보드의 생성 경로에 Pages 가 아예 안 뜨는 계정이 있고, wrangler 도
> `pages project create` 를 안내하면서 "Workers 를 강력히 권한다" 고 덧붙인다.
> Pages 를 쓸 이유였던 브랜치별 preview 는 우리에게 필요가 없다 — 환경마다 배포 대상을
> 따로 두기 때문이다(아래 참고).

소스에 담기지 않는 **Cloudflare 쪽 설정**을 여기 모아 둔다. 저장소만으로는 재현되지 않는
것들이다.

---

## 어떻게 올라가는가

Cloudflare 가 레포를 직접 보게 하는 **Git 연동은 쓰지 않는다.** 빌드는 GitHub Actions 가
하고(툴체인이 CI 와 같아야 한다), 완성된 산출물만 wrangler 로 밀어 넣는다.

```
GitHub Actions: pnpm build → dist/
   └─ wrangler deploy --name=<Worker> --assets=dist   ← frontend/ci-deploy.sh
```

**사이트 하나가 환경마다 Worker 하나다.** 사이트 넷 × 환경 둘 = Worker 여덟이다.
`dev-hansapp-docs` 와 `prod-hansapp-docs` 는 "한 앱의 두 환경" 이 아니라 서로 완전히
독립된 Worker 다 — 배포 이력도 도메인도 각자 갖는다.

빌드도 배포도 전부 [`frontend/ci-deploy.sh`](../frontend/ci-deploy.sh) 안에 있다. 워크플로는
환경변수를 선언하고 그것을 부를 뿐이고, 로컬에서는 [`frontend/deploy.sh`](../frontend/deploy.sh) 가 같은
변수를 같은 규칙으로 채워 같은 스크립트를 부른다. 그래서 배포를 CI 에 태우지 않고 로컬에서
그대로 검증할 수 있고, 급할 때 로컬이 우회로가 아니라 정식 경로가 된다.

```bash
frontend/deploy.sh develop    hansapp-docs
frontend/deploy.sh production hansapp-docs
```

### 환경을 왜 Worker 로 가르는가

develop 도 **자기 커스텀 도메인이 있어야 하기 때문**이다. 공용 미리보기 도메인
(`*.workers.dev`·`*.pages.dev`)에 얹으면 두 가지가 깨진다.

- **쿠키 SSO.** 앱들이 `VITE_APP_ROOT_DOMAIN`(`plzhans.com`)에 쿠키를 심어 로그인을
  공유하는데, 미리보기 도메인은 public suffix 라 브라우저가 거기에 쿠키 심는 것을 거부한다.
  `.com` 에 쿠키를 못 심는 것과 같은 규칙이라 우회할 방법이 없다.
- **OAuth redirect URI.** origin 단위로 등록되어 있어 주소가 다르면 콜백이 막힌다.
  `VITE_SITE_URL=https://develop.medifinder.kr` 이 이미 빌드에 박혀 나간다.

커스텀 도메인을 미리보기 배포에 붙이는 방법은 없다(CNAME 을 걸어도 Cloudflare 가 그
hostname 을 등록된 것으로 알지 못해 서빙하지 못한다). 그래서 환경마다 배포 대상을 따로 둔다.

환경을 나누는 이 방식은 우회가 아니라 정공법이다 — wrangler 의 `--env` 기능도 내부적으로는
이름이 다른 Worker 를 따로 만든다. 우리는 설정 파일을 늘리지 않으려고 `--name` 을 직접 준다.

---

## 준비 — 한 번만 하면 된다

### ① Cloudflare API 토큰 발급

1. 대시보드 우측 상단 **프로필 → API 토큰**
   (바로가기: [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens))
2. **토큰 생성** 클릭
3. 맨 아래 **사용자 설정 토큰 생성 → 시작** — 템플릿 말고 이쪽이다.
4. 입력할 건 셋뿐이다.

   | 항목 | 값 |
   | --- | --- |
   | 토큰 이름 | 알아보기 쉽게. 예) `workers-deploy-ci` |
   | 권한 | `계정` · `Workers 스크립트` · **`편집`** — 이 한 줄만 추가한다 |
   | 계정 리소스 | `포함` → **본인 계정** 으로 한정 (권한 최소화) |

   **클라이언트 IP 주소 필터링**·**TTL** 은 비워 둔다. GitHub Actions 러너의 IP 는
   고정이 아니라 IP 로 묶으면 배포가 랜덤하게 죽고, TTL 은 만료일에 아무 예고 없이
   배포가 멈춘다.

5. **요약으로 계속 → 토큰 생성**
6. 생성된 토큰 문자열이 뜬다. **이때 딱 한 번만 보여준다.** 복사해서 잠깐 안전한 곳에
   둔다 — 놓치면 재발급해야 한다.

### ② Account ID 확인

대시보드에서 **Workers & Pages** 로 들어가면 우측(또는 계정 홈 URL
`dash.cloudflare.com/<여기가 Account ID>`)에 32자리 값이 있다. 비밀은 아니지만 배포에
반드시 필요하다.

### ③ Worker 만들기 — 사이트마다 × 환경마다 하나

**미리 만들 필요가 없다.** `wrangler deploy --name <이름>` 이 없으면 만든다. 첫 배포가 곧
생성이다. 이름은 스크립트가 규칙으로 유도한다.

| | 규칙 | 예 |
| --- | --- | --- |
| develop | `dev-<사이트>` | `dev-hansapp-docs` |
| production | `prod-<사이트>` | `prod-hansapp-docs` |

접두사를 쓰는 이유는 대시보드가 이름순으로 늘어놓기 때문이다. 접미사면 환경이 섞여 정렬돼
운영만 골라내려면 매번 눈으로 걸러야 한다.

다만 **첫 생성에는 의사표시가 필요하다.** 없는 이름에 그냥 배포되게 두면 이름을 잘못 준
배포가 조용히 "성공" 한다 — 엉뚱한 Worker 가 새로 생기고 정작 보고 있는 사이트는 안 바뀐다.

로컬에서는 물어본다.

```
· 'dev-hansapp-docs' Worker 가 계정에 없다. 처음 배포하는 것으로 보인다.
    환경 develop · 대상 frontend/hansapp-docs
  이 이름으로 새로 만들까? [y/N]
```

**CI 는 Worker 를 만들지 않는다.** 답할 사람이 없는 곳에서 조용히 만들면 오타 하나가 유령
Worker 를 만들고, 배포는 초록불인데 사이트는 그대로인 상태가 된다. CI 는 없으면 그냥 실패한다.

그래서 **새 프론트를 추가할 때는 로컬에서 한 번 만들고 CI 를 건다.** 순서가 규칙이다.

```bash
CF_ALLOW_CREATE=1 frontend/deploy.sh develop <새 프로젝트>
CF_ALLOW_CREATE=1 frontend/deploy.sh production <새 프로젝트>
```

만드는 건 프로젝트당 처음 한 번뿐이고, 그 뒤로는 "있는 것에만 배포된다" 가 보장된다.

커스텀 도메인은 Worker 의 **Settings → Domains & Routes** 에서 붙인다 (DNS 가 Cloudflare 에
있으면 클릭 몇 번으로 끝난다). 이것만은 1회성 수동 작업이다.

### ④ GitHub 에 등록

레포 **Settings → Secrets and variables → Actions**:

| 이름 | 종류 | 값 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | **Secret** | ①에서 받은 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | ②의 Account ID |

토큰은 계정 전체에 하나면 된다 — Worker 마다 따로 발급하지 않는다. 이름은 스크립트가 안다.

로컬에서 배포하려면 같은 값을 [`frontend/.env`](../frontend/.env.example) 에 둔다(gitignore).
`frontend/deploy.sh` 가 자기 디렉터리의 `.env` 를 읽는다.

> 토큰이 새면 **Cloudflare 대시보드에서 그 토큰만 Roll/Delete** 한다. 권한이 Workers
> Scripts Edit 하나로 묶여 있어 영향 범위도 거기까지다.

---

버전·태그를 만드는 릴리스 절차는 [release.md](release.md), 저장소 쪽 설정은
[github.md](github.md) 를 본다.

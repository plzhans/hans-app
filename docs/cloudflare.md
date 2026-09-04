# Cloudflare

프론트는 Cloudflare 에 **배포**되고, 백엔드는 Cloudflare 를 **거쳐 들어온다**. 성격이 다른
두 가지라 아래에서 나눠 적는다.

## 프론트 배포

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

### 도메인 이름 규칙

```
production   api.plzhans.com           auth.plzhans.com           console.plzhans.com
develop      develop-api.plzhans.com   develop-auth.plzhans.com   develop-console.plzhans.com
```

루트 `plzhans.com` 은 정적 랜딩 자리다. 콘솔(hansapp-web)은 `console.` 아래 산다 —
콘솔 안에 `/apps` 경로가 있어 `apps.` 는 겹치고, `app.` 은 제품 자체를 뜻해 실체와 어긋난다.
문서는 그대로 루트의 `/docs` 다.

**`develop` 을 줄이지 않는다.** `APP_ENV`·워크플로·스크립트 인자가 전부 `develop` 이라
도메인만 `dev` 로 두면 그것 하나가 예외가 된다.

**서비스가 붙을 때만 하이픈으로 잇는다.** `api.develop.plzhans.com` 처럼 점을 하나 더
쓰면 계층은 깔끔하지만 **와일드카드 인증서가 안 덮는다** — `*.plzhans.com` 은 점 하나만
커버한다. 한 단계로 눌러 두면 인증서 하나로 전부 덮인다.

medifinder 는 자기 도메인을 쓰되(`medifinder.kr`) 같은 규칙을 따른다. 다만 로그인 포털은
따로 두지 않고 `auth.plzhans.com` 을 함께 쓴다 — 쿠키 SSO 가 `plzhans.com` 기준이다.

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

# 백엔드 오리진

앞단에 **nginx 를 두지 않는다.** Cloudflare 가 바로 앞에 있고, 앱이 TLS 를 직접 끝낸다.

> nginx 가 하던 일(TLS 종단·ACME·HTTPS 리다이렉트·버퍼링·압축)이 CF 뒤에서는 거의 다
> 중복이다. 홉만 하나 늘고 얻는 게 없어서 뺐다. 한 호스트에 서비스를 여러 개 올릴 일이
> 생기면 그때 다시 판단한다 — 성능이 아니라 분배가 이유가 될 것이다.

인증서는 **Cloudflare Origin CA** 로 받는다.

**전제는 오리진에 오는 요청이 전부 Cloudflare 를 거친다는 것이다.** 도메인이 주황 구름
(프록시됨)이라 브라우저는 CF 하고만 TLS 를 맺고, 오리진에 직접 붙는 경로가 없다. 그러니
오리진 인증서를 브라우저가 신뢰할 이유가 없고, **CF 만 신뢰하면 충분하다.**

```
브라우저 ──TLS(CF 에지 인증서)──> Cloudflare ──TLS(Origin CA 인증서)──> 오리진
                                              ↑ 이 구간만 검증하면 된다
```

그래서 브라우저로 오리진 IP 에 직접 붙으면 신뢰 오류가 난다 — **정상이다.** 반대로 그
경로가 실제로 쓰인다면(회색 구름으로 두거나, 공인 IP 를 직접 호출하는 클라이언트가 있다면)
Origin CA 로는 감당할 수 없다. 그때는 공개 CA 인증서가 필요하다.

유효기간 15년이라 갱신 자동화가 필요 없다.

## ① 인증서 발급

대시보드(`SSL/TLS → 원본 서버 → 인증서 만들기`)에서도 받을 수 있지만, **여기서는
스크립트로 받는다.** [`backend/ssl-issue.sh`](../backend/ssl-issue.sh) 가 Cloudflare API
를 호출해 서명받고 결과를 알맞은 경로에 내려놓는다.

```bash
backend/ssl-issue.sh production api.plzhans.com
backend/ssl-issue.sh develop    develop-api.plzhans.com
backend/env-encrypt.sh                 # .enc 만 커밋된다
```

**대시보드가 아니라 스크립트인 이유는 개인키가 오가지 않게 하기 위해서다.**

| | 대시보드 | 스크립트 |
| --- | --- | --- |
| 개인키를 만드는 쪽 | **Cloudflare** | 이 머신 |
| 개인키 전송 | CF → 브라우저 화면 | **없음** (CSR 만 나간다) |
| 놓쳤을 때 | 한 번만 표시 → 재발급 | 파일로 남는다 |
| 파일 배치·권한 | 손으로 복붙 | `umask 077` 로 제자리에 |

스크립트는 개인키(ECDSA P-256)를 로컬에서 만들고 **CSR 만 보내 서명을 받아온다.**
개인키는 이 디렉터리 밖으로 나가지 않는다. 유효기간은 최대치인 15년(`5475`일)으로 받는다.

토큰은 `frontend/.env` 의 `CLOUDFLARE_API_TOKEN` 을 그대로 읽는다 — 같은 계정·같은 존이라
값을 두 군데 적어 두고 한쪽만 갱신해 어긋나는 쪽이 더 나쁘기 때문이다. 다만 프론트 배포용
권한만으로는 부족해서 **`Zone | SSL and Certificates | Edit`** 한 줄을 그 토큰에 추가해야
한다 (권한이 없으면 스크립트가 1016 과 함께 무엇을 어디서 고칠지 알려준다).

**환경마다 따로 발급한다.** `*.plzhans.com` 하나로 퉁치면 develop 과 production 이 같은
개인키를 공유해, 한쪽이 뚫리면 다른 쪽도 같이 뚫린다.

발급물은 `config/<환경>/ssl/{fullchain,privkey}.pem` 에 놓이고 jwt 키와 같은 경로로
배포된다 — sops 로 암호화해 `.enc` 만 커밋되고,
[`scripts/deploy/ci-deploy.sh`](../scripts/deploy/ci-deploy.sh) 가 풀어 서버에 올린다.

**호스트명이 늘어도 기존 인증서를 다시 받지 않는다.** 인증서는 리스너 단위라, 새 서비스가
생기면 그 호스트명으로 하나 더 발급하면 된다. 재발급이 필요한 경우는 **리스너 하나가
호스트명 여러 개를 받아야 할 때**뿐이고, 그때는 인자에 호스트명을 나열한다.

```bash
backend/ssl-issue.sh production api.plzhans.com api-v2.plzhans.com
```

## ② 컷오버 순서

**핵심: DNS 를 주황 구름으로 바꾸는 것이 유일한 스위치다.**

회색 구름인 동안에는 트래픽이 CF 를 지나지 않으므로 **암호화 모드도 원본 규칙도 아무
효과가 없다.** 그래서 대시보드 설정은 전부 미리 해두고, 마지막에 구름 하나만 바꾼다.
문제가 생기면 회색으로 되돌리면 즉시 원상복구다 — 되돌릴 것이 하나뿐이라는 게 이 순서의 이유다.

### 미리 해둔다 (회색 구름 — 아직 아무 일도 일어나지 않는다)

| | 위치 | 설정 |
| --- | --- | --- |
| 1. 암호화 모드 | `SSL/TLS → 개요 → [구성]` | 사용자 지정 → **Full (Strict)** |
| 2. 오리진 포트 | `규칙 → 개요 → [규칙 만들기] → 원본 규칙` | 아래 참고. **develop 만** |

**"자동 SSL/TLS" 를 고르지 않는다.** CF 가 오리진을 스캔해 모드를 정하는데, 배포 중
오리진이 잠깐 HTTP 로 뜨는 순간에 모드를 낮출 수 있다. 항상 Strict 여야 하므로 못 박는다.

**암호화 모드는 존 전체에 걸린다.** 다른 프록시된 레코드 중 평문 HTTP 오리진으로 도는
것이 있으면 같이 깨진다. 프론트는 Workers 라 CF 안에서 응답을 만들어 오리진 연결 자체가
없으므로 영향이 없다.

**오리진 포트 규칙은 기본 포트가 아닐 때만 만든다.**

> **443 으로 나르면 규칙이 필요 없다. 443 이 아닌 포트로 나를 때만 필요하다.**
>
> CF 는 규칙이 없으면 오리진 443 으로 붙는다. 그러니 443 을 쓰는 호스트에 "443 으로
> 가라" 는 규칙을 만드는 것은 아무것도 바꾸지 않으면서 관리할 것만 하나 늘리는 일이다.

develop 과 production 이 같은 서버에 떠서 443 을 하나만 쓸 수 있다.

**443 은 nginx 가 가져간다** — 관리자 콘솔(`admin*.plzhans.com`)만 받아 TLS 와 IP 제한을
하고 컨테이너로 넘긴다. 그래서 api 두 대는 기본 포트가 아닌 자리로 간다.
`production=7443 · develop=8443` 으로 뒤 세 자리를 맞춰, 어느 환경 것인지가 앞자리 하나로 갈린다.

> **원본 규칙의 포트는 CF 의 공개 포트 목록과 다른 이야기다.**
>
> 방문자가 CF 엣지에 붙을 수 있는 HTTPS 포트는 `443·2053·2083·2087·2096·8443` 로 정해져
> 있지만, **오리진 쪽 포트는 원본 규칙(대상 포트 재작성)으로 임의 값을 쓸 수 있다.**
> 사용자는 언제나 `https://api.plzhans.com`(443)으로 붙고, 그 뒤 CF→오리진 구간만 7443 이다.

| | 오리진 포트 | TLS 를 끝내는 곳 | 원본 규칙 |
| --- | --- | --- | --- |
| `admin.plzhans.com` | 443 (CF 기본값) | nginx | **불필요** |
| `develop-admin.plzhans.com` | 443 (CF 기본값) | nginx | **불필요** |
| `api.plzhans.com` | 7443 | 앱 (Origin CA) | 필요 |
| `develop-api.plzhans.com` | 8443 | 앱 (Origin CA) | 필요 |

> ⚠️ **api 의 규칙을 먼저 만들고 배포한다.** 규칙 없이 포트를 옮기면 CF 가 443 으로 붙는데
> 거기엔 nginx 가 앉아 있어, api 요청이 관리자 콘솔로 가거나 502 가 된다.

```
일치 조건   ● 사용자 지정 필터 식      ← "모든 수신 요청" 을 고르면 존 전체가 8443 으로 간다
   필드     호스트 이름 · 같음 · develop-api.plzhans.com
작업        대상 포트 재작성 → 8443
```

**규칙 = 포트 하나**로 보면 된다. 같은 포트를 쓰는 호스트가 여럿이면 조건을 `이 안에
있음(in)` 으로 묶어 한 규칙에 담을 수 있고, 포트가 갈리면 포트 수만큼 규칙이 필요하다.

### 오리진을 준비한다

| | |
| --- | --- |
| 3. 인증서 경로 | `config.<환경>.yaml` 에 기입 (③ 참고) |
| 4. 포트 공개 | `infra/<환경>/docker-compose.yml` 의 `127.0.0.1:` 제거 |
| 5. **클라우드 방화벽** | OCI 보안목록에 `443`(nginx·admin)·`7443`(api production)·`8443`(api develop) 인그레스 추가 |
| 6. 배포 | `scripts/deploy/deploy.sh <환경> <태그>` |

5번을 빠뜨리기 쉽다. 서버 안에서는 리스닝 중인데 밖에서는 닫혀 있어, CF 가 붙지 못하고
522 만 뜬다. `ss -lntp` 로는 정상으로 보이므로 **반드시 밖에서 확인한다.**

```bash
# 오리진이 밖에서 HTTPS 로 응답하는지 — 구름을 바꾸기 전에 여기서 확인한다
echo | openssl s_client -connect <공인IP>:443 -servername api.plzhans.com 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName
```

발급한 Origin CA 인증서의 SAN 이 그대로 나오면 준비가 끝난 것이다.

### 컷오버

| | 위치 | 설정 |
| --- | --- | --- |
| 7. DNS | `DNS → 레코드` | `api`·`develop-api` → 서버 공인 IP, **프록시됨**(주황 구름) |

회색 구름이면 CF 를 안 거치고 브라우저가 오리진에 직접 붙어, CF 만 신뢰하는 Origin CA
인증서가 신뢰 오류를 낸다. 그래서 **포트를 여는 것과 구름을 바꾸는 것은 붙여서 한다** —
그 사이가 벌어질수록 오리진이 인증서를 그대로 노출한 채 열려 있는 시간이 길어진다.

### 그 다음 (선택 — 한 번에 하나씩)

- `SSL/TLS → 원본 서버` 의 **Authenticated Origin Pulls**. 오리진이 CF 클라이언트
  인증서를 검사해, 공인 IP 를 알아내도 직접 붙지 못한다. 방화벽으로 CF 대역만 여는 것과
  같은 효과인데 IP 목록을 관리하지 않아도 된다.
- `SSL/TLS → 개요` 의 **자동 키 교환**. 새 TLS 연결마다 왕복 한 번을 아낀다. CF 는
  오리진 연결을 재사용하므로 이득이 작다. **컷오버가 끝난 뒤 따로 켠다** — 같이 켜면
  문제가 생겼을 때 원인이 인증서인지 이 설정인지 구분되지 않는다.

## ③ 앱 쪽

인증서 경로 두 줄이 전부다. **둘 다 있으면 HTTPS, 둘 다 비면 HTTP** 로 뜬다.

```yaml
# config/config.<환경>.yaml
apps-api:
  web:
    sslCertificate: ${SSL_CERTIFICATE:-config/production/ssl/fullchain.pem}
    sslCertificateKey: ${SSL_CERTIFICATE_KEY:-config/production/ssl/privkey.pem}
```

이름은 nginx 의 `ssl_certificate` / `ssl_certificate_key` 와 맞췄다. 켜고 끄는 플래그를
따로 두지 않는 이유는 플래그와 경로가 어긋난 상태를 아예 만들지 않기 위해서다 — 한쪽만
설정되어 있으면 부팅을 거부한다(조용히 평문으로 뜨는 것이 최악이다).

앞단이 TLS 를 끝내는 구성(nginx·cloudflared tunnel·LB)으로 갈아탈 때는 **두 줄을 비우면
되고 코드는 바뀌지 않는다.**

---

버전·태그를 만드는 릴리스 절차는 [release.md](release.md), 저장소 쪽 설정은
[github.md](github.md), 비밀 파일 암복호화는 [sops.md](sops.md) 를 본다.

# 백엔드 배포

## 한 줄 요약

**버전이 붙는 것은 이미지뿐이다.** 배포 스크립트·compose·설정은 항상 main 것을 쓴다.

```
이미지          v0.5.0        고정 — 이것이 "무엇을 배포했나"
ci-deploy.sh    main 최신     배포 도구. 릴리스의 일부가 아니다
compose·config  main 최신     서버와 이미지 사이의 계약
```

배포 도구를 릴리스에 묶으면 나중에 고친 버그가 옛 태그에서 되살아난다. 도구는 계속
나아지는 물건이라 고정할 이유가 없다. 설정이 이미지와 어긋날 위험은 **같은 이미지를
develop 에 먼저 올려보는 것**으로 막는다.

> 그래서 CI 에서 실행 ref 를 고를 일이 없다. 항상 main 이고, 바꾸는 것은 `image_tag` 뿐이다.

---

## develop

### 자동 — 커밋 메시지에 `#deploy`

```bash
git commit -m "fix: 검색 정렬을 고친다 #deploy"
git push
```

```
be · docker image   →  굽는다      (#deploy 없으면 여기서 스킵)
      ↓
be · deploy         →  올린다      (develop 만 자동으로 이어진다)
```

**opt-out 이 아니라 opt-in 이다.** develop 은 같이 쓰는 서버라, 협업하려고 아직 완성되지
않은 코드를 main 에 먼저 합치는 일이 있다. 합쳤다는 이유만으로 공용 서버가 바뀌면 안 된다.
빠뜨렸을 때의 대가도 다르다 — opt-in 을 잊으면 배포가 안 될 뿐이지만, opt-out 을 잊으면
남들이 쓰는 서버가 깨진다.

### 수동

```
Actions → be · deploy → Run workflow
  environment  develop     (기본값)
  image_tag    develop     (기본값)
```

폼에 이미 채워져 있어 Run 만 누르면 된다. 로컬도 같다.

```bash
backend/deploy.sh develop            # 태그 생략 = develop
backend/deploy.sh develop v0.5.0     # 릴리스 후보를 먼저 검증할 때
```

---

## production

### ① 이미지는 릴리스가 만든다

```
릴리스 PR 병합
  → release        태그 release-backend/v0.5.0 · CHANGELOG
  → verify-backend v0.5.0 이미지를 구워 GHCR 에 올림
```

**여기서 배포하지 않는다.** 릴리스는 "이 버전이 배포 가능하다" 는 보장까지만 만든다.
배포일에 가서야 "이 버전 빌드 안 되네" 를 아는 것은 늦으므로, 굽는 것은 릴리스 시점에
끝내 둔다. 배포는 당기기만 하므로 배포일에 다시 구울 일이 없다 — 확인한 것과 올린 것이
같은 빌드다.

### ② 배포는 배포일에 사람이 누른다

```
Actions → be · deploy → Run workflow
  environment  production
  image_tag    v0.5.0        ← 반드시 적는다
```

```bash
backend/deploy.sh production v0.5.0
```

**`image_tag` 생략을 막아 두었다.** 기본값으로 올라가면 서버에 무엇이 떠 있는지 아무도
답할 수 없게 되고, 되돌릴 이전 태그도 남지 않는다. 손이 한 번 더 가는 대신 무엇을
올리는지가 화면에도 서버 `.env` 에도 남는다.

### 롤백

같은 자리에서 태그만 바꾼다. 재빌드가 없다.

```bash
backend/deploy.sh production v0.4.0
```

---

## 이미지를 직접 굽기

평소에는 CI 가 굽는다. 급할 때만 쓴다 — 커밋 없이 지금 작업 트리를 그대로 굽는다.

```bash
backend/build.sh develop                 # 둘 다
backend/build.sh develop hansapp-api     # 하나만
```

푸시에는 `write:packages` 가 필요하다.

```bash
gh auth refresh -h github.com -s write:packages
```

**작업 트리가 더러우면 `<환경>-<sha>` 태그를 붙이지 않는다.** 그 이름은 "이 이미지는 그
커밋이다" 라는 약속인데, 커밋 안 한 변경이 섞이면 거짓이 된다. 움직이는 태그만 올린다.

---

## 배포가 실제로 하는 일

```
연결 확인          WireGuard(CI 만) · SSH
compose 전송       infra/<환경>/docker-compose.yml
설정 · 시크릿      .enc 를 배포하는 쪽에서 풀어 서버로. yaml 도 같이
GHCR 로그인        배포 직전에만. 끝나면 지운다
pull · up          .env 에 IMAGE_TAG 를 쓰고 compose 가 당겨 띄운다
```

서버에는 이렇게 남는다.

```
~/app/hansapp-<환경>/
  .env                      IMAGE_TAG=v0.5.0     ← 지금 무엇이 떠 있나
  docker-compose.yml
  config/
    config.<환경>.yaml      644  배포 계정        컨테이너가 직접 읽는다
    .env.<환경>             600  배포 계정        도커가 읽어 주입한다(env_file)
    <환경>/                 600  컨테이너 uid     jwt · TLS 키
```

세 파일이 각자 다른 이유로 다른 권한을 갖는다. 하나로 맞추려 하면 어느 한쪽이 못 읽는다.

---

## 컨테이너 안

**이미지는 자기가 어느 환경인지 모른다.** 환경별 파일을 환경 이름 없는 자리에 마운트한다.

```
/app/
  hansapp-api/dist/main.js     이름이 남아 있어 컨테이너 안에서 자기가 뭔지 보인다
  config/
    config.yaml                ← config.<환경>.yaml
    secrets/                   ← config/<환경>/
```

`APP_ENV` 는 `.env` 에 들어 있고 도커가 환경변수로 주입한다. compose 가 따로 넘기지 않는다.

**기본값이 없어 빠뜨리면 부팅을 거부한다.** Redis 키 네임스페이스와 Elasticsearch 인덱스
별칭이 이 값에서 파생되는데(둘 다 환경들이 한 대를 공유한다), 잘못 떨어지면 엉뚱한 환경의
데이터를 건드린다. 안 뜨는 편이 조용히 잘못된 곳에 쓰는 것보다 낫다.

---

오리진 TLS·Cloudflare 설정은 [cloudflare.md](cloudflare.md), 릴리스 절차는
[release.md](release.md), 비밀 파일 암복호화는 [sops.md](sops.md) 를 본다.

# develop 파이프라인 개편 직전 스냅샷 (2026-08-02)

`refactor/ci-develop-pipeline` 작업 기준 커밋: `769f6ae`

**여기 있는 것은 전부 "없어지거나 바뀌는 것" 이다.** 그대로 남는 파일은 담지 않는다 —
담아 두면 "백업된 것 = 지워질 것" 이 깨져서, 나중에 이 디렉터리를 보고 무엇을 정리해도
되는지 판단할 수 없게 된다.

```
deleted/    .github/workflows/ 에서 삭제됨. main.yml 로 흡수
modified/   수정 전 원본. 파일은 그대로 살아 있다
```

## 무엇이 바뀌었나

| | 이전 (여기) | 이후 |
|---|---|---|
| develop 진입점 | `be.yml` · `fe.yml` · `fe-deploy-develop.yml` 3개 | `main.yml` 1개 |
| 백엔드 배포 | `ci-deploy.sh` 420줄 한 덩어리 | `stage/*.sh` 단계별 분리 |
| 마이그레이션 | `ci-migrate.sh` 234줄 (접속·복호화를 `ci-deploy.sh` 와 중복) | `stage/db-migrate.sh` |
| 관문 | 없음 (environment 는 선언만, 보호 규칙 미설정) | `develop-deploy` 환경 1개 |
| 앱 교체 | `up -d` (설정만 바뀌면 재기동 안 됨) | `app-stop` → `db-migrate` → `app-start` |
| 프론트 산출물 | verify 와 deploy 가 **각자 빌드** | 한 번 빌드해 아티팩트로 넘김 |

## 여기 없는 것

- **`ci-deploy.sh` · `ci-migrate.sh`** — `be-deploy-production.yml` 이 아직 쓴다.
  운영 이관은 별도 작업이고, 그때 지우면서 여기 담는다
- 나머지 워크플로 7개 — 손대지 않았다

## 이 디렉터리의 지위

**참고용이다. 여기서 복원하거나 재사용하지 않는다.**

진짜 이력은 git 에 있다 — `git show 769f6ae:.github/workflows/be.yml`.
새 구조가 develop 에서 검증되고 운영까지 이관되면 **통째로 지운다.**

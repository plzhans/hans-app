# GitHub 저장소 설정

소스에 담기지 않는 **저장소 쪽 설정**을 주제별로 정리한다. 클론·포크·이전 어디서든
소스만으로는 재현되지 않아서, 여기 없으면 "왜 안 되지" 로 시간을 쓰는 것들이다.

---

## Bot 으로 Release PR 자동화하기

`.github/workflows/release.yml` 의 release-please 봇이 커밋 메시지를 읽어 버전을 매긴다.
`main` 에 `feat:`/`fix:` 가 쌓이면 **Release PR** 을 열고, 그 PR 을 머지하면 버전·CHANGELOG·
`release/vX.Y.Z` 태그·GitHub 릴리스를 만든다. (규약은 [DEVELOP.md](../DEVELOP.md) 참고.)

이 봇은 기본 `GITHUB_TOKEN` 으로 동작하는데, 저장소 기본 권한으로는 PR 도 태그도 못 만든다.
아래 권한을 켜야 한다.

### Actions Workflow 권한 설정

**Settings → Actions → General → Workflow permissions**

| 설정 | 기본값 | 바꿀 값 | 왜 |
| --- | --- | --- | --- |
| Read and write permissions | read | **write** | 봇이 버전·CHANGELOG 커밋과 태그·릴리스를 푸시한다 |
| Allow GitHub Actions to create and approve pull requests | 꺼짐 | **켬** | 봇이 Release PR 을 연다 |

안 켜면 워크플로가 이렇게 실패한다.

```
GitHub Actions is not permitted to create or approve pull requests
```

CLI 로도 켤 수 있다(`repo` 스코프 토큰 필요).

```bash
# 켜기
gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow \
  -F default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true

# 확인
gh api repos/<owner>/<repo>/actions/permissions/workflow
# → {"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}
```

### PAT 대신 GITHUB_TOKEN 을 쓴다

개인 토큰(PAT)을 워크플로에 주면 위 설정 없이도 되지만, 만료 없는 자격증명을 저장소에
상주시키는 셈이다. 기본 `GITHUB_TOKEN` 은 권한이 실행 단위로만 살아 있어 더 안전하다 —
대신 위 워크플로 권한을 저장소마다 켜 줘야 한다.

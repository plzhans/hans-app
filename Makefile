# 레포 루트. CI 가 하는 일을 로컬에서 그대로 돌리기 위한 진입점.
#
# 빌드 로직은 scripts/ci/*.sh 에만 있다. CI 워크플로우도 여기 make 타겟도
# 그 스크립트를 호출만 한다. 그래서 "CI 에서만 깨진다" 는 상황이 생기지 않는다.
#
# backend 개발용 명령(dev, db-up 등)은 backend/Makefile 에 있다.

.DEFAULT_GOAL := help
.PHONY: help ci-build-backend ci-shell

help: ## 사용 가능한 명령 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

ci-build-backend: ## backend 를 CI 와 같은 컨테이너에서 빌드 (CI 재현)
	@scripts/ci/run-in-builder.sh ./scripts/ci/build-backend.sh

ci-shell: ## CI 와 같은 컨테이너 안에서 셸 열기 (디버깅)
	@scripts/ci/run-in-builder.sh bash

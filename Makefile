# 레포 루트. CI 가 하는 일을 로컬에서 그대로 돌리기 위한 진입점.
#
# 빌드 로직은 scripts/ci/*.sh 에만 있다. CI 워크플로우도 여기 make 타겟도
# 그 스크립트를 호출만 한다. 그래서 "CI 에서만 깨진다" 는 상황이 생기지 않는다.
#
# backend 개발용 명령(dev, db-up 등)은 backend/Makefile 에 있다.

.DEFAULT_GOAL := help
.PHONY: help ci-build-backend ci-build-front ci-shell

# 프론트는 각자 독립 프로젝트다(각자 lockfile). 그래서 어느 것을 빌드할지 지정해야 한다.
# APP 은 frontend/ 아래의 디렉터리 이름 그대로다.
#   make ci-build-front APP=clinicfinder-web ENV=production
#   make ci-build-front APP=hansapi-docs
APP ?=
ENV ?= develop

help: ## 사용 가능한 명령 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

ci-build-backend: ## backend 를 CI 와 같은 컨테이너에서 빌드 (CI 재현)
	@scripts/ci/run-in-builder.sh ./scripts/ci/build-backend.sh

ci-build-front: ## 프론트를 CI 와 같은 컨테이너에서 빌드 (APP=<frontend 디렉터리명> [ENV=develop|staging|production])
	@test -n "$(APP)" || { \
		echo "APP 을 지정할 것. 예: make ci-build-front APP=clinicfinder-web ENV=develop"; \
		echo "현재 있는 것:"; ls -1 frontend; \
		exit 2; \
	}
	@scripts/ci/run-in-builder.sh ./scripts/ci/build-frontend.sh $(APP) $(ENV)

ci-shell: ## CI 와 같은 컨테이너 안에서 셸 열기 (디버깅)
	@scripts/ci/run-in-builder.sh bash

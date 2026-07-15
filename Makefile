# 레포 루트. CI 가 하는 일을 로컬에서 그대로 돌리기 위한 진입점.
#
# 빌드 로직은 스크립트에만 있다. CI 워크플로우도 여기 make 타겟도 그 스크립트를 호출만 한다.
# 그래서 "CI 에서만 깨진다" 는 상황이 생기지 않는다.
#
#   backend 전용   backend/scripts/{build,deploy-backend,deploy,version}.sh
#   공용           scripts/ci/{run-in-builder,build-frontend,deploy-docs}.sh
#
# backend 는 Makefile 이 없다. 전부 pnpm 스크립트다 — `cd backend && pnpm run` 으로 목록을 본다.
# (VSCode 워크스페이스에서 backend 가 루트로 열리므로 NPM Scripts 패널에 그대로 뜬다)

.DEFAULT_GOAL := help
.PHONY: help ci-build-front ci-shell

# **backend 빌드는 여기 없다. backend 의 pnpm 스크립트다.**
#
#   cd backend && pnpm ci:build          # 빌드·린트·테스트 (전부)
#   cd backend && pnpm ci:build api      # 그 앱 + 의존 패키지만
#   cd backend && pnpm ci:bundle         # 위 + 배포 번들 (CI 와 같은 컨테이너)
#
# 프론트는 각자 독립 프로젝트라(각자 lockfile) 어느 것인지 말하지 않으면 고를 수가 없다.
# APP 은 frontend/ 아래 디렉터리 이름 그대로다.
#   make ci-build-front APP=clinicfinder-web ENV=production
#   make ci-build-front APP=hansapi-docs
APP ?=
ENV ?= develop

help: ## 사용 가능한 명령 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "  backend 는 pnpm 이다:  cd backend && pnpm ci:build [api]"

ci-build-front: ## 프론트를 CI 와 같은 컨테이너에서 빌드 (APP=<frontend 디렉터리명> [ENV=develop|staging|production])
	@test -n "$(APP)" || { \
		echo "APP 을 지정할 것. 예: make ci-build-front APP=clinicfinder-web ENV=develop"; \
		echo "현재 있는 것:"; ls -1 frontend; \
		exit 2; \
	}
	@scripts/ci/run-in-builder.sh ./scripts/ci/build-frontend.sh $(APP) $(ENV)

ci-shell: ## CI 와 같은 컨테이너 안에서 셸 열기 (디버깅)
	@scripts/ci/run-in-builder.sh bash

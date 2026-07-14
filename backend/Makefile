# backend 자주 쓰는 명령 모음
# 사용법: backend 폴더에서 `make <타겟>` (예: make dev)
# 그냥 `make` 만 치면 아래 목록이 나옵니다.

.DEFAULT_GOAL := help
.PHONY: help install dev build lint format check clean reinstall \
        db-up db-down db-logs db-cli db-reset

help: ## 사용 가능한 명령 목록
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## 의존성 설치 (pnpm install)
	pnpm install

reinstall: ## node_modules 지우고 깨끗하게 재설치
	rm -rf node_modules && pnpm install

dev: ## 서버 개발 모드 실행 (watch)
	pnpm dev:server

build: ## 전체 워크스페이스 빌드
	pnpm build

lint: ## eslint 자동 수정
	pnpm lint

format: ## prettier 전체 포맷
	pnpm format

check: ## 검사만 (수정 없이 lint + format 확인)
	pnpm exec eslint "{apps,packages}/*/src/**/*.ts"
	pnpm exec prettier --check "{apps,packages}/*/**/*.{ts,js,json}"

clean: ## 빌드 산출물/모듈 정리
	rm -rf node_modules apps/*/dist packages/*/dist

# --- 로컬 도커 MySQL (docker-compose.yml, 이미지는 ../docker/mysql9) ---

db-up: ## 로컬 MySQL 기동 (준비될 때까지 대기)
	docker compose up -d --wait

db-down: ## 로컬 MySQL 중지 (데이터는 유지)
	docker compose down

db-logs: ## 로컬 MySQL 로그 따라가기
	docker compose logs -f hansapi-db

db-migrate: ## 로컬 MySQL 에 마이그레이션 적용 (APP_ENV=local)
	APP_ENV=local pnpm --filter @hansapi/data prisma:migrate:deploy

db-cli: ## 로컬 MySQL 에 mysql 클라이언트로 접속
	docker compose exec hansapi-db mysql -ulocal_hansapi -p'local_hansapi' local_hansapi

db-reset: ## 로컬 MySQL 볼륨까지 지우고 초기화 SQL 부터 다시 (데이터 전부 삭제)
	docker compose down -v
	docker compose up -d --wait

#!/bin/bash
# 메인 DB 외에 로그·shadow DB 를 추가로 만든다.
#
# 메인 DB(MYSQL_DATABASE)와 앱 계정(MYSQL_USER/MYSQL_PASSWORD)은 mysql 이미지가 이미 만들어 뒀다.
# 다만 그 변수들은 DB 를 하나밖에 못 받는다. 나머지 두 개는 여기서 만들고 같은 계정에 권한을 준다.
# 접속 정보를 여기 적지 않는 이유가 이것이다. 출처는 docker-compose.yml 한 곳이어야 한다.
#
# docker-compose.yml 이 이 디렉토리를 /docker-entrypoint-initdb.d 로 마운트한다.
# (이미지(docker/mysql9)는 MySQL 9 + 서버 공통 설정까지만 담당한다. 스택별 DB 생성은 여기 몫이다)
# datadir 이 비어 있을 때 한 번만 실행된다. 고쳤으면 `make db-reset` 으로 볼륨을 지워야 반영된다.
set -euo pipefail

log_db="${MYSQL_DATABASE}_log"
shadow_db="${MYSQL_DATABASE}_shadow"

# 아래 계정에 전역 CREATE 권한을 주지 않는다. 공유 개발 DB 계정도 그렇기 때문이다.
# 그래서 Prisma 가 shadow DB 를 스스로 만들지 못한다. 미리 만들어 두는 이유가 이것이다.
# 같은 제약을 로컬에서도 재현해야 "로컬에선 되는데 개발 DB 에선 권한이 없어 실패하는" 마이그레이션이 안 나온다.
mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-SQL
	-- 로그 DB. 보존기간·관리 주기가 달라 메인과 분리돼 있다(개발/운영과 같은 구조).
	CREATE DATABASE IF NOT EXISTS \`${log_db}\`
	  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

	-- prisma migrate dev 전용 shadow DB.
	-- migrate 를 돌릴 때마다 Prisma 가 통째로 비운다. 실제 데이터를 넣지 말 것.
	CREATE DATABASE IF NOT EXISTS \`${shadow_db}\`
	  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

	GRANT ALL PRIVILEGES ON \`${log_db}\`.*    TO '${MYSQL_USER}'@'%';
	GRANT ALL PRIVILEGES ON \`${shadow_db}\`.* TO '${MYSQL_USER}'@'%';
	FLUSH PRIVILEGES;
SQL

echo "[initdb] 추가 DB 생성 완료: ${log_db}, ${shadow_db}"

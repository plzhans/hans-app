# MySQL 9 베이스 이미지.
#
# 이 이미지가 갖는 건 "어떤 MySQL 9 이냐" 뿐이다. 즉 버전 고정 + 서버 공통 설정(conf.d).
# 특정 프로젝트의 DB·계정 생성(initdb) 은 여기 넣지 않는다. 그건 스택마다 다르므로
# docker-entrypoint-initdb.d 는 각 docker-compose 에서 마운트해 쓴다.
#
# 버전은 공유 개발 DB(Oracle MySQL HeatWave)에 맞췄다.
# 실제로 붙어서 확인한 값이 9.7.1-cloud 라 공식 이미지의 같은 패치버전으로 고정한다.
# HeatWave 의 분석 엔진까지 재현하지는 못한다. 맞추는 건 InnoDB 쪽 동작이다.
# 버전을 올릴 때는 실제 DB 의 `SELECT @@version` 을 먼저 확인하고 맞출 것.
ARG MYSQL_VERSION=9.7.1

FROM mysql:${MYSQL_VERSION}

# 서버 공통 설정(문자셋 / sql_mode / 시간대 등). 엔트리포인트가 /etc/mysql/conf.d/*.cnf 를 읽는다.
# world-writable 이면 MySQL 이 무시하므로 권한을 644 로 못박는다.
COPY --chmod=644 conf.d/ /etc/mysql/conf.d/

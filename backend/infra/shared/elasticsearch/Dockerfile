# Elasticsearch 9 이미지 (develop) — 다국어 형태소 검색용.
#
# 이 이미지가 갖는 건 "어떤 엘라스틱서치 버전 + 어떤 다국어 형태소 플러그인" 뿐이다.
# 인덱스/매핑/계정 같은 스택별 설정은 여기 넣지 않는다. 그건 옆의 docker-compose 에서
# 환경변수·마운트로 준다.
#
# 플러그인은 엘라스틱서치 버전과 정확히 일치해야 로딩된다. 버전이 어긋나면 부팅이 실패한다.
# 그래서 버전을 ARG 로 못박고, FROM 태그만 바꿔 재빌드하면 플러그인이 그 버전으로
# 자동 재설치되게 한다. (설치형과 달리 버전 불일치 사고가 구조적으로 안 남는 이유)
ARG ELASTICSEARCH_VERSION=9.3.1

FROM docker.elastic.co/elasticsearch/elasticsearch:${ELASTICSEARCH_VERSION}

# 다국어 형태소 / 정규화 플러그인.
#   analysis-nori     : 한국어 형태소
#   analysis-kuromoji : 일본어 형태소
#   analysis-smartcn  : 중국어(SmartCN) 형태소
#   analysis-icu      : 유니코드 정규화·folding (다국어 공통 기본기, 언어 안 가림)
#
# --batch : 설치 중 보안 권한 프롬프트를 자동 승인. 없으면 빌드가 멈춘다.
# 한 RUN 에 묶어 레이어를 최소화한다. 모두 ARM64(aarch64) 정식 지원.
RUN elasticsearch-plugin install --batch \
      analysis-nori \
      analysis-kuromoji \
      analysis-smartcn \
      analysis-icu

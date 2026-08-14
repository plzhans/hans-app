-- DropTable
--
-- Swagger 문서 접근 IP 허용목록을 걷어낸다.
--
-- 이 테이블은 **운영에서도 API 문서를 열어두기 위해** 있었다. 열어두되 등록된 IP 만
-- 통과시키는 구조였고, 그래서 목록이 배포와 다른 주기로 바뀌어야 해 DB 에 있었다.
--
-- 이제 운영에서는 문서를 아예 열지 않는다(config.production.yaml 의 apps-api.swagger
-- 항목 제거 → 기본값 false). 열지 않으면 잠글 것도 없으므로 판정 장치 일체와 함께 지운다.
--
-- 같이 사라진 것: swagger-access.middleware.ts, SwaggerAccessService, ip-match.ts,
-- EnvSwaggerAllowedIpRepository, apps-api.swagger.ipRestricted 설정.

DROP TABLE IF EXISTS `env_swagger_allowed_ip`;

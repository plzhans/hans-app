# @hansapp/data

Prisma 스키마와 DB 접근을 담당한다. 스키마·커넥션 세부는 이 패키지 밖으로 새지 않는다.

## 마이그레이션

```bash
pnpm prisma:migrate:dev      # 스키마 변경 → 마이그레이션 생성 + 적용 (개발)
pnpm prisma:migrate:deploy   # 미적용 마이그레이션 적용 (배포)
pnpm prisma:migrate:status   # 적용 상태 확인
```

### shadow database

DB 계정(`dev_hansapp`)에 `CREATE DATABASE` 권한이 없다. `prisma migrate dev` 는 마이그레이션 SQL 을
만들 때 임시 DB 를 새로 생성해 기존 마이그레이션을 재생·비교하는데, 그 생성이 막혀 `P3014` 로 실패한다.

그래서 **미리 만들어 둔 `dev_hansapp_shadow` DB 를 재사용**한다. DB 가 이미 존재하므로
`CREATE DATABASE` 권한이 필요 없고, 그 안에서 테이블만 만들었다 지운다.

```prisma
datasource db {
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")   // dev_hansapp_shadow
}
```

**shadow DB 는 `migrate dev` 를 돌릴 때마다 Prisma 가 통째로 비운다. 실제 데이터를 절대 넣지 말 것.**

새 환경에 세팅할 때는 권한 있는 계정으로 아래를 한 번 실행한다.

```sql
CREATE DATABASE dev_hansapp_shadow;
GRANT ALL PRIVILEGES ON `dev_hansapp_shadow`.* TO `dev_hansapp`@`%`;
```

## 미러 테이블

`nmc_hospital`, `hira_hospital` 은 공공데이터포털 API 응답을 **JSON 그대로** 보관한다.

필드가 100개 가까이 되고 제공기관이 예고 없이 바꾸기도 해서 컬럼으로 펼치지 않는다.
PK 는 각 기관의 자연키(`hpid` / `ykiho`)를 그대로 쓴다. 재적재는 upsert 다.

적재는 `hansapp-cli` 의 `nmc hospital sync` / `hira hospital sync` 가 담당한다.

검색이 필요한 필드는 **generated column + 인덱스**로 뽑아 쓸 예정이며 아직 만들지 않았다.

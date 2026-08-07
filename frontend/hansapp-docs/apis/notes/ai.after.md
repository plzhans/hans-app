## MCP {#mcp}

**Model Context Protocol — Streamable HTTP** 기반입니다.
인증만 우리 것이고(서비스 키), 나머지는 규약 그대로입니다.

**도메인마다 엔드포인트가 하나**입니다. 도구를 한 서버에 몰지 않는 이유는 도구 스키마가
매 턴 모델 컨텍스트에 실리기 때문입니다 — 쓰지 않는 도메인의 도구까지 짊어지지 않습니다.

| 엔드포인트 | 도메인 | 도구 |
| --- | --- | --- |
| `https://api.plzhans.com/mcp/healthcare` | 헬스케어 | `search_hospitals` · `get_hospital` · `list_medical_codes` |

### 공통

| | |
| --- | --- |
| **인증** | 서비스 키 (`Authorization: Bearer sk_...`) |
| **호출 한도** | 엔드포인트당 60초에 60회 |
| **언어** | 모든 도구가 `lang` 인자를 받습니다 (`ko` `en` `ja` `zh`, 기본 `ko`) |

코드 값은 도구 스키마에 `enum` 으로 실려 나갑니다 — 없는 코드는 클라이언트 단에서 걸립니다.

::: warning 서비스 키로 붙습니다
MCP 클라이언트는 브라우저가 아니라 사용자 PC 에서 도는 프로그램이라 오리진 검사를 받지
않습니다. 그래서 `X-Client-Id` 가 아니라 서비스 키를 씁니다 —
키를 나눠 주는 것은 곧 호출 권한을 주는 것이니 배포용 키와 나눠 쓰세요.
:::

### `/mcp/healthcare`

#### `search_hospitals`

지역·진료과목·평가등급·응급실 여부로 검색합니다. **한 번에 최대 8건**입니다.

| 인자 | 타입 | 설명 |
| --- | --- | --- |
| `subjectCds` | `string[]` (최대 5) | 진료과목 코드. **신고 기준**이라 전문의 보유와는 다릅니다 |
| `specialistCds` | `string[]` (최대 5) | 그 과목 **전문의를 보유한** 병원만 |
| `asmItemCds` | `string[]` (최대 3) | 적정성평가 항목. 그 항목 **1등급**만 걸립니다 |
| `specialtyCds` | `string[]` (최대 3) | 보건복지부 지정 전문병원 분야 |
| `tiers` | `string[]` | 병원 등급. 비우면 요양병원·정신병원이 빠집니다 |
| `regionCd` | `string` | 시도 또는 시군구 코드. 시도를 주면 하위 전체로 넓힙니다 |
| `name` | `string` | 병원 이름(부분 일치) |
| `emergency` · `baby` | `boolean` | 응급실 운영 / 달빛어린이병원만 |

#### `get_hospital`

병원 상세 — 진료시간·장비·병상·전문의 수·평가등급.

| 인자 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `number` | `search_hospitals` 결과의 `id` |

없는 id 는 오류가 아니라 `{ "found": false }` 로 옵니다.

#### `list_medical_codes`

검색에 쓰는 코드의 뜻.

| 인자 | 타입 | 설명 |
| --- | --- | --- |
| `type` | `subject` `assessment` `specialty` `tier` | 진료과목 · 적정성평가 · 전문병원 분야 · 병원 등급 |

::: warning 적정성평가 1등급은 항목마다 뜻이 다릅니다
주사제 처방률 1등급은 "주사를 적게 놓는다" 는 뜻입니다.
`asmItemCds` 를 쓰기 전에 항목의 의미를 확인하세요.
:::

### 더 읽을거리

- [Model Context Protocol](https://modelcontextprotocol.io) — 규약 명세
- [Claude — 커넥터 연결](https://claude.com/docs/connectors/building)
- [OpenAI — MCP](https://developers.openai.com/api/docs/mcp/)

자연어로 물으면 **무엇을 할지와 검색 조건**을 돌려주는 API 와, **MCP 엔드포인트**를 제공합니다.

| | |
| --- | --- |
| **AI 검색** | `POST /healthcare/ai-search` — 질문 → 실행할 툴 + 검색 조건 |
| **사용량 · 모델** | `GET /ai/capabilities` — 남은 몫과 고를 수 있는 모델 |
| [**MCP**](#mcp) | `POST /mcp/healthcare` — 병원 검색 도구를 MCP 로 제공합니다 |

## 병원 목록이 아니라 검색 조건이 옵니다

`ai-search` 는 **검색을 대신 해 주지 않습니다.** 질문을 읽고 조건을 잡아 줄 뿐이고,
목록은 그 조건으로 **여러분이 [`GET /healthcare/hospitals`](/apis/healthcare) 를 한 번 더**
불러 받습니다.

그래서 이렇게 쓸 수 있습니다.

- **AI 가 무엇을 잡았는지 화면에 보여주고 사용자가 고치게** 할 수 있습니다. 틀려도 다시 물을
  필요 없이 조건 하나만 바꾸면 됩니다.
- 이미 만든 목록·지도·페이징을 그대로 씁니다. AI 응답 전용 화면을 따로 만들지 않습니다.

```bash
curl -X POST "https://api.plzhans.com/healthcare/ai-search" \
  -H "Authorization: Bearer sk_..." \
  -H "Content-Type: application/json" \
  -H "Accept-Language: ko" \
  -d '{ "q": "소아 천식 진료하는 병원" }'
```

```json
{
  "tool": "search_hospitals",
  "params": {
    "filter": { "subjectCds": ["PD"], "asmItemCds": ["..."], "emergency": false, "baby": false },
    "regionCd": "41450"
  },
  "conditions": [
    { "group": "subject", "names": ["소아청소년과"] },
    { "group": "assessment", "names": ["천식"] }
  ],
  "explain": "소아청소년과 중 천식 진료 평가에서 1등급을 받은 병원입니다.",
  "credits": 12000
}
```

## `tool` 로 갈라 쓰세요

응답의 `tool` 이 **화면이 할 일**입니다. 조건이 비어 있어도 할 일은 있을 수 있어서
(예: "근처 병원") 조건 개수로 판단하면 안 됩니다.

| `tool` | 화면이 할 일 |
| --- | --- |
| `search_hospitals` | `params.filter` + `params.regionCd` 로 병원 검색 |
| `search_nearby` | **측위는 화면 몫입니다.** 현재 위치를 얻어 거리순으로 검색 |
| `ask_location` | 지역을 되묻습니다. `params.placeText` 에 사용자가 말한 표현이 있습니다 |
| `answer_medical` | `params.answer` 를 그대로 보여줍니다(건강 질문에 답한 경우) |
| `reject` | 검색하지 않습니다. `params.reason` 이 이유입니다 |

::: tip 모르는 값은 넘기세요
`tool` 은 닫힌 목록이지만 늘어날 수 있습니다. `switch` 의 기본 가지에서 조용히 무시하면
새 값이 추가돼도 화면이 깨지지 않습니다.
:::

`conditions` 는 잡힌 조건을 **사람이 읽는 이름으로** 푼 것입니다(요청 언어로 옵니다).
칩·태그로 그대로 그리면 되고, 코드표를 따로 부를 필요가 없습니다.

## 대화를 이으려면 돌려주세요

서버는 **대화를 기억하지 않습니다.** 이어서 물으려면 직전 응답을 다음 요청에 실어 보냅니다.

- `context` — 직전 응답의 `params` 를 **그대로** 넣습니다. 지금까지 잡힌 조건이 이어집니다.
- `history` — 앞선 질문과 답. 최근 몇 마디만 넣으세요.

```json
{
  "q": "천안에서",
  "context": { "filter": { "subjectCds": ["PD"] } }
}
```

## 사용량

`GET /ai/capabilities` 로 남은 몫을 확인합니다. **아무것도 소모하지 않습니다.**

- 화면을 **열 때 한 번** 부르는 용도입니다. 값이 바뀌는 때는 질문한 순간뿐이고,
  그때는 검색 응답이 새 값을 싣고 옵니다 — **폴링하지 마세요.**
- 사용량을 다 쓰면 검색은 **503** 으로 거절됩니다. 요청이 너무 잦으면 **429** 입니다
  (둘은 안내가 달라야 합니다 — 429 는 잠시 뒤 다시, 503 은 기간이 바뀌어야 풀립니다).

::: warning 응답이 늦을 수 있습니다
외부 모델을 부르므로 첫 질문은 수 초가 걸립니다(같은 질문은 캐시되어 즉시 옵니다).
타임아웃은 넉넉히 잡고, 실패하면 **일반 검색으로 넘어갈 길**을 남겨 두세요.
:::

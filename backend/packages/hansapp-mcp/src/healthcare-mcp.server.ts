import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/server';
import {
  HealthcareHospitalService,
  HealthcareMetaService,
} from '@hansapp/application';
import { FALLBACK_LANG, type SupportedLang } from '@hansapp/common';
import { z } from 'zod';

/**
 * 서버 버전. MCP 클라이언트가 표시하는 값이라 앱 버전과 따로 둔다 —
 * 도구 계약이 바뀔 때만 올린다(앱을 배포한다고 도구가 바뀌지는 않는다).
 */
const SERVER_VERSION = '1.0.0';

/**
 * 한 번에 돌려주는 병원 수. **상대 모델의 컨텍스트에 그대로 들어간다** — 100건을 뱉으면
 * 그쪽 대화창이 스키마와 결과로 가득 찬다. 8건이면 "이 중에 골라줘" 가 성립하고,
 * 더 필요하면 조건을 좁히는 게 맞다(모델이 알아서 다시 부른다).
 */
const RESULT_SIZE = 8;

/**
 * 도구 인자로 받을 수 있는 언어. 응답의 이름 현지화에 쓴다.
 * `satisfies` 로 공용 타입에 묶어 둔다 — 지원 언어가 늘었는데 여기만 안 늘면 컴파일이 막힌다.
 */
const LANGS = [
  'ko',
  'en',
  'ja',
  'zh',
] as const satisfies readonly SupportedLang[];

/**
 * 병원 도메인 MCP 서버. **LLM 을 부르지 않는다** — 추론은 붙은 쪽(Claude Desktop 등)
 * 모델이 하고, 우리는 도구를 실행해 결과만 돌려준다. 그래서 프롬프트도 캐시 전략도 없다.
 *
 * [코드 목록을 enum 으로 굽는 이유]
 * `/healthcare/ai-search` 는 코드표를 **시스템 프롬프트**에 실어 보낸다. MCP 에는 그 자리가
 * 없다 — 상대 모델은 우리 프롬프트를 못 본다. 대신 **스키마의 enum 이 그 역할을 한다**:
 * 없는 코드는 클라이언트 단에서 걸러지므로 지어낼 수가 없다.
 * 부팅 때 코드 캐시에서 굽는 것도 그래서다(코드표가 바뀌면 재부팅으로 따라간다).
 *
 * [도구를 셋으로 묶은 이유]
 * 도구 하나당 스키마가 매 턴 모델 컨텍스트에 실린다. 잘게 쪼갤수록 토큰이 늘고 선택
 * 정확도가 떨어진다 — 검색·상세·코드조회면 병원 찾기에 필요한 건 다 된다.
 */
@Injectable()
export class HealthcareMcpServer implements OnApplicationBootstrap {
  /**
   * 코드 목록. **부팅 때 한 번 굽는다.** 요청마다 캐시를 훑을 이유가 없고,
   * zod enum 은 값 배열이 필요해 어차피 한 번은 펼쳐야 한다.
   */
  private subjectCodes: [string, ...string[]] = ['IM'];
  private asmCodes: [string, ...string[]] = ['16'];
  private specialtyCodes: [string, ...string[]] = ['JOINT'];
  private tierCodes: [string, ...string[]] = ['TIER1'];

  // **코드 캐시를 직접 안 본다.** 캐시는 응용 계층 내부라 밖으로 안 나온다(리포지토리와 같은 규약).
  // 메타 서비스가 이미 같은 목록을 표시용으로 정리해 주므로 그걸 쓴다.
  constructor(
    private readonly hospitals: HealthcareHospitalService,
    private readonly meta: HealthcareMetaService,
  ) {}

  /**
   * 코드 캐시가 채워진 뒤에 굽는다. **캐시들도 OnApplicationBootstrap 이라** 순서가
   * 문제인데, Nest 는 프로바이더 등록 순으로 부르고 이 서버가 그 뒤에 등록된다.
   * 그래도 비었으면 기본값 하나로 남아 도구가 죽지는 않는다(위 필드 초기값).
   */
  onApplicationBootstrap(): void {
    this.subjectCodes = toEnum(this.meta.listSubjects().map((s) => s.code));
    this.specialtyCodes = toEnum(
      this.meta.listCodes('specialty').map((c) => c.code),
    );
    // 평가 항목은 분야(asm01…)로 묶여 오므로 항목 코드만 펼친다.
    this.asmCodes = toEnum(
      this.meta.listAssessments().flatMap((g) => g.items.map((i) => i.code)),
    );
    this.tierCodes = toEnum(this.meta.listHospitalTiers().map((t) => t.code));
  }

  /**
   * 요청 하나를 처리할 McpServer. **요청마다 새로 만든다**(McpServerFactory 계약).
   *
   * 새 스펙(2026-07-28)은 세션이 없어 서버 인스턴스에 남는 상태가 없다. 만드는 비용은
   * 도구 등록 몇 번이라 무시할 만하고, 요청 사이에 상태가 새지 않는 편이 안전하다.
   */
  create(): McpServer {
    const server = new McpServer({
      name: 'medifinder-healthcare',
      version: SERVER_VERSION,
    });

    server.registerTool(
      'search_hospitals',
      {
        title: '병원 검색',
        description:
          '한국의 병원·의원을 조건으로 검색한다. 지역·진료과목·심평원 평가등급·응급실 여부로 좁힌다.\n' +
          '결과는 최대 8건이며, 더 필요하면 조건을 좁혀서 다시 부를 것.\n' +
          '**진단이나 치료 조언에 쓰지 말 것** — 어느 병원에 갈지 고르는 용도다.',
        inputSchema: {
          subjectCds: z
            .array(z.enum(this.subjectCodes))
            .max(5)
            .optional()
            .describe(
              '진료과목 코드. 신고 기준이라 전문의 보유와는 다르다. list_medical_codes 로 뜻을 확인할 수 있다.',
            ),
          specialistCds: z
            .array(z.enum(this.subjectCodes))
            .max(5)
            .optional()
            .describe(
              '그 과목 전문의를 실제로 보유한 병원만 건다. 사용자가 "전문의" 를 원할 때 쓴다.',
            ),
          asmItemCds: z
            .array(z.enum(this.asmCodes))
            .max(3)
            .optional()
            .describe(
              '심평원 적정성평가 항목 코드. 넣으면 그 항목 **1등급(우수)** 병원만 걸린다. ' +
                '항목마다 1등급의 뜻이 다르다 — 예를 들어 주사제 처방률 1등급은 "주사를 적게 놓는다" 는 뜻이다. ' +
                'list_medical_codes 로 반드시 확인하고 쓸 것.',
            ),
          specialtyCds: z
            .array(z.enum(this.specialtyCodes))
            .max(3)
            .optional()
            .describe('보건복지부 지정 전문병원 분야 코드.'),
          tiers: z
            .array(z.enum(this.tierCodes))
            .optional()
            .describe(
              '병원 등급. 비우면 요양병원·정신병원이 제외된다. TIER3(상급종합)는 진료의뢰서가 없으면 진료비 전액 본인 부담이다.',
            ),
          regionCd: z
            .string()
            .optional()
            .describe(
              '지역 코드(시도 또는 시군구). 시도를 주면 하위 시군구 전체로 넓힌다. 코드를 모르면 비워둘 것.',
            ),
          name: z.string().optional().describe('병원 이름(부분 일치).'),
          emergency: z.boolean().optional().describe('응급실 운영 병원만.'),
          baby: z
            .boolean()
            .optional()
            .describe('달빛어린이병원(야간·휴일 소아 진료)만.'),
          lang: z.enum(LANGS).optional().describe('결과 이름의 언어. 기본 ko.'),
        },
      },
      async (input) => {
        const lang = input.lang ?? FALLBACK_LANG;
        const page = await this.hospitals.search(
          {
            page: 1,
            size: RESULT_SIZE,
            subjectCds: input.subjectCds,
            specialistCds: input.specialistCds,
            asmItemCds: input.asmItemCds,
            specialtyCds: input.specialtyCds,
            tiers: input.tiers,
            regionCd: input.regionCd,
            name: input.name,
            emergency: input.emergency,
            baby: input.baby,
          },
          lang,
        );

        return json({
          total: page.totalCount,
          returned: page.items.length,
          hospitals: page.items,
          hint:
            page.totalCount > RESULT_SIZE
              ? `전체 ${page.totalCount}건 중 ${page.items.length}건만 보여준다. 조건을 좁혀서 다시 검색할 것.`
              : undefined,
        });
      },
    );

    server.registerTool(
      'get_hospital',
      {
        title: '병원 상세',
        description:
          'search_hospitals 로 찾은 병원의 상세 정보. 진료시간·장비·병상·전문의 수·평가등급을 준다.',
        inputSchema: {
          id: z
            .number()
            .int()
            .positive()
            .describe('병원 id. search_hospitals 결과의 id 를 그대로 쓴다.'),
          lang: z.enum(LANGS).optional().describe('언어. 기본 ko.'),
        },
      },
      async (input) => {
        const lang = input.lang ?? FALLBACK_LANG;
        const detail = await this.hospitals.get(input.id, lang);
        if (!detail) {
          // 도구 실패가 아니라 "없다" 는 결과다. 모델이 읽고 다시 검색하면 된다.
          return json({ found: false, id: input.id });
        }
        return json({ found: true, hospital: detail });
      },
    );

    server.registerTool(
      'list_medical_codes',
      {
        title: '코드표 조회',
        description:
          '검색에 쓰는 코드의 뜻을 알려준다. **적정성평가(asm) 코드는 반드시 먼저 확인할 것** — ' +
          '"1등급" 이 항목마다 다른 것을 뜻하기 때문이다(주사제 처방률 1등급 = 주사를 적게 놓음).',
        inputSchema: {
          type: z
            .enum(['subject', 'assessment', 'specialty', 'tier'])
            .describe(
              'subject=진료과목 · assessment=심평원 적정성평가 · specialty=전문병원 분야 · tier=병원 등급',
            ),
          lang: z.enum(LANGS).optional().describe('언어. 기본 ko.'),
        },
      },
      (input) => {
        const lang = input.lang ?? FALLBACK_LANG;
        switch (input.type) {
          case 'subject':
            return json(this.meta.listSubjects(lang));
          case 'assessment':
            return json(this.meta.listAssessments(lang));
          case 'specialty':
            return json(this.meta.listCodes('specialty', lang));
          case 'tier':
            return json(this.meta.listHospitalTiers(lang));
        }
      },
    );

    return server;
  }
}

/**
 * MCP 도구 응답. **JSON 을 문자열로 싣는다** — 스펙의 content 는 텍스트라, 구조를 주려면
 * 직렬화해서 넣는 수밖에 없다. 모델은 이걸 읽고 파싱한다.
 */
function json(value: unknown): { content: { type: 'text'; text: string }[] } {
  return [value].map(() => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }))[0];
}

/** zod enum 은 최소 한 개를 요구한다. 코드표가 비면(부팅 순서 사고) 도구가 죽지 않게 막는다. */
function toEnum(codes: string[]): [string, ...string[]] {
  return codes.length > 0 ? (codes as [string, ...string[]]) : ['__none__'];
}

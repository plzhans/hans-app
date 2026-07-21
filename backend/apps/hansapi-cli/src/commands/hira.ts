import { Command } from 'commander';
import { EnvSource } from '@hansapi/common';
import {
  DEFAULT_CODE_SYNC_ROWS,
  HIRA_CODE_TYPE_DEFS,
  HIRA_CODE_TYPES,
  HiraCodeReadService,
  HiraCodeSyncService,
  HiraHospitalReadService,
  HiraHospitalSyncService,
  HiraNpayCodeSyncService,
  HiraNpayWebSyncService,
  HiraQueryService,
  isHiraCodeType,
  type HiraCodeType,
} from '@hansapi/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';
import { printJson, printSimple } from '../output';
import { printCodeSyncResult } from './code-sync';
import { stageSyncCommand } from './stage';
import { syncCommand } from './sync';

/** --simple 로 보여줄 컬럼 */
const HOSPITAL_COLUMNS = ['ykiho', 'yadmNm', 'clCdNm', 'addr'];

/**
 * DB 미러 / 원본 API 중 소스를 골라 조회한다. 소스 선택은 응용 계층이 한다.
 */
async function withRead<T>(
  source: EnvSource,
  run: (service: HiraHospitalReadService) => Promise<T>,
): Promise<T> {
  return withAdminContext(source, (context) =>
    run(context.get(HiraHospitalReadService)),
  );
}

/**
 * 외부 API 호출은 응용 계층(HiraQueryService)이 소유한다.
 * CLI 는 커맨드를 파싱해 서비스를 호출하고 결과를 출력할 뿐, SDK 를 직접 잡지 않는다.
 */
async function withQuery<T>(
  source: EnvSource,
  run: (service: HiraQueryService) => Promise<T>,
): Promise<T> {
  return withAdminContext(source, (context) =>
    run(context.get(HiraQueryService)),
  );
}

/** --simple 이면 지정 컬럼만 표로, 아니면 응답 원본을 그대로 출력한다. */
function printResponse(
  response: unknown,
  command: Command,
  simpleColumns: string[],
): void {
  const { simple, pretty } = command.optsWithGlobals<{
    simple?: boolean;
    pretty?: boolean;
  }>();
  if (simple) {
    printSimple(response, simpleColumns);
    return;
  }
  printJson(response, pretty);
}

interface PageOptions {
  page: string;
  rows: string;
}

function toPageParams(options: PageOptions): {
  pageNo: number;
  numOfRows: number;
} {
  return { pageNo: Number(options.page), numOfRows: Number(options.rows) };
}

function withCommonOptions(command: Command, defaultRows: string): Command {
  return command
    .option('-p, --page <number>', '페이지 번호', '1')
    .option('-n, --rows <number>', '한 페이지 결과 수', defaultRows)
    .option('--pretty', 'JSON 응답에 색을 입혀 출력한다')
    .option('--simple', '주요 컬럼만 표로 출력한다');
}

/** ykiho 를 받는 상세 조회 커맨드를 한 번에 정의한다. 11개가 형태가 같다. */
interface DetailSpec {
  name: string;
  description: string;
  columns: string[];
  call: (
    service: HiraQueryService,
    ykiho: string,
    params: { pageNo: number; numOfRows: number },
  ) => Promise<unknown>;
}

const DETAIL_COMMANDS: DetailSpec[] = [
  {
    name: 'info',
    description: '세부정보 (진료시간·휴진·주차·응급실)',
    columns: ['trmtMonStart', 'trmtMonEnd', 'lunchWeek', 'emyDayYn', 'parkQty'],
    call: (c, y, p) => c.getDetailInfo(y, p),
  },
  {
    name: 'facility',
    description: '시설정보 (병상·수술실 등)',
    columns: ['yadmNm', 'permSbdCnt', 'stdSickbdCnt', 'soprmCnt', 'emymCnt'],
    call: (c, y, p) => c.getFacilityInfo(y, p),
  },
  {
    name: 'subject',
    description: '진료과목정보',
    columns: ['dgsbjtCd', 'dgsbjtCdNm', 'dgsbjtPrSdrCnt', 'cdiagDrCnt'],
    call: (c, y, p) => c.getSubjectInfo(y, p),
  },
  {
    name: 'transport',
    description: '교통정보',
    columns: ['trafNm', 'lineNo', 'dir', 'arivPlc'],
    call: (c, y, p) => c.getTransportInfo(y, p),
  },
  {
    name: 'equipment',
    description: '의료장비정보',
    columns: ['oftCd', 'oftCdNm', 'oftCnt'],
    call: (c, y, p) => c.getEquipmentInfo(y, p),
  },
  {
    name: 'nursing',
    description: '간호등급정보',
    columns: ['tyCd', 'tyCdNm', 'careGrd'],
    call: (c, y, p) => c.getNursingGradeInfo(y, p),
  },
  {
    name: 'food',
    description: '식대가산정보',
    columns: ['tyCd', 'tyCdNm', 'gnmAddcYn', 'calcNopCnt'],
    call: (c, y, p) => c.getFoodAddcInfo(y, p),
  },
  {
    name: 'special',
    description: '특수진료정보 (진료가능분야)',
    columns: ['srchCd', 'srchCdNm'],
    call: (c, y, p) => c.getSpecialDiagnosisInfo(y, p),
  },
  {
    name: 'specialty',
    description: '전문병원지정분야 (전문병원이 아니면 0건)',
    columns: ['srchCd', 'srchCdNm'],
    call: (c, y, p) => c.getSpecialtyHospitalFields(y, p),
  },
  {
    name: 'specialist',
    description: '전문과목별 전문의수',
    columns: ['dgsbjtCd', 'dgsbjtCdNm', 'dtlSdrCnt'],
    call: (c, y, p) => c.getSpecialistCounts(y, p),
  },
  {
    name: 'etc-staff',
    description: '기타인력수',
    columns: ['gnlNopDtlCd', 'dtlGnlNopCdNm', 'gnlNopCnt'],
    call: (c, y, p) => c.getEtcStaffInfo(y, p),
  },
];

/**
 * 코드 종류(tp) 목록을 도움말 한 줄로 만든다.
 * 원본 API 는 종류마다 엔드포인트가 따로지만, 우리는 --tp 로 고른다.
 */
function codeTypeHelp(): string {
  return HIRA_CODE_TYPES.map(
    (tp: HiraCodeType) => `${tp}=${HIRA_CODE_TYPE_DEFS[tp].tpNm}`,
  ).join(', ');
}

/**
 * --simple 로 보여줄 컬럼. 종류마다 원본 필드명이 다르다(addrCd / clCd / …).
 * 매핑을 CLI 에 또 적지 않고, 응용 계층의 변환 함수가 만드는 키를 그대로 쓴다.
 */
function codeColumns(tp: HiraCodeType): string[] {
  return Object.keys(
    HIRA_CODE_TYPE_DEFS[tp].toItem({ cd: '', cdNm: null, cdCmt: null }),
  );
}

/** --tp 값 검증. commander 는 열거형을 모르니 여기서 막는다. */
function parseCodeType(value: string): HiraCodeType {
  if (!isHiraCodeType(value)) {
    throw new Error(
      `알 수 없는 코드 종류: ${value}\n사용 가능: ${HIRA_CODE_TYPES.join(', ')}`,
    );
  }
  return value;
}

/**
 * 심평원 홈페이지 비급여 크롤. **배치 서버의 대역이다.**
 *
 * 흐름은 이렇다 — medifinder 에서 '갱신 요청' 을 누르면 hansapi-server 가 job_queue 에 한 줄
 * 넣고 끝난다(서버는 외부를 호출하지 않는다). 그걸 꺼내 처리하는 게 배치 서버인데 아직 없어서,
 * 지금은 이 커맨드가 1건씩 대신 돌린다.
 *
 * **공개 API 가 아니라 웹 스크래핑이고 법무 확인 전이다** — clients/kr-or-hira/README.md 참고.
 */
function addNpayWebCommands(hira: Command, source: EnvSource): void {
  addExamples(
    hira
      .command('npay-code')
      .description(
        '비급여 항목 코드마스터(hira_npay_code) 적재. 요약(List2) 전량 페이징으로 코드·이름·분류코드를 채운다',
      )
      .action(async (): Promise<void> => {
        await withAdminContext(source, async (context) => {
          const out = await context.get(HiraNpayCodeSyncService).sync();
          console.log(
            `완료 ${out.total}종 (${out.processed}건 upsert, ${out.calls}콜)`,
          );
        });
      }),
    [
      'hansapi-cli hira npay-code   # 코드마스터 전량 적재 (188콜, 저빈도 배치용)',
    ],
  );

  const npay = hira
    .command('npay-web')
    .description('비급여(심평원 홈페이지 크롤). 큐를 꺼내 처리한다');

  addExamples(
    npay
      .command('work')
      .description('큐에서 갱신 요청을 꺼내 처리한다 (배치 서버 대역)')
      .option(
        '-n, --count <number>',
        '처리할 건수. 기본 1 — 한 건씩 눈으로 확인하라는 뜻이다',
        '1',
      )
      .action(async (options: { count: string }): Promise<void> => {
        const count = Number(options.count);
        await withAdminContext(source, async (context) => {
          const service = context.get(HiraNpayWebSyncService);

          for (let i = 0; i < count; i++) {
            const done = await service.processNext();
            if (!done) {
              console.log('큐가 비었다.');
              return;
            }
            console.log(
              done.count < 0
                ? `실패 ykiho=${done.ykiho} (사유는 job_queue.error 에 남았다)`
                : `완료 ykiho=${done.ykiho} ${done.count}건`,
            );
          }
        });
      }),
    [
      'hansapi-cli hira npay-web work            # 큐에서 1건 처리',
      'hansapi-cli hira npay-web work -n 10      # 10건 처리',
    ],
  );

  addExamples(
    npay
      .command('crawl <ykiho>')
      .description(
        '큐를 거치지 않고 이 기관을 바로 긁는다 (동작 확인용). ykiho 는 암호화 요양기호다',
      )
      .action(async (ykiho: string): Promise<void> => {
        await withAdminContext(source, async (context) => {
          const n = await context.get(HiraNpayWebSyncService).crawl(ykiho);
          console.log(
            `완료 ${n}건 (0건이면 그 기관이 신고한 게 없다는 뜻이다)`,
          );
        });
      }),
    ['hansapi-cli hira npay-web crawl JDQ4MTAxMiM1MSMk...'],
  );
}

export function hiraCommand(source: EnvSource): Command {
  const hira = new Command('hira').description(
    '건강보험심사평가원(HIRA) 공공데이터 API',
  );

  // 단계 배치. 계획 문서(docs/krdata-cache-plan.md)의 단계와 1:1 이다.
  hira.addCommand(stageSyncCommand('hira', source));

  addNpayWebCommands(hira, source);

  const hospital = hira.command('hospital').description('병원 정보');

  hospital.addCommand(
    syncCommand('HIRA', source, (context, options) =>
      context.get(HiraHospitalSyncService).sync(options),
    ),
  );

  addExamples(
    withCommonOptions(
      hospital
        .command('list')
        .description(
          '병원 기본목록 (ykiho 를 여기서 얻는다). 기본은 로컬 DB, --origin 이면 원본 API',
        )
        .option(
          '--origin',
          '로컬 DB 대신 공공데이터 API 를 직접 조회한다 (콜수를 소모한다). 필터는 이 모드에서만 쓸 수 있다',
        )
        .option('--sido <code>', '시도코드 (예: 110000=서울). --origin 전용')
        .option(
          '--sggu <code>',
          '시군구코드 (예: 110019=중랑구). --origin 전용',
        )
        .option('--emdong <name>', '읍면동명. --origin 전용')
        .option('--name <name>', '병원명. --origin 전용')
        .option('--cl <code>', '종별코드 (예: 01=상급종합). --origin 전용')
        .option('--subject <code>', '진료과목코드 (예: 01=내과). --origin 전용')
        .option(
          '--lon <number>',
          'x좌표(경도). radius 와 함께 써야 반경 검색이 된다',
        )
        .option('--lat <number>', 'y좌표(위도)')
        .option('--radius <meter>', '반경(m). 예: 3000'),
      '10',
    ).action(
      async (
        options: PageOptions & {
          origin?: boolean;
          sido?: string;
          sggu?: string;
          emdong?: string;
          name?: string;
          cl?: string;
          subject?: string;
          lon?: string;
          lat?: string;
          radius?: string;
        },
        command: Command,
      ): Promise<void> => {
        const response = await withRead(source, (service) =>
          service.getHospitalList({
            source: options.origin ? 'origin' : 'db',
            sido: options.sido,
            sggu: options.sggu,
            emdong: options.emdong,
            name: options.name,
            cl: options.cl,
            subject: options.subject,
            lon: options.lon,
            lat: options.lat,
            radius: options.radius ? Number(options.radius) : undefined,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, HOSPITAL_COLUMNS);
      },
    ),
    [
      'hansapi-cli hira hospital list --simple                        # 로컬 DB',
      'hansapi-cli hira hospital list --origin --sido 110000 --simple # 원본 API + 필터',
    ],
  );

  // ykiho 기준 상세 조회 11종
  const detail = hira
    .command('detail')
    .description('의료기관별 상세정보 (ykiho 기준)');

  for (const spec of DETAIL_COMMANDS) {
    addExamples(
      withCommonOptions(
        detail
          .command(spec.name)
          .description(spec.description)
          .argument(
            '<ykiho>',
            '암호화된 요양기호. hira hospital list 로 얻는다',
          ),
        '10',
      ).action(
        async (
          ykiho: string,
          options: PageOptions,
          command: Command,
        ): Promise<void> => {
          const response = await withQuery(source, (service) =>
            spec.call(service, ykiho, toPageParams(options)),
          );
          printResponse(response, command, spec.columns);
        },
      ),
      [`hansapi-cli hira detail ${spec.name} "<ykiho>" --simple`],
    );
  }

  // 코드 조회 6종
  const code = hira
    .command('code')
    .description(`병원코드정보. 종류는 --tp 로 고른다 (${codeTypeHelp()})`);

  addExamples(
    code
      .command('sync')
      .description('코드를 로컬 DB(hira_code)에 적재한다. 기본은 6종 전부')
      .option('--tp <type>', `특정 종류만 적재한다 (${codeTypeHelp()})`)
      .option(
        '-n, --rows <number>',
        `한 페이지 결과 수 (기본 ${DEFAULT_CODE_SYNC_ROWS})`,
      )
      .option('--quiet', '진행 로그를 숨긴다')
      .action(
        async (options: {
          tp?: string;
          rows?: string;
          quiet?: boolean;
        }): Promise<void> => {
          const results = await withAdminContext(
            source,
            (context) =>
              context.get(HiraCodeSyncService).sync({
                tp: options.tp ? parseCodeType(options.tp) : undefined,
                numOfRows: options.rows ? Number(options.rows) : undefined,
              }),
            { verbose: !options.quiet },
          );
          printCodeSyncResult('HIRA', results);
        },
      ),
    [
      'hansapi-cli hira code sync              # 6종 전부',
      'hansapi-cli hira code sync --tp class   # 의료기관종별코드만',
    ],
  );

  addExamples(
    withCommonOptions(
      code
        .command('list')
        .description(
          '코드 목록. 기본은 로컬 DB, --origin 이면 원본 API. 응답은 종류별 원본 필드명 그대로다',
        )
        .requiredOption('--tp <type>', `코드 종류 (${codeTypeHelp()})`)
        .option(
          '--origin',
          '로컬 DB 대신 공공데이터 API 를 직접 조회한다 (콜수를 소모한다)',
        ),
      '100',
    ).action(
      async (
        options: PageOptions & { tp: string; origin?: boolean },
        command: Command,
      ): Promise<void> => {
        const tp = parseCodeType(options.tp);
        const response = await withAdminContext(source, (context) =>
          context.get(HiraCodeReadService).getCodes({
            source: options.origin ? 'origin' : 'db',
            tp,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, codeColumns(tp));
      },
    ),
    [
      'hansapi-cli hira code list --tp class --simple',
      'hansapi-cli hira code list --tp subject --origin --simple',
    ],
  );

  return hira;
}

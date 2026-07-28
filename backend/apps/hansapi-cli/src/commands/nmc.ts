import { Command } from 'commander';
import { ConfigSource } from '@hansapi/common';
import {
  DEFAULT_CODE_SYNC_ROWS,
  NmcCodeReadService,
  NmcCodeSyncService,
  NmcHospitalReadService,
  NmcHospitalSyncService,
  NmcQueryService,
} from '@hansapi/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';
import { printJson, printSimple } from '../output';
import { printCodeSyncResult } from './code-sync';
import { stageSyncCommand } from './stage';
import { syncCommand } from './sync';

/** --simple 로 보여줄 컬럼 */
const HOSPITAL_COLUMNS = ['hpid', 'dutyName', 'dutyAddr'];
const LOCATION_COLUMNS = ['hpid', 'dutyName', 'distance', 'dutyAddr'];
const CODE_COLUMNS = ['cmMid', 'cmMnm', 'cmSid', 'cmSnm'];

/**
 * DB 미러 / 원본 API 중 소스를 골라 조회한다. 소스 선택은 응용 계층이 한다.
 */
async function withRead<T>(
  source: ConfigSource,
  run: (service: NmcHospitalReadService) => Promise<T>,
): Promise<T> {
  return withAdminContext(source, (context) =>
    run(context.get(NmcHospitalReadService)),
  );
}

/**
 * 외부 API 호출은 응용 계층(NmcQueryService)이 소유한다.
 * CLI 는 커맨드를 파싱해 서비스를 호출하고 결과를 출력할 뿐, SDK 를 직접 잡지 않는다.
 */
async function withQuery<T>(
  source: ConfigSource,
  run: (service: NmcQueryService) => Promise<T>,
): Promise<T> {
  return withAdminContext(source, (context) =>
    run(context.get(NmcQueryService)),
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

/** 모든 조회 커맨드에 공통으로 붙는 옵션 */
function withCommonOptions(command: Command, defaultRows: string): Command {
  return command
    .option('-p, --page <number>', '페이지 번호', '1')
    .option('-n, --rows <number>', '한 페이지 결과 수', defaultRows)
    .option('--pretty', 'JSON 응답에 색을 입혀 출력한다')
    .option('--simple', '주요 컬럼만 표로 출력한다');
}

export function nmcCommand(source: ConfigSource): Command {
  const nmc = new Command('nmc').description(
    '국립중앙의료원(NMC) 전국 병·의원 찾기 서비스',
  );

  // 단계 배치. 계획 문서(docs/krdata-cache-plan.md)의 단계와 1:1 이다.
  nmc.addCommand(stageSyncCommand('nmc', source));

  const hospital = nmc.command('hospital').description('병·의원 정보');

  hospital.addCommand(
    syncCommand('NMC', source, (context, options) =>
      context.get(NmcHospitalSyncService).sync(options),
    ),
  );

  addExamples(
    withCommonOptions(
      hospital
        .command('search')
        .description(
          '병·의원 목록정보 조회 (주소·진료과목 등으로 필터). 원본 API 전용',
        )
        .option('--sido <name>', '주소(시도). 예: 서울특별시')
        .option('--sigungu <name>', '주소(시군구). 예: 강남구')
        .option(
          '--div <code>',
          '기관구분 코드. 코드마스터 H000 참조 (B:병원, C:의원)',
        )
        .option('--subject <code>', '진료과목 코드. 예: D001(내과)')
        .option('--day <1-8>', '진료요일. 월~일(1~7), 공휴일(8)')
        .option('--name <name>', '기관명')
        .option('--ord <order>', '정렬 순서. 예: NAME, ADDR'),
      '10',
    ).action(
      async (
        options: PageOptions & {
          sido?: string;
          sigungu?: string;
          div?: string;
          subject?: string;
          day?: string;
          name?: string;
          ord?: string;
        },
        command: Command,
      ): Promise<void> => {
        const response = await withQuery(source, (service) =>
          service.getHospitalList({
            Q0: options.sido,
            Q1: options.sigungu,
            QZ: options.div,
            QD: options.subject,
            QT: options.day,
            QN: options.name,
            ORD: options.ord,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, HOSPITAL_COLUMNS);
      },
    ),
    [
      'hansapi-cli nmc hospital search --sido 서울특별시 --sigungu 종로구 --simple',
      'hansapi-cli nmc hospital search --subject D001 --day 1 --simple',
    ],
  );

  addExamples(
    withCommonOptions(
      hospital
        .command('location')
        .description('병·의원 위치정보 조회 (위경도 기준 거리순)')
        .requiredOption('--lon <number>', '병원경도 (WGS84)')
        .requiredOption('--lat <number>', '병원위도 (WGS84)'),
      '10',
    ).action(
      async (
        options: PageOptions & { lon: string; lat: string },
        command: Command,
      ): Promise<void> => {
        const response = await withQuery(source, (service) =>
          service.getHospitalLocations({
            WGS84_LON: options.lon,
            WGS84_LAT: options.lat,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, LOCATION_COLUMNS);
      },
    ),
    [
      'hansapi-cli nmc hospital location --lon 127.0851566 --lat 37.4881325 --simple',
    ],
  );

  addExamples(
    withCommonOptions(
      hospital
        .command('basic')
        .description('병·의원별 기본정보 조회')
        .argument('<hpid>', '기관ID (예: A1100001)'),
      '10',
    ).action(
      async (
        hpid: string,
        options: PageOptions,
        command: Command,
      ): Promise<void> => {
        const response = await withQuery(source, (service) =>
          service.getHospitalBasisInfo(hpid, toPageParams(options)),
        );
        printResponse(response, command, HOSPITAL_COLUMNS);
      },
    ),
    ['hansapi-cli nmc hospital basic A1100001 --pretty'],
  );

  addExamples(
    withCommonOptions(
      hospital
        .command('list')
        .description(
          '병·의원 목록 조회. 기본은 로컬 DB, --origin 이면 원본 API',
        )
        .option(
          '--origin',
          '로컬 DB 대신 공공데이터 API 를 직접 조회한다 (콜수를 소모한다)',
        ),
      '10',
    ).action(
      async (
        options: PageOptions & { origin?: boolean },
        command: Command,
      ): Promise<void> => {
        const response = await withRead(source, (service) =>
          service.getHospitalList({
            source: options.origin ? 'origin' : 'db',
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, HOSPITAL_COLUMNS);
      },
    ),
    [
      'hansapi-cli nmc hospital list --simple            # 로컬 DB',
      'hansapi-cli nmc hospital list --origin --simple   # 원본 API',
    ],
  );

  const baby = nmc
    .command('baby')
    .description('달빛어린이병원 및 소아전문센터');

  addExamples(
    withCommonOptions(
      baby
        .command('list')
        .description('달빛어린이병원 및 소아전문센터 목록정보 조회')
        .option('--sido <name>', '주소(시도). 예: 서울특별시')
        .option('--sigungu <name>', '주소(시군구). 예: 강남구')
        .option('--div <code>', '기관구분 코드')
        .option('--subject <code>', '진료과목 코드. 예: D002(소아청소년과)')
        .option('--day <1-8>', '진료요일. 월~일(1~7), 공휴일(8)')
        .option('--name <name>', '기관명')
        .option('--ord <order>', '정렬 순서. 예: NAME, ADDR'),
      '10',
    ).action(
      async (
        options: PageOptions & {
          sido?: string;
          sigungu?: string;
          div?: string;
          subject?: string;
          day?: string;
          name?: string;
          ord?: string;
        },
        command: Command,
      ): Promise<void> => {
        const response = await withQuery(source, (service) =>
          service.getBabyHospitalList({
            Q0: options.sido,
            Q1: options.sigungu,
            QZ: options.div,
            QD: options.subject,
            QT: options.day,
            QN: options.name,
            ORD: options.ord,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, HOSPITAL_COLUMNS);
      },
    ),
    ['hansapi-cli nmc baby list --sido 서울특별시 --simple'],
  );

  addExamples(
    withCommonOptions(
      baby
        .command('location')
        .description('달빛어린이병원 위치정보 조회 (위경도 기준 거리순)')
        .requiredOption('--lon <number>', '병원경도 (WGS84)')
        .requiredOption('--lat <number>', '병원위도 (WGS84)'),
      '10',
    ).action(
      async (
        options: PageOptions & { lon: string; lat: string },
        command: Command,
      ): Promise<void> => {
        const response = await withQuery(source, (service) =>
          service.getBabyHospitalLocations({
            WGS84_LON: options.lon,
            WGS84_LAT: options.lat,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, LOCATION_COLUMNS);
      },
    ),
    [
      'hansapi-cli nmc baby location --lon 127.0851566 --lat 37.4881325 --simple',
    ],
  );

  const code = nmc.command('code').description('코드마스터');

  addExamples(
    code
      .command('sync')
      .description('코드마스터를 로컬 DB(nmc_code)에 적재한다')
      .option(
        '-n, --rows <number>',
        `한 페이지 결과 수 (기본 ${DEFAULT_CODE_SYNC_ROWS})`,
      )
      .option('--quiet', '진행 로그를 숨긴다')
      .action(
        async (options: { rows?: string; quiet?: boolean }): Promise<void> => {
          const result = await withAdminContext(
            source,
            (context) =>
              context.get(NmcCodeSyncService).sync({
                numOfRows: options.rows ? Number(options.rows) : undefined,
              }),
            { verbose: !options.quiet },
          );
          printCodeSyncResult('NMC', [result]);
        },
      ),
    ['hansapi-cli nmc code sync'],
  );

  addExamples(
    withCommonOptions(
      code
        .command('list')
        .description('코드마스터 목록. 기본은 로컬 DB, --origin 이면 원본 API')
        .option(
          '-m, --cm-mid <code>',
          '대분류코드 (예: H010, D000, S000). 생략하면 전체 코드를 받는다',
        )
        .option(
          '--origin',
          '로컬 DB 대신 공공데이터 API 를 직접 조회한다 (콜수를 소모한다)',
        ),
      '100',
    ).action(
      async (
        options: PageOptions & { cmMid?: string; origin?: boolean },
        command: Command,
      ): Promise<void> => {
        const response = await withAdminContext(source, (context) =>
          context.get(NmcCodeReadService).getCodes({
            source: options.origin ? 'origin' : 'db',
            cmMid: options.cmMid,
            ...toPageParams(options),
          }),
        );
        printResponse(response, command, CODE_COLUMNS);
      },
    ),
    [
      'hansapi-cli nmc code list -m H010 --simple',
      'hansapi-cli nmc code list --origin -n 3000 --simple',
    ],
  );

  return nmc;
}

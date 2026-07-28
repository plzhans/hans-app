import { Command } from 'commander';
import { ConfigSource } from '@hansapi/common';
import {
  HealthcareBuildService,
  HealthcareDetailBuildService,
} from '@hansapi/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';

/**
 * 통합 병원(healthcare_*) 커맨드.
 *
 * API 콜이 0이다. HIRA + NMC + 매칭 + 코드 매핑을 DB 안에서 계산해 만든다.
 * sync 와 match 가 끝난 뒤에 돌린다.
 */
export function healthcareCommand(source: ConfigSource): Command {
  const healthcare = new Command('healthcare').description(
    '통합 병원 데이터 (HIRA + NMC → 우리 코드)',
  );

  addExamples(
    healthcare
      .command('build')
      .description(
        '통합 병원을 재생성한다. 직접 등록(manual)한 병원은 건드리지 않는다',
      )
      .option(
        '--only-main',
        '본체만 만들고 하위 테이블(진료과목·진료시간·병상 등)은 건너뛴다',
      )
      .option('--quiet', '진행 로그를 숨긴다')
      .action(
        async (options: {
          onlyMain?: boolean;
          quiet?: boolean;
        }): Promise<void> => {
          const { result, detail } = await withAdminContext(
            source,
            async (context) => {
              const result = await context.get(HealthcareBuildService).build();
              const detail = options.onlyMain
                ? undefined
                : await context.get(HealthcareDetailBuildService).build();
              return { result, detail };
            },
            { verbose: !options.quiet },
          );

          const seconds = (
            (result.elapsedMs + (detail?.elapsedMs ?? 0)) /
            1000
          ).toFixed(1);

          console.log(
            [
              '통합 병원 빌드 완료',
              `  전체        : ${result.hospitals.toLocaleString()}`,
              `    HIRA+NMC  : ${result.fromBoth.toLocaleString()} (매칭됨)`,
              `    HIRA 만   : ${result.hiraOnly.toLocaleString()}`,
              `    NMC 만    : ${result.nmcOnly.toLocaleString()}`,
              `  병원 아님   : ${result.skippedNonHospital.toLocaleString()} (소방서·구급차 등 제외)`,
              `  종별 미매핑 : ${result.unmappedClass.toLocaleString()}`,
              `  지역 미매핑 : ${result.unmappedRegion.toLocaleString()}`,
              ...(detail
                ? [
                    '  하위 테이블',
                    `    진료과목  : ${detail.subjects.toLocaleString()}`,
                    `    진료시간  : ${detail.hours.toLocaleString()}`,
                    `    인력      : ${detail.staff.toLocaleString()}`,
                    `    병상      : ${detail.beds.toLocaleString()}`,
                    `    장비      : ${detail.equipments.toLocaleString()}`,
                    `    역량      : ${detail.capabilities.toLocaleString()}`,
                    `    확인상태  : ${detail.sections.toLocaleString()}`,
                  ]
                : []),
              `  소요 시간   : ${seconds}초`,
            ].join('\n'),
          );
        },
      ),
    [
      'hansapi-cli healthcare build',
      'hansapi-cli healthcare build --only-main',
    ],
  );

  return healthcare;
}

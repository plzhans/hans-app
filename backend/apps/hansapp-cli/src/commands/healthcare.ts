import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import {
  HealthcareBuildService,
  HealthcareDetailBuildService,
  HealthcareNameBuildService,
} from '@hansapp/admin-application';

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
      .description('통합 병원을 재생성한다. 직접 등록(manual)한 병원은 건드리지 않는다')
      .option('--only-main', '본체만 만들고 하위 테이블(진료과목·진료시간·병상 등)은 건너뛴다')
      .option('--quiet', '진행 로그를 숨긴다')
      .action(async (options: { onlyMain?: boolean; quiet?: boolean }): Promise<void> => {
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

        const seconds = ((result.elapsedMs + (detail?.elapsedMs ?? 0)) / 1000).toFixed(1);

        console.log(
          [
            '통합 병원 빌드 완료',
            `  전체        : ${result.hospitals.toLocaleString()}`,
            `    HIRA+NMC  : ${result.fromBoth.toLocaleString()} (매칭됨)`,
            `    HIRA 만   : ${result.hiraOnly.toLocaleString()}`,
            `    NMC 만    : ${result.nmcOnly.toLocaleString()}`,
            `  병원 아님   : ${result.skippedNonHospital.toLocaleString()} (소방서·구급차 등 제외)`,
            ...(result.merged > 0
              ? [`  합침        : ${result.merged.toLocaleString()} (매칭이 붙어 두 행 → 한 행)`]
              : []),
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
      }),
    ['hansapp-cli healthcare build', 'hansapp-cli healthcare build --only-main'],
  );

  addExamples(
    healthcare
      .command('names')
      .description(
        '병원 이름을 다시 계산한다. legal_name(원문)만 읽어 name·corp_name 을 만든다 — ' +
          '미러가 없어도 돌고, 원문을 건드리지 않아 몇 번을 돌려도 결과가 같다',
      )
      .option('--dry-run', '무엇이 바뀌는지만 보고 쓰지 않는다')
      .option('--quiet', '진행 로그를 숨긴다')
      .action(async (options: { dryRun?: boolean; quiet?: boolean }): Promise<void> => {
        const result = await withAdminContext(
          source,
          (context) => context.get(HealthcareNameBuildService).run({ dryRun: options.dryRun }),
          { verbose: !options.quiet },
        );

        console.log(
          [
            result.dryRun ? '이름 재계산 (dry-run — 아무것도 쓰지 않았다)' : '이름 재계산 완료',
            `  검사      : ${result.scanned.toLocaleString()}`,
            `  변경      : ${result.changed.toLocaleString()}`,
            `  법인 분리 : ${result.withCorp.toLocaleString()}`,
            `  잠금 유지 : ${result.locked.toLocaleString()} (사람이 고친 이름)`,
            `  소요 시간 : ${(result.elapsedMs / 1000).toFixed(1)}초`,
          ].join('\n'),
        );

        if (result.samples.length > 0) {
          console.log(`\n  바뀌는 예시 (앞 ${result.samples.length}건)`);
          for (const s of result.samples) {
            const corp = s.corp ? `   [${s.corp}]` : '';
            console.log(`    ${s.before}  →  ${s.after}${corp}`);
          }
        }
      }),
    ['hansapp-cli healthcare names --dry-run', 'hansapp-cli healthcare names'],
  );

  return healthcare;
}

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/** 한 번의 INSERT 에 담을 행 수 */
const CHUNK_SIZE = 1_000;

/**
 * NMC 병원-진료과목 매핑 저장소. 과목 목록 조회와 역조회 결과 적재를 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다(ON DUPLICATE KEY UPDATE). 서비스는 원본 호출·파싱·루프
 * 같은 오케스트레이션만 하고 SQL 은 만지지 않는다. INSERT 청크 분할도 여기서 처리한다.
 */
@Injectable()
export class NmcSubjectSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 진료과목 코드마스터(D000). 소분류 코드 순으로 정렬해 돌려준다. */
  findSubjects(): Promise<{ cmSid: string; cmSnm: string | null }[]> {
    return this.prisma.nmcCode.findMany({
      where: { cmMid: 'D000' },
      orderBy: { cmSid: 'asc' },
      select: { cmSid: true, cmSnm: true },
    });
  }

  /**
   * 역조회 결과를 적재한다. source='list' 로 남긴다.
   *
   * 나중에 basic(dgidIdName)이 같은 키를 source='basic' 으로 덮어쓴다.
   * 이미 basic 으로 채워진 행을 역조회가 되돌리지 않도록, source 가 'basic' 이면 건드리지 않는다.
   */
  async upsertLinks(hpids: string[], subjectCd: string, subjectNm: string | null): Promise<number> {
    for (let i = 0; i < hpids.length; i += CHUNK_SIZE) {
      const chunk = hpids.slice(i, i + CHUNK_SIZE);

      const values = Prisma.join(
        chunk.map((hpid) => Prisma.sql`(${hpid}, ${subjectCd}, ${subjectNm}, 'list', NOW())`),
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO nmc_hospital_subject
            (hpid, subject_cd, subject_nm, source, synced_at)
          VALUES ${values} AS new
          ON DUPLICATE KEY UPDATE
            subject_nm = new.subject_nm,
            source     = IF(nmc_hospital_subject.source = 'basic', 'basic', new.source),
            synced_at  = NOW()
        `,
      );
    }

    return hpids.length;
  }
}

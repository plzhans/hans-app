import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

const CHUNK_SIZE = 1_000;

/**
 * HIRA 진료과목 매핑 저장소. 코드 축 조회와 매핑 적재를 담당한다.
 *
 * 대량 write 는 raw SQL 그대로다. 서비스는 원본 호출·파싱·루프만 하고 SQL 은 만지지 않는다.
 */
@Injectable()
export class HiraSubjectSyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 돌 축이 되는 진료과목 코드(tp='subject'). */
  findSubjectCodes(): Promise<{ cd: string; cdNm: string | null }[]> {
    return this.prisma.hiraCode.findMany({
      where: { tp: 'subject' },
      orderBy: { cd: 'asc' },
      select: { cd: true, cdNm: true },
    });
  }

  /**
   * source='list' 로 적재한다. 나중에 getSubjectInfo 가 전문의수까지 채우며 덮어쓴다.
   * 이미 'subject' 로 채워진 행은 역조회가 되돌리지 않는다(전문의수를 날리지 않기 위해).
   */
  async upsertSubjects(
    ykihos: string[],
    dgsbjtCd: string,
    dgsbjtNm: string | null,
  ): Promise<void> {
    for (let i = 0; i < ykihos.length; i += CHUNK_SIZE) {
      const chunk = ykihos.slice(i, i + CHUNK_SIZE);

      const values = Prisma.join(
        chunk.map(
          (ykiho) =>
            Prisma.sql`(${ykiho}, ${dgsbjtCd}, ${dgsbjtNm}, 'list', NOW())`,
        ),
      );

      await this.prisma.$executeRaw(
        Prisma.sql`
          INSERT INTO hira_hospital_subject
            (ykiho, dgsbjt_cd, dgsbjt_nm, source, synced_at)
          VALUES ${values} AS new
          ON DUPLICATE KEY UPDATE
            dgsbjt_nm = new.dgsbjt_nm,
            source    = IF(hira_hospital_subject.source = 'subject', 'subject', new.source),
            synced_at = NOW()
        `,
      );
    }
  }
}

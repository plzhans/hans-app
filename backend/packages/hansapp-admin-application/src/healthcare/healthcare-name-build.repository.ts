import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/** 재계산 대상 한 행. legal_name 만 있으면 이름을 다시 만들 수 있다. */
export interface NameRow {
  id: number;
  name: string;
  legalName: string;
  corpName: string | null;
}

/** 반영할 값. legal_name 은 여기 없다 — 이 명령은 원문을 안 건드린다. */
export interface NameUpdate {
  id: number;
  name: string;
  corpName: string | null;
}

const CHUNK = 1000;

/** 병원 이름 재계산 저장소. 읽기 한 번과 CASE WHEN 벌크 UPDATE 가 전부다. */
@Injectable()
export class HealthcareNameBuildRepository {
  constructor(private readonly prisma: PrismaService) {}

  loadAll(): Promise<NameRow[]> {
    return this.prisma.healthcareHospital.findMany({
      select: { id: true, name: true, legalName: true, corpName: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * CASE WHEN 한 문장으로 묶어 쓴다. 행마다 UPDATE 를 날리면 왕복이 수천 번이 된다.
   *
   * corp_name 은 NULL 이 될 수 있어서 CASE 에 그대로 담는다 — 규칙이 법인명을 못 가르게
   * 바뀌었으면 기존 값을 지워야 한다. 안 그러면 옛 규칙의 흔적이 남는다.
   */
  async apply(updates: NameUpdate[]): Promise<void> {
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);

      const nameCase = Prisma.join(
        chunk.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.name}`),
        ' ',
      );
      const corpCase = Prisma.join(
        chunk.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.corpName}`),
        ' ',
      );
      const ids = Prisma.join(chunk.map((u) => u.id));

      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE healthcare_hospital
           SET name      = CASE id ${nameCase} END,
               corp_name = CASE id ${corpCase} END
         WHERE id IN (${ids})
      `);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapi/data';

import type { MatchDecision } from './hira-nmc-match.service';

/** 후보 저장 한 줄(hira_nmc_match_candidate). review 인 판정에서만 나온다. */
export interface MatchCandidateRow {
  ykiho: string;
  hpid: string;
  rank: number;
  score: number;
  nameSim: number;
  distanceM: number | null;
}

/**
 * HIRA ↔ NMC 매칭 저장소. 매칭 키(이름·전화·좌표) 로딩과 판정 결과 저장만 담당한다.
 *
 * 유사도·블로킹·판정 같은 알고리즘은 전부 서비스에 있다. 이 리포는 목록 API 원문(JSON)에서
 * 키를 뽑아 오고, 서비스가 만든 판정 배열을 raw SQL·prisma 로 적재한다 — 벌크 write 는
 * ON DUPLICATE KEY 라 raw SQL 그대로다. snake_case 컬럼명은 DB 실컬럼이라 손대지 않는다.
 */
@Injectable()
export class HiraNmcMatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** HIRA 목록 원문(JSON)에서 매칭 키를 뽑는다. 정규화·좌표 변환은 서비스가 한다. */
  loadHiraRows() {
    return this.prisma.$queryRaw<
      {
        ykiho: string;
        nm: string | null;
        tel: string | null;
        lat: number | null;
        lon: number | null;
      }[]
    >(Prisma.sql`
      SELECT ykiho,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.yadmNm')) nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.telno'))  tel,
             JSON_EXTRACT(data, '$.YPos') lat,
             JSON_EXTRACT(data, '$.XPos') lon
        FROM hira_hospital
    `);
  }

  /** NMC 목록 원문(JSON)에서 매칭 키를 뽑는다. 정규화·좌표 변환은 서비스가 한다. */
  loadNmcRows() {
    return this.prisma.$queryRaw<
      {
        hpid: string;
        nm: string | null;
        tel: string | null;
        lat: number | null;
        lon: number | null;
      }[]
    >(Prisma.sql`
      SELECT hpid,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyName')) nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyTel1')) tel,
             JSON_EXTRACT(data, '$.wgs84Lat') lat,
             JSON_EXTRACT(data, '$.wgs84Lon') lon
        FROM nmc_hospital
    `);
  }

  /** 이미 확정된 링크(hira_nmc_link). 재매칭에서 건너뛸 대상을 서비스가 여기서 고른다. */
  loadLinks() {
    return this.prisma.hiraNmcLink.findMany({
      select: { ykiho: true, hpid: true, confirmedBy: true },
    });
  }

  /** 사람이 거부한 (ykiho, hpid) 쌍. 후보에서 뺄 대상이다. */
  loadRejected() {
    return this.prisma.hiraNmcMatch.findMany({
      where: { status: 'rejected' },
      select: { ykiho: true, hpid: true },
    });
  }

  /** 판정 결과를 hira_nmc_match 에 벌크 upsert 한다(재판정이면 덮어쓴다). */
  async upsertMatches(chunk: MatchDecision[]): Promise<void> {
    const matchValues = Prisma.join(
      chunk.map(
        (d) =>
          Prisma.sql`(${d.ykiho}, ${d.hpid}, ${d.status}, ${d.rule}, ${d.score}, ${d.nameSim}, ${d.distance}, NOW())`,
      ),
    );
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO hira_nmc_match
        (ykiho, hpid, status, rule, score, name_sim, distance_m, evaluated_at)
      VALUES ${matchValues} AS new
      ON DUPLICATE KEY UPDATE
        hpid = new.hpid, status = new.status, rule = new.rule,
        score = new.score, name_sim = new.name_sim, distance_m = new.distance_m,
        evaluated_at = NOW()
    `);
  }

  /**
   * 확정된 판정을 hira_nmc_link 에 auto 로 벌크 upsert 한다.
   * manual 로 확정된 행은 건드리지 않는다(사람이 정한 것이다).
   */
  async upsertLinks(confirmed: MatchDecision[]): Promise<void> {
    const linkValues = Prisma.join(
      confirmed.map(
        (d) => Prisma.sql`(${d.ykiho}, ${d.hpid}, 'auto', ${d.rule}, NOW())`,
      ),
    );
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO hira_nmc_link (ykiho, hpid, confirmed_by, rule, linked_at)
      VALUES ${linkValues} AS new
      ON DUPLICATE KEY UPDATE
        hpid         = IF(hira_nmc_link.confirmed_by = 'manual', hira_nmc_link.hpid, new.hpid),
        rule         = IF(hira_nmc_link.confirmed_by = 'manual', hira_nmc_link.rule, new.rule),
        confirmed_by = hira_nmc_link.confirmed_by
    `);
  }

  /** 해당 ykiho 들의 기존 후보를 지운다. 다시 만들기 전 정리다. */
  async deleteCandidates(ykihos: string[]): Promise<void> {
    await this.prisma.hiraNmcMatchCandidate.deleteMany({
      where: { ykiho: { in: ykihos } },
    });
  }

  /** review 후보들을 새로 적재한다. */
  async createCandidates(rows: MatchCandidateRow[]): Promise<void> {
    await this.prisma.hiraNmcMatchCandidate.createMany({ data: rows });
  }

  /** 상태별 집계 (CLI status). 매핑·정렬은 서비스가 한다. */
  countByStatus() {
    return this.prisma.hiraNmcMatch.groupBy({
      by: ['status'],
      _count: { status: true },
    });
  }
}

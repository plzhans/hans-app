import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

/**
 * 병원 다국어 원문(healthcare_hospital_i18n) 추출 저장소. 번역할 게 남은 행만 읽어 온다.
 *
 * WHERE 절과 MD5 해시 계산이 이 리포의 전부다 — 재번역 판정을 서비스가 아니라 SQL 에 둔 이유가
 * 여기 담겨 있다. 서비스는 스트리밍·파일 쓰기·필드 가공 같은 오케스트레이션만 하고 SQL 은 안 만진다.
 */
@Injectable()
export class HospitalI18nExportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 번역할 게 하나라도 남은 병원만 읽는다.
   *
   * WHERE 절의 OR 여섯 줄이 곧 "번역 대상" 의 정의다. 이 조건을 서비스 코드가 아니라 SQL 에
   * 둔 이유는 두 번째 실행부터 **네트워크로 안 넘겨도 되는 행을 안 넘기기** 위해서다.
   * 8만 병원 중 실제로 재번역할 게 열 건이면 열 행만 온다.
   *
   * **해시는 MySQL 이 계산한다(MD5(h.name)).** 재번역 판정도 `i.name_src <> MD5(h.name)` 로
   * MySQL 이 계산하므로 계산하는 쪽을 하나로 둔다. `CAST(… AS CHAR)` 를 씌우지 않으면 Prisma 가
   * MD5 결과를 Bytes 로 보고 Buffer 를 준다.
   *
   * engine='human' 은 사람이 고친 번역이라 건드리지 않는다.
   * attempt_count>=3 은 이미 세 번 실패한 것이다 — 계속 재시도하면 돈만 태운다.
   */
  loadPending(lang: string, cursor: number, take: number): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT h.id,
             h.name,       CAST(MD5(h.name) AS CHAR)       AS name_md5,
             h.intro,      CAST(MD5(h.intro) AS CHAR)      AS intro_md5,
             h.notice,     CAST(MD5(h.notice) AS CHAR)     AS notice_md5,
             h.directions, CAST(MD5(h.directions) AS CHAR) AS directions_md5,
             h.park_note,  CAST(MD5(h.park_note) AS CHAR)  AS park_note_md5,
             h.transport,  CAST(MD5(h.transport) AS CHAR)  AS transport_md5,
             i.name       AS t_name,       i.name_src,
             i.intro      AS t_intro,      i.intro_src,
             i.notice     AS t_notice,     i.notice_src,
             i.directions AS t_directions, i.directions_src,
             i.park_note  AS t_park_note,  i.park_note_src,
             i.transport  AS t_transport,  i.transport_src
        FROM healthcare_hospital h
        LEFT JOIN healthcare_hospital_i18n i
               ON i.hospital_id = h.id AND i.lang = ${lang}
       WHERE h.status = 'active'
         AND h.id > ${cursor}
         AND COALESCE(i.engine, '') <> 'human'
         AND COALESCE(i.attempt_count, 0) < 3
         AND (
              (h.name       IS NOT NULL AND (i.name       IS NULL OR i.name_src       <> MD5(h.name)))
           OR (h.intro      IS NOT NULL AND (i.intro      IS NULL OR i.intro_src      <> MD5(h.intro)))
           OR (h.notice     IS NOT NULL AND (i.notice     IS NULL OR i.notice_src     <> MD5(h.notice)))
           OR (h.directions IS NOT NULL AND (i.directions IS NULL OR i.directions_src <> MD5(h.directions)))
           OR (h.park_note  IS NOT NULL AND (i.park_note  IS NULL OR i.park_note_src  <> MD5(h.park_note)))
           OR (h.transport  IS NOT NULL AND (i.transport  IS NULL OR i.transport_src  <> MD5(h.transport)))
         )
       ORDER BY h.id
       LIMIT ${take}
    `);
  }
}

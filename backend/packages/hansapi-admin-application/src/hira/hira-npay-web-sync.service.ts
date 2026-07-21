import { Injectable, Logger } from '@nestjs/common';
import {
  JOB_NPAY_WEB,
  JobQueueService,
  type NpayWebItem,
  type NpayWebRecord,
} from '@hansapi/application';
import { HiraNpayClient, HiraWebError, type NpayItem } from '@kr-or/hira';

import { HiraNpayWebSyncRepository } from './hira-npay-web-sync.repository';
import { NpayCodeRow } from './hira-npay-code.upsert';

/**
 * 기관 단위로 반복돼서 저장하지 않는 필드.
 * 전부 hira_hospital 에 이미 있고, 한 기관에 수백 행이라 그대로 두면 그만큼 복제된다
 * (중앙대병원 실측 16% 절감). ykiho 만 봉투 위로 올린다.
 */
const HOSPITAL_FIELDS = ['ykiho', 'yadmNm', 'clCd', 'clCdNm'] as const;

/**
 * 심평원 홈페이지 비급여를 hira_hospital_detail(op='npay-web')에 적재한다.
 *
 * **이 계층에 있는 이유가 있다.** 외부 호출은 admin 의 몫이고 서버는 로컬 DB 만 읽는다
 * (admin-application.module.ts). 사용자가 갱신을 요청하면 서버는 job_queue 에 마킹만 하고,
 * 실제 크롤은 여기서 일어난다 — 배치(지금은 hansapi-cli)가 큐를 꺼내 이 서비스를 부른다.
 *
 * **이 데이터의 존재 이유는 의원(clCd=31)이다.** 공개 API(hira_hospital_npay)는 의료법
 * 제45조의2 공개 대상인 병원급 이상만 준다.
 *
 * **법무 확인 전이다** — 심평원 홈페이지 이용약관 제10조 ①2(제3자 제공)·⑨(상업적 이용).
 * clients/kr-or-hira/README.md 를 먼저 읽어라. 크롤 자체는 약관의 크롤러 조항에 걸리지 않지만
 * (로그인·개인정보가 없다) 수집 후 용도가 쟁점이다.
 */
@Injectable()
export class HiraNpayWebSyncService {
  private readonly logger = new Logger(HiraNpayWebSyncService.name);

  /** 클라이언트가 설정을 안 받는다 — 서비스키도 쿼터도 없고 1초 rate gate 가 기본이다. */
  private readonly client = new HiraNpayClient();

  constructor(
    private readonly repo: HiraNpayWebSyncRepository,
    private readonly jobs: JobQueueService,
  ) {}

  /**
   * 큐에서 하나 꺼내 처리한다. 없으면 null.
   *
   * **실패해도 큐에 사유가 남는다.** 크롤은 마크업이 바뀌면 터지므로(HiraWebError) 그 메시지가
   * 남아야 원인을 찾는다. 던지지 않고 failed 로 기록하는 이유는 배치가 한 건 때문에 멈추면 안 되어서다.
   */
  async processNext(): Promise<{ ykiho: string; count: number } | null> {
    const job = await this.jobs.claim(JOB_NPAY_WEB);
    if (!job) {
      return null;
    }

    try {
      const count = await this.crawl(job.target);
      await this.jobs.succeed(job.id);
      this.logger.log(`비급여 크롤 완료 ykiho=${job.target} ${count}건`);
      return { ykiho: job.target, count };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.jobs.fail(job.id, message);
      this.logger.error(`비급여 크롤 실패 ykiho=${job.target}: ${message}`);
      return { ykiho: job.target, count: -1 };
    }
  }

  /**
   * 기관 하나를 긁어 저장한다. 반환값은 저장한 항목 수.
   *
   * **0건도 행으로 남긴다.** 그래야 "안 긁음(행 없음)" 과 "긁었는데 신고한 게 없음" 이 갈린다.
   * getClinicTop5 가 쓰는 규칙과 같다 — 재조회를 막는 것이 목적이다.
   */
  async crawl(encryptedYkiho: string): Promise<number> {
    const result = await this.client.listNonPaymentItems(encryptedYkiho);
    const record = toRecord(result.hospitalId, result.items);

    await this.repo.storeDetail(encryptedYkiho, record);

    // **코드마스터도 같이 채운다(계획 4단계).** 크롤 응답엔 분류코드가 다 있으니, 요약(List2)에
    // 없는 의원 전용 코드가 여기서 보완된다. 분류코드는 upsert 가 '있을 때만' 갱신하므로
    // 요약이 먼저 채운 값을 덮지 않는다. 실패해도 크롤 본체(위)는 이미 저장됐다.
    await this.repo.upsertCodes(result.items.map(toCodeRow));

    return record.npayPubList.length;
  }
}

/**
 * 응답 item 을 저장 모양으로 바꾼다. **값은 손대지 않는다** — 기관 단위 필드만 뺀다.
 *
 * 정규화하지 않는 이유는 공개 API 가 아니라 구조 보증이 없어서다. 사이트가 모양을 바꾸면
 * 원본이 남아 있어야 다시 매핑할 수 있다(clients/kr-or-hira/src/types.ts 와 같은 판단).
 */
function toRecord(hospitalId: string, items: NpayItem[]): NpayWebRecord {
  return {
    ykiho: hospitalId,
    npayPubList: items.map(strip).map(assertShape),
  };
}

/**
 * 크롤 item → 코드마스터 행. 크롤엔 분류코드가 다 있어(요약과 같은 npayMdivCd/npaySdivCd)
 * 그대로 옮긴다. 이름은 npayCdNm(요약의 npayKorNm 과 같은 슬래시 결합 형식)을 쓴다.
 */
function toCodeRow(item: NpayItem): NpayCodeRow {
  return {
    cd: item.npayCd,
    cdNm: item.npayCdNm,
    sdivCd: item.npaySdivCd || null,
    sdivNm: item.npaySdivCdNm || null,
    mdivCd: item.npayMdivCd || null,
    mdivNm: item.npayMdivCdNm || null,
  };
}

function strip(item: NpayItem): NpayWebItem {
  const copy: Record<string, unknown> = { ...item };
  for (const key of HOSPITAL_FIELDS) {
    delete copy[key];
  }
  return copy as unknown as NpayWebItem;
}

/**
 * 아는 모양이 아니면 저장하지 않는다.
 *
 * **버전을 찍는 대신 게이트를 둔다.** 우리가 붙이는 버전은 사이트가 조용히 바뀌면 옛 딱지를
 * 새 구조에 찍어 정작 필요할 때 거짓말을 한다. 대신 여기서 터뜨리면 DB 에 아는 모양만 들어오고,
 * 구조가 바뀌는 순간 조용한 오염 대신 시끄러운 실패가 난다.
 * (step1 의 HOSPITAL_ID_PATTERN 이 마크업에 대해 하는 일과 같다.)
 *
 * "언제 받았나" 는 synced_at 이 이미 기록한다 — 우리가 지어낸 버전보다 정직하다.
 */
function assertShape(item: NpayWebItem): NpayWebItem {
  const bad =
    typeof item.npayCd !== 'string' ||
    typeof item.minPrc !== 'number' ||
    typeof item.maxPrc !== 'number';

  if (bad) {
    throw new HiraWebError(
      `비급여 item 의 모양이 다르다 (응답 구조가 바뀌었는지 확인하라): ${JSON.stringify(item).slice(0, 300)}`,
      'SHAPE',
    );
  }
  return item;
}

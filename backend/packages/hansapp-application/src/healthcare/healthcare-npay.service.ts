import { Injectable } from '@nestjs/common';
import type { NonPaymentDetailItem } from '@krdata/hira';

import { asString } from '../common/coerce';
import { JOB_NPAY_WEB, JobQueueService } from '../common/job-queue.service';
import {
  HospitalNonPayment,
  NonPaymentCategory,
  NonPaymentItem,
  NonPaymentPriceDetail,
} from './dto/npay.result';
import { HealthcareNonPaymentRepository } from './healthcare-npay.repository';
import type { NpayWebItem, NpayWebRecord } from './npay-web.record';

/** hira_hospital_detail 의 op. 크롤 비급여만 출처가 공개 API 가 아니다. */
const OP_NPAY_WEB = 'npay-web';

/**
 * 통합 비급여 진료비 조회.
 *
 * **읽기에서만 미러(hira_hospital_npay·hira_hospital_detail)를 본다.** 비급여는 의료법
 * 제45조의2 로 심평원이 공개하는 HIRA 전용 개념이라 통합할 상대(NMC)가 없다. healthcare_* 로
 * 올려도 추상화되는 게 없어 미러를 그대로 읽는다. HealthcareHospitalService 의 assessment 와 같은 예외다.
 *
 * **출처가 둘이고, 화면은 그걸 모른다.**
 *   병원급  공개 API(hira_hospital_npay). 행마다 단일 금액(curAmt) → 모아서 범위를 만든다.
 *   의원급  심평원 홈페이지 크롤(hira_hospital_detail op='npay-web'). 이미 범위(minPrc~maxPrc).
 * 공개 API 는 병원급 이상만 준다(의료법 공개 대상). 의원급은 홈페이지에만 있다.
 *
 * **크롤은 여기서 하지 않는다.** 이 계층은 외부를 호출하지 않는다 — 사용자가 갱신을 요청하면
 * job_queue 에 넣고, 배치(지금은 hansapp-cli)가 꺼내 처리한다.
 *
 * **페이지가 없다. 기관 전건을 한 번에 돌려준다.** 그룹핑을 서버가 하므로 페이지로 자르면
 * 그룹이 경계에서 갈라진다. 크롤도 전건이 한 번에 온다.
 */
@Injectable()
export class HealthcareNonPaymentService {
  constructor(
    private readonly repo: HealthcareNonPaymentRepository,
    private readonly jobs: JobQueueService,
  ) {}

  /**
   * 병원이 없으면 null 이다(컨트롤러가 404 로 만든다).
   *
   * **없는 것과 못 찾은 것은 다르다.** 비급여를 신고하지 않은 병원은 정상적으로 빈 categories 다.
   * 그때 source 가 왜 비었는지를 말해준다 — none(받아봤는데 없음) / requestable(아직 안 받아봄).
   */
  async get(hospitalId: number): Promise<HospitalNonPayment | null> {
    const hospital = await this.repo.findHospitalYkiho(hospitalId);

    if (!hospital) {
      return null;
    }
    // NMC 에만 있는 병원. 크롤 step1 이 암호화 요양기호를 요구하므로 요청조차 불가능하다.
    if (!hospital.ykiho) {
      return { source: 'unavailable', categories: [] };
    }

    const hira = await this.fromHira(hospital.ykiho);
    if (hira) {
      return hira;
    }
    return this.fromWeb(hospital.ykiho);
  }

  /** 갱신 요청을 큐에 넣는다. **크롤하지 않는다** — 배치가 꺼내 간다. */
  async request(hospitalId: number): Promise<'queued' | 'unavailable' | null> {
    const hospital = await this.repo.findHospitalYkiho(hospitalId);

    if (!hospital) {
      return null;
    }
    if (!hospital.ykiho) {
      return 'unavailable';
    }

    await this.jobs.enqueue(JOB_NPAY_WEB, hospital.ykiho);
    return 'queued';
  }

  /** 공개 API 미러. 전건이다 — sno 가 심평원이 매긴 게시 순서라 그 순서가 곧 화면 순서다. */
  private async fromHira(ykiho: string): Promise<HospitalNonPayment | null> {
    const rows = await this.repo.findHiraNpay(ykiho);

    if (rows.length === 0) {
      return null;
    }

    const items = rows.map((row) => row.data as NonPaymentDetailItem);

    // 상세(Dtl)엔 분류코드가 없다. 코드마스터에서 npayCd → 중분류코드를 끌어와 붙인다.
    // (크롤 경로는 분류코드가 응답에 있어 조회가 필요 없다.)
    const codeMdiv = await this.codeToMdiv(
      items
        .map((item) => asString(item.npayCd))
        .filter((cd): cd is string => !!cd),
    );

    return {
      source: 'hira',
      noticeUrl: items.find((item) => item.urlAddr)?.urlAddr,
      categories: groupHira(items, codeMdiv),
    };
  }

  /** npayCd → 중분류코드 사전. hira_npay_code 에서 한 번에 끌어온다. */
  private async codeToMdiv(codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) {
      return new Map();
    }
    const rows = await this.repo.findNpayCodeMdiv(codes);
    return new Map(
      rows
        .filter((r): r is { cd: string; mdivCd: string } => !!r.mdivCd)
        .map((r) => [r.cd, r.mdivCd]),
    );
  }

  /**
   * 크롤 미러. **행이 없으면 아직 안 긁은 것**이다(hira_hospital_detail 의 규칙).
   * 그때만 갱신 요청이 의미가 있으므로, 큐에 걸린 요청이 있으면 그 상태를 함께 알려준다.
   */
  private async fromWeb(ykiho: string): Promise<HospitalNonPayment> {
    const row = await this.repo.findWebDetail(ykiho, OP_NPAY_WEB);

    if (row) {
      const record = row.data as unknown as NpayWebRecord;
      const items = record.npayPubList ?? [];
      // 긁었는데 그 기관이 신고한 게 없다. 끝이다 — 다시 요청해봐야 같다.
      return items.length === 0
        ? { source: 'none', categories: [] }
        : { source: 'web', categories: groupWeb(items) };
    }

    const job = await this.jobs.find(JOB_NPAY_WEB, ykiho);
    return {
      source: 'requestable',
      // done 은 알릴 이유가 없다 — 처리가 끝났으면 위에서 row 를 찾았어야 한다.
      // (done 인데 row 가 없다면 그건 처리가 잘못된 것이므로 requestable 로 두어 다시 요청하게 한다.)
      requestStatus: job && job.status !== 'done' ? job.status : undefined,
      categories: [],
    };
  }
}

/**
 * 공개 API: 대분류 → 표준코드로 묶는다. **순서를 바꾸지 않는다** — Map 이 삽입 순서를 지키므로
 * sno 정렬이 그대로 살아 있다.
 *
 * 원본에 분류 코드가 없어서 이름을 잘라 대분류를 만든다. (크롤은 npayMdivCdNm 을 그냥 준다 —
 * 두 값이 345/345 일치하는 것을 확인했다.)
 */
function groupHira(
  items: NonPaymentDetailItem[],
  codeMdiv: Map<string, string>,
): NonPaymentCategory[] {
  type ByCode = Map<string, NonPaymentDetailItem[]>;
  const categories = new Map<string, ByCode>();

  for (const item of items) {
    const name = (item.npayKorNm ?? '').split('/')[0] || '';
    const byCode: ByCode =
      categories.get(name) ?? new Map<string, NonPaymentDetailItem[]>();
    /*
      **npayCd 는 number 와 string 이 섞여 온다** — 코드가 전부 숫자면 JSON number 로 뭉개진다
      (480510000 vs 'ABZ010001'). 문자열로 맞추지 않으면 같은 항목이 두 줄로 갈라진다.
      코드가 없으면 묶을 수 없으니 원본 행을 잃지 않도록 sno 로 혼자 세운다.
    */
    const key = asString(item.npayCd) ?? `sno:${item.sno}`;

    const bucket = byCode.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      byCode.set(key, [item]);
    }
    categories.set(name, byCode);
  }

  return [...categories].map(([name, byCode]) => {
    // 이 중분류의 대표 npayCd 하나로 중분류코드를 찾는다(중분류명↔코드는 1:1).
    const realCode = [...byCode.keys()].find((k) => !k.startsWith('sno:'));
    return {
      name,
      mdivCd: realCode ? codeMdiv.get(realCode) : undefined,
      items: [...byCode].map(([code, rows]) => hiraItem(code, rows)),
    };
  });
}

/**
 * 원본 행들을 항목 하나로 접는다.
 *
 * **공개 API 는 범위를 주지 않는다** — 행마다 단일 금액(curAmt)뿐이라 여기서 min/max 를 계산하고
 * 원본 행을 details 로 남긴다. 크롤은 반대로 범위가 원본에 있고 details 가 빈다.
 */
function hiraItem(code: string, rows: NonPaymentDetailItem[]): NonPaymentItem {
  const amounts = rows.map((item) => item.curAmt ?? 0);
  const full = rows[0].npayKorNm ?? '';

  return {
    code,
    name: full.split('/').slice(1).join(' · ') || full,
    price: {
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      details: rows.map(toDetail),
    },
  };
}

function toDetail(item: NonPaymentDetailItem): NonPaymentPriceDetail {
  return { name: item.yadmNpayCdNm, amount: item.curAmt ?? 0 };
}

/**
 * 크롤: 같은 결과를 만든다. 다만 **일이 훨씬 적다** —
 *   · 대분류가 코드로 온다(npayMdivCdNm). 이름을 자를 필요가 없다.
 *   · 코드가 기관 안에서 유니크하다(346/346 실측). 묶을 필요가 없다.
 *   · 범위가 이미 있다(minPrc~maxPrc). 계산할 필요가 없다.
 * 대신 **details 가 빈다** — 원본에 개별 행이라는 해상도 자체가 없다. 화면은 그때 범위만 그린다.
 */
function groupWeb(items: NpayWebItem[]): NonPaymentCategory[] {
  // 크롤은 분류코드가 응답에 있어(npayMdivCd) 조회가 필요 없다 — 그대로 담는다.
  const categories = new Map<
    string,
    { mdivCd?: string; list: NonPaymentItem[] }
  >();

  // 원본이 매긴 게시 순서. 공개 API 의 sno 와 같은 역할이다.
  for (const item of [...items].sort((a, b) => a.sortOrd - b.sortOrd)) {
    const name = item.npayMdivCdNm || '';
    const cat = categories.get(name) ?? {
      mdivCd: item.npayMdivCd || undefined,
      list: [],
    };
    cat.list.push(webItem(item));
    categories.set(name, cat);
  }

  return [...categories].map(([name, cat]) => ({
    name,
    mdivCd: cat.mdivCd,
    items: cat.list,
  }));
}

function webItem(item: NpayWebItem): NonPaymentItem {
  const full = item.npayCdNm ?? '';
  return {
    code: item.npayCd,
    name: full.split('/').slice(1).join(' · ') || full,
    price: { min: item.minPrc, max: item.maxPrc, details: [] },
  };
}

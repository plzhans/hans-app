import { BatchCategory } from '@hansapp/common';

/**
 * 이 배치가 돌리는 잡의 목록. **이름·설명·분류·기본 주기의 정본이다.**
 *
 * 스케줄러 등록명·Sentry 감시 이름·batch_job 의 키가 전부 여기 한 값을 본다 — 여러 곳에
 * 문자열을 따로 박으면 한쪽만 바뀌어 조용히 어긋난다.
 *
 * ## 잡을 무엇 단위로 자르나
 *
 * **다루는 대상으로 자른다. 도는 시각으로 자르지 않는다.** 예전에 `daily-sync` 하나가
 * 세 기관을 순서대로 돌렸는데, 그 이름은 두 가지가 틀렸다:
 *
 *   1. **주기는 설정값이다.** `daily-` 는 크론식을 하루 두 번으로 바꾸는 순간 거짓이 된다.
 *      이름은 설정으로 바뀌는 것을 말하면 안 된다.
 *   2. **한 덩어리라 따로 다룰 수 없었다.** HIRA 만 다시 돌리거나, NMC 만 주기를 늘리거나,
 *      "심평원이 어제 몇 시에 돌았나" 를 묻는 일이 전부 막혀 있었다. 원본이 다르면
 *      갱신주기도 한도도 장애도 따로 논다 — 잡도 따로여야 한다.
 *
 * **각 잡은 독립이다.** 자기 크론으로 자기 시각에 돌고, 자기 이력을 갖는다.
 * 아래 기본 주기는 서로를 기다리게 만드는 장치가 아니라 **부하를 흩는 관례**일 뿐이다 —
 * healthcare 가 hira 보다 먼저 돌아도 실패하지 않는다. 그날 DB 에 있는 것으로 만들 뿐이다.
 */
export interface BatchJobDefinition {
  /** 스케줄러 등록명이자 batch_job 의 키 */
  readonly name: BatchJobName;

  /** 콘솔에 그대로 보이는 한 줄 설명 */
  readonly description: string;

  /** 콘솔이 목록을 묶는 기준 */
  readonly category: BatchCategory;

  /**
   * 설정이 없을 때 쓸 주기.
   *
   * **정본은 설정이다**(`apps-batch.jobs.<name>.cron`). 여기 값은 아무것도 안 적었을 때의
   * 출발점이고, 시각을 흩어 놓은 것은 외부 API 와 DB 에 동시에 몰리지 않게 하려는 것뿐이다.
   */
  readonly defaultCron: string;
}

/** 잡 이름. 새 잡을 넣으면 여기와 BATCH_JOBS 두 곳만 고치면 된다. */
export const BATCH_JOB_NAMES = [
  'mois',
  'hira',
  'nmc',
  'healthcare',
  'es-index',
  'auth-cleanup',
] as const;
export type BatchJobName = (typeof BATCH_JOB_NAMES)[number];

export const BATCH_JOBS: readonly BatchJobDefinition[] = [
  {
    /*
      지역 정본. **다른 적재가 이 값을 기준으로 지역을 매긴다** — HIRA(코드)와 NMC(이름)가
      서로 다른 방식으로 주는 지역을 우리 코드로 옮길 때 여기가 기준이다. 그래서 맨 앞이다.
      전량이 21콜 / 9초라 앞에 세우는 비용이 사실상 없다.
    */
    name: 'mois',
    description: '법정동코드 적재 — 지역 정본. 병원 적재가 이 값으로 지역을 매긴다',
    category: BatchCategory.HEALTHCARE,
    defaultCron: '0 3 * * *',
  },
  {
    name: 'hira',
    description: '건강보험심사평가원(data.go.kr) 동기화 — 목록·상세를 단계 순서대로',
    category: BatchCategory.HEALTHCARE,
    defaultCron: '0 4 * * *',
  },
  {
    /*
      **NMC 와 HIRA 는 서로를 기다리지 않는다.** 서비스키도 일일 한도도 별개라 한쪽이
      한도에 걸려 멈춰도 다른 쪽은 제 시각에 제 몫을 받는다. 한 시간 벌려 둔 것은
      두 원본을 동시에 두드리지 않으려는 것뿐이다.
    */
    name: 'nmc',
    description: '국립중앙의료원 동기화 — 목록·상세를 단계 순서대로',
    category: BatchCategory.HEALTHCARE,
    defaultCron: '0 5 * * *',
  },
  {
    /*
      **API 콜이 0이다.** HIRA·NMC 가 받아 둔 것을 DB 안에서 맞춰 붙이는 계산이라
      외부 한도와 무관하다. 앞의 둘이 끝난 뒤에 도는 것이 자연스러워 뒤에 뒀지만,
      먼저 돌아도 깨지지 않는다 — 그날 DB 에 있는 것으로 만들 뿐이다.
    */
    name: 'healthcare',
    description: 'HIRA·NMC 매칭 후 통합 병원 데이터 생성 — 외부 API 를 부르지 않는다',
    category: BatchCategory.HEALTHCARE,
    defaultCron: '0 6 * * *',
  },
  {
    /*
      **헬스케어 다음이다.** 색인은 통합 병원을 읽어 문서를 만드므로, 그것이 갱신된 뒤에
      돌아야 한다. 먼저 돌면 어제 데이터를 색인한다(깨지진 않고 하루 낡을 뿐이다).

      **전량을 다시 색인한다.** 증분으로 바꾸려면 "무엇이 바뀌었나" 를 알아야 하는데,
      ES 문서는 헬스케어 표만으로 만들어지지 않는다 — 병원평가(hira_hospital_asm)와
      번역(healthcare_hospital_i18n)이 색인 시점에 조인된다. 그 둘은 헬스케어 빌드를
      안 거쳐서, 헬스케어 변경분만 보면 **평가등급이 바뀐 병원을 영영 놓친다.**
      문서에 필드를 더할 때마다 조건도 같이 고쳐야 하고, 빠뜨리면 오류 없이 조용히 낡는다.
      전량은 그 문제가 구조적으로 없다 — 실측 64초다.
    */
    name: 'es-index',
    description: '통합 병원을 검색 색인에 반영 — 전량 재색인 + 사라진 문서 정리',
    category: BatchCategory.HEALTHCARE,
    defaultCron: '30 6 * * *',
  },
  {
    /*
      **적재와 완전히 다른 일이다.** 공공데이터 적재는 외부 한도를 나눠 쓰는 파이프라인이고
      이쪽은 우리 DB 만 만진다. 적재가 길어지거나 실패해도 정리는 제 시각에 돌아야 한다.
    */
    name: 'auth-cleanup',
    description: '만료된 세션·인가코드·이메일 인증 정리 + 고아 세션 캐시 제거',
    category: BatchCategory.AUTH,
    defaultCron: '0 7 * * *',
  },
];

/** 이름으로 찾는다. 없는 이름이면 undefined. */
export function findBatchJob(name: string): BatchJobDefinition | undefined {
  return BATCH_JOBS.find((job) => job.name === name);
}

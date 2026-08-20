/**
 * 배치 실행의 값 목록.
 *
 * **DB enum 을 쓰지 않는다.** 값 하나 늘 때마다 ALTER TABLE 이 따라오고, 코드는 새 값을
 * 아는데 DB 는 모르는 구간이 배포 사이에 생긴다. 허용 값은 이 파일이 정한다.
 * (→ board-codes.ts 와 같은 규칙)
 *
 * ## 표에 따라 담는 모양이 다르다
 *
 *  - batch_job · sync_state   몇 행뿐인 현황판이라 **이름(문자열)** 을 담는다.
 *                             DB 를 열어 봤을 때 바로 읽힌다.
 *  - *_history                계속 쌓이는 표라 **숫자 코드(TINYINT)** 로 담는다.
 *
 * 그래서 **enum 하나가 두 모양을 다 낸다.** 숫자 enum 은 양방향 색인을 스스로 갖는다 —
 * `BatchRunStatus.DONE === 3`, `BatchRunStatus[3] === 'DONE'`. 이력에는 값을,
 * 마스터에는 이름을 넣는다. 값의 정본이 한 곳이라 둘이 어긋날 수 없다.
 *
 * ```
 * DB (이력)     3
 * DB (마스터)   "DONE"
 * 코드          BatchRunStatus.DONE === 3
 * JSON         "DONE"        ← @EnumField 가 바꾼다
 * ```
 *
 * **값을 바꾸거나 다시 매기지 말 것.** 이미 쌓인 행이 그 숫자를 들고 있다.
 */

/** 어떻게 불렸나. */
export enum BatchRunSource {
  /** 배치 상주 프로세스의 크론 */
  CRON = 1,
  /** 배치 --once. 사람이 손으로 부르거나 외부 스케줄러(k8s CronJob)가 부른다 */
  ONCE = 2,
  /** hanscli */
  CLI = 3,
  /** 관리자 화면 (아직 없음) */
  ADMIN = 4,
}

/**
 * 실행 상태.
 *
 * **0 을 쓰지 않는다** — 숫자 0 은 falsy 라 `if (status)` 가 조용히 어긋난다.
 *
 * PARTIAL 은 sync_state 와 같은 뜻이다 — 성공했지만 남은 작업이 있다.
 * IDLE 은 **마스터에만** 나온다(등록만 되고 아직 한 번도 안 돈 잡).
 */
export enum BatchRunStatus {
  IDLE = 1,
  RUNNING = 2,
  DONE = 3,
  PARTIAL = 4,
  FAILED = 5,
  SKIPPED = 6,
}

/**
 * 잡의 도메인 분류. 콘솔에서 잡 목록을 묶는 기준이다.
 *
 * **숫자 enum 으로 둔다.** 지금 이 값이 들어가는 batch_job 은 몇 행뿐이라 이름을 담지만,
 * 나중에 쌓이는 표에 같은 분류가 필요해지면 그때는 숫자를 담아야 한다 — 값의 정본을
 * 여기 하나로 두면 그날 표를 새로 만들 일이 없다.
 *
 * 값을 늘릴 때는 **뒤에 붙인다.** 다시 매기면 이미 쌓인 행이 어긋난다.
 */
export enum BatchCategory {
  /** 병원·지역 등 공공데이터 적재 */
  HEALTHCARE = 1,
  /** 세션·인가코드·이메일 인증 등 인증 부산물 */
  AUTH = 2,
  /** 회원 자체를 다루는 것(탈퇴 정리 등) */
  USER = 3,
}

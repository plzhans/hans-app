import { Badge } from '@/shared/ui/Badge';
import type { BatchCategory, BatchRunSource, BatchRunStatus } from '@/shared/api/batch';

/**
 * 상태 색. **끝난 것과 안 끝난 것, 정상과 비정상이 한눈에 갈려야 한다.**
 *
 * PARTIAL 을 초록으로 두지 않는다 — 성공이긴 하지만 남은 작업이 있다는 뜻이라,
 * 며칠 이어지면 뭔가 막혀 있는 것이다.
 */
const STATUS_TONE: Record<string, 'green' | 'gray' | 'amber' | 'red' | 'blue'> = {
  IDLE: 'gray',
  RUNNING: 'blue',
  DONE: 'green',
  STALLED: 'red',
  PARTIAL: 'amber',
  FAILED: 'red',
  SKIPPED: 'gray',
};

/**
 * 상태 이름.
 *
 * **이 값은 "마지막 회차의 결과" 다. 현재 상태가 아니다.** 그래서 라벨도 결과처럼 읽히게 쓴다 —
 * 예전에 IDLE 을 "대기" 로 썼는데, 그건 "다음 실행을 기다리는 중" 으로 읽혀서 완전히 틀렸다.
 * IDLE 은 등록 뒤 **한 번도 안 돈** 상태이고, 첫 실행 뒤에는 절대 돌아오지 않는다.
 */
const STATUS_LABEL: Record<string, string> = {
  IDLE: '실행 이력 없음',
  RUNNING: '실행 중',
  DONE: '성공',
  PARTIAL: '일부 완료',
  FAILED: '실패',
  SKIPPED: '건너뜀',
};

/** 분류 이름. 서버는 코드(HEALTHCARE)를 주고 화면이 우리말로 읽는다. */
export const CATEGORY_LABEL: Record<string, string> = {
  HEALTHCARE: '헬스케어',
  AUTH: '인증',
  USER: '회원',
};

/** 목록에서 분류가 뜨는 순서. 여기 없는 분류는 뒤로 밀린다. */
export const CATEGORY_ORDER: BatchCategory[] = ['HEALTHCARE', 'AUTH', 'USER'];

const SOURCE_LABEL: Record<string, string> = {
  CRON: '자동',
  ONCE: '수동(배치)',
  CLI: '수동(CLI)',
  ADMIN: '수동(콘솔)',
};

export function StatusBadge({ status }: { status: BatchRunStatus | string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'gray'}>{STATUS_LABEL[status] ?? status}</Badge>
  );
}

/** 굳은 실행. RUNNING 인데 살아 있지 않다고 판정된 것. */
export function StalledBadge() {
  return <Badge tone="red">중단됨</Badge>;
}

/**
 * 실행 출처.
 *
 * **자동(CRON)은 색을 주지 않는다.** 대부분이 자동이라 색을 주면 목록이 온통 물든다 —
 * 눈에 띄어야 하는 것은 사람이 손댄 회차다.
 */
export function SourceBadge({ source }: { source: BatchRunSource | string }) {
  if (source === 'CRON') {
    return <span className="text-xs text-gray-400">자동</span>;
  }
  return <Badge tone="blue">{SOURCE_LABEL[source] ?? source}</Badge>;
}

/**
 * 소요 시간. **단위를 크기에 맞춘다** — 몇 시간짜리를 밀리초로 보여주면 못 읽는다.
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return '-';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${(ms / 1000).toFixed(1)}초`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분 ${seconds % 60}초`;
  }
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

/** 큰 수는 자릿점을 찍는다. 8만 건과 8천 건을 눈으로 가르기 위해서다. */
export function formatCount(value: number): string {
  return value.toLocaleString();
}

/**
 * 진행 막대.
 *
 * **진행률을 모르는 경우가 정상적으로 존재한다.** 목록 벌크 단계(nmc.1·hira.1)는 청크 루프가
 * 아니라 대상 건수를 세지 않고, 청크 단계도 첫 청크가 끝나기 전에는 0/0 이다.
 * 그때 0% 막대를 그리면 "시작도 안 했다" 로 잘못 읽히므로 **미확정 막대와 경과 시간**을 낸다.
 *
 * **percent 는 null 이 아니라 undefined 로 온다.** 서버의 StripNullInterceptor 가 응답에서
 * null 필드를 통째로 지우기 때문이다 — `=== null` 로 검사하면 빠져나간다(실제로 그래서
 * `width: "undefined%"` 가 되어 막대가 꽉 찬 것처럼 보였다). 반드시 `== null` 로 둘 다 잡는다.
 */
export function ProgressBar({
  percent,
  processed,
  total,
  startedAt,
  staleReason,
}: {
  percent?: number | null;
  processed: number;
  total: number;
  /** 진행률을 모를 때 대신 보여줄 경과 시간의 기준 */
  startedAt?: string;
  /**
   * 살아 있지 않다고 판정된 이유.
   *
   * **이때 경과 시간을 올리지 않는다.** 죽은 실행의 타이머가 계속 도는 것은
   * "아직 열심히 하는 중" 으로 읽혀 제일 나쁘다 — 멈춘 시점만 말한다.
   */
  staleReason?: string;
}) {
  if (staleReason) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full w-1/3 rounded-full bg-red-300" />
        </div>
        <span className="whitespace-nowrap text-xs text-red-600">
          {processed > 0 && `${formatCount(processed)}건에서 `}멈춤
        </span>
      </div>
    );
  }

  if (percent == null) {
    return (
      <div className="flex items-center gap-2">
        {/* 미확정. 움직이는 것으로 "도는 중" 임을 알린다 — 빈칸이면 멈춘 것처럼 보인다. */}
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-300" />
        </div>
        <span className="whitespace-nowrap text-xs text-gray-500">
          {processed > 0
            ? `${formatCount(processed)}건 처리`
            : startedAt
              ? `${formatDuration(Date.now() - Date.parse(startedAt))} 경과`
              : '진행률 집계 전'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs text-gray-500">
        {formatCount(processed)}/{formatCount(total)} ({percent}%)
      </span>
    </div>
  );
}

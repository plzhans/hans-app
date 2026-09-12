import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/utils';
import { formatTime, type OpenStatus } from '../api';

/**
 * 지금 진료 중인가를 한 눈에.
 *
 * **상세에서 가장 먼저 확인하는 사실이다.** 요일별 시간표를 읽어 내려가 오늘을 찾고 지금
 * 시각과 견주는 일을 사용자가 하고 있었다. 그 계산은 openStatus() 가 하고, 여기서는
 * 결과만 색과 한 마디로 보여준다.
 *
 * **닫혀 있다고 빨강을 쓰지 않는다.** 진료 종료는 잘못된 상태가 아니라 그냥 시간이 지난
 * 것이다. 빨강은 이 화면에서 응급실 하나에만 쓴다 — 그래야 그 색이 뜻을 잃지 않는다.
 */
export function StatusPill({ status }: { status: OpenStatus }) {
  const { t } = useTranslation();

  /*
    문구를 상태마다 따로 짓는다. **"진료 종료 · 09:00 시작" 같은 말을 만들지 않기 위해서다** —
    아직 문을 안 연 아침도 closed 인데, 거기에 '종료' 를 붙이면 없는 사실을 말하게 된다.
  */
  const { tone, label } =
    status.state === 'open'
      ? {
          tone: 'bg-ok-tint text-ok',
          label: status.at
            ? `${t('clinic.status.open')} · ${t('clinic.status.closesAt', { time: formatTime(status.at) })}`
            : t('clinic.status.open'),
        }
      : status.state === 'break'
        ? {
            tone: 'bg-amber-50 text-amber-600',
            label: status.at
              ? `${t('clinic.status.break')} · ${t('clinic.status.resumesAt', { time: formatTime(status.at) })}`
              : t('clinic.status.break'),
          }
        : {
            tone: 'bg-surface-subtle text-ink-muted',
            // 오늘 안에 여는 시각이 남아 있으면 '종료' 가 아니라 그 시각을 알린다.
            label: status.at
              ? t('clinic.status.opensAt', { time: formatTime(status.at) })
              : t('clinic.status.closed'),
          };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.68rem] font-extrabold tabular-nums',
        tone,
      )}
    >
      {/* 점. 색만으로는 색을 못 가리는 사람에게 아무것도 아니라, 문구가 늘 함께 간다. */}
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

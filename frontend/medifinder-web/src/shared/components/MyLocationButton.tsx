import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/lib/utils';
import { useMyRegion } from '@/shared/hooks/useMyRegion';
import type { RegionPointDto } from '@/shared/api/generated/model';

/**
 * "내 위치" 버튼. 누르면 권한을 받아 좌표를 지역 코드로 바꿔 부모에게 넘긴다.
 *
 * **권한을 여기서 받는 게 요점이다.** 화면이 열릴 때 미리 묻지 않고 사용자가 이 버튼을 누른
 * 순간에만 프롬프트가 뜬다 — 맥락이 자명해서 따로 안내할 필요가 없다.
 *
 * 홈과 상세검색이 같은 컴포넌트를 쓴다. 두 화면이 각자 묻지만 권한은 origin 단위로 저장되므로
 * 한 번 허용하면 다른 화면에서는 프롬프트 없이 통과한다.
 *
 * **부모는 좌표를 못 본다.** 지역 코드만 받는다(useMyRegion 주석 참고).
 */
interface MyLocationButtonProps {
  /** 지역을 알아냈을 때. 실패는 이 컴포넌트가 안내하므로 부모가 처리할 게 없다. */
  onResolved: (point: RegionPointDto) => void;

  /** 아이콘 옆에 "내 위치" 글자를 함께 보일지. 좁은 자리에서는 끈다. */
  showLabel?: boolean;

  className?: string;
}

/** 실패 안내가 저절로 사라지는 시간(ms). 사용자가 지우게 만들 만큼 중요한 메시지는 아니다. */
const MESSAGE_TIMEOUT_MS = 5000;

export function MyLocationButton({
  onResolved,
  showLabel = false,
  className,
}: MyLocationButtonProps) {
  const { t } = useTranslation();
  const { status, reason, blocked, locate } = useMyRegion();
  const [message, setMessage] = useState<string>();

  // 안내를 띄운 채 두지 않는다. 다음 시도에 다시 뜬다.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(undefined), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const locating = status === 'locating';

  const onClick = async () => {
    if (locating) return;
    const point = await locate();
    // 실패(null)는 여기서 다루지 않는다 — 사유는 훅의 상태로 오므로 아래 useEffect 가 띄운다.
    if (point) {
      setMessage(undefined);
      onResolved(point);
    }
  };

  // 실패 사유가 정해지면 그에 맞는 문구를 띄운다. 거부는 브라우저가 기억하므로
  // "다시 눌러보라" 가 아니라 "설정에서 풀어라" 로 안내한다.
  useEffect(() => {
    if (status !== 'error' || !reason) return;
    setMessage(t(`common.myLocation.${reason}`));
  }, [status, reason, t]);

  const label = t('common.myLocation.label');
  const title = blocked ? t('common.myLocation.blocked') : label;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={locating}
        title={title}
        aria-label={label}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1.5 bg-white transition-colors',
          'hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/30',
          // 기본형은 **Combobox 에 맞춘다** — 상세검색에서 시도·시군구 옆에 서기 때문이다.
          // 히어로 검색박스(Input: h-11·rounded-xl)처럼 다른 자리는 className 으로 덮어쓴다.
          'rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600',
          // 권한이 이미 막혀 있으면 눌러도 프롬프트가 안 뜬다. 흐리게 두어 미리 알린다.
          blocked && 'text-slate-400',
          className,
        )}
      >
        {locating ? (
          <Spinner className="h-4 w-4 border-2 border-slate-400" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
        {showLabel && (
          <span>{locating ? t('common.myLocation.locating') : label}</span>
        )}
      </button>

      {/*
        실패 안내. **자리를 차지하지 않게 띄운다** — 버튼이 검색 줄 안에 있어서 흐름에 끼워
        넣으면 그때마다 줄이 밀린다. aria-live 로 스크린리더에도 읽힌다.
      */}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 shadow-lg"
        >
          {message}
        </p>
      )}
    </div>
  );
}

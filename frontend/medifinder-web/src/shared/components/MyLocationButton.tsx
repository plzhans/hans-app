import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, X } from 'lucide-react';
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

  /**
   * 이미 잡혀 있는 지역 이름("하남시"). 주면 **활성 상태**로 그리고 이 이름을 라벨로 쓴다.
   *
   * **결과를 보여줄 데가 없는 자리를 위한 것이다.** 상세검색은 시도·시군구 콤보박스가
   * 채워지는 게 곧 피드백이라 필요 없지만, 홈 검색박스는 버튼 말고는 보여줄 곳이 없다.
   */
  selectedName?: string;

  /** 활성 상태에서 눌렀을 때. 없으면 다시 위치를 잡는다. */
  onClear?: () => void;

  /** 아이콘 옆에 "내 위치" 글자를 함께 보일지. 좁은 자리에서는 끈다. */
  showLabel?: boolean;

  className?: string;
}

/** 실패 안내가 저절로 사라지는 시간(ms). 사용자가 지우게 만들 만큼 중요한 메시지는 아니다. */
const MESSAGE_TIMEOUT_MS = 5000;

export function MyLocationButton({
  onResolved,
  selectedName,
  onClear,
  showLabel = false,
  className,
}: MyLocationButtonProps) {
  const { t } = useTranslation();
  const { status, reason, blocked, granted, locate } = useMyRegion();
  const [message, setMessage] = useState<string>();

  // 안내를 띄운 채 두지 않는다. 다음 시도에 다시 뜬다.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(undefined), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const locating = status === 'locating';

  const onClick = async () => {
    /*
      **이미 허용돼 있으면 누를 일이 없다.** 웹에는 권한을 코드로 해제하는 API 가 없어서
      이 버튼이 할 수 있는 일은 "허용을 받는 것" 하나뿐이다. 이미 받았는데 또 누르면
      좌표만 한 번 더 받아올 뿐 화면에서 달라지는 게 없다 — 눌리지만 아무 일도 안 나는
      버튼이 되어, 켜진 불이 무슨 뜻인지 오히려 흐려진다.
      해제는 브라우저·OS 설정에서 한다(그건 우리가 못 연다).
    */
    if (locating || granted) return;
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
  /** 지역이 잡혔고 해제 수단까지 있는 상태. 이때만 칩(✕ 포함)으로 그린다. */
  const chip = Boolean(selectedName && onClear);

  /** 칩·버튼 공통 껍데기. 둘이 같은 자리에 서므로 크기·모양을 한 벌로 맞춘다. */
  const shell = cn(
    'inline-flex shrink-0 items-center gap-1.5 rounded-field text-sm font-semibold transition-all duration-100 ease-native',
    // 기본형은 **Combobox 에 맞춘다** — 상세검색에서 시도·시군구 옆에 서기 때문이다.
    // 히어로 검색박스(Input: h-11·rounded-xl)처럼 다른 자리는 className 으로 덮어쓴다.
    'px-3 py-2',
    className,
  );

  return (
    <div className="relative inline-flex max-w-full">
      {chip ? (
        /*
          잡힌 상태 — **필터 칩이다.** ✕ 를 눌러야 풀린다.

          칩 몸통을 버튼으로 만들지 않는 이유는 두 가지다. 버튼 안에 버튼을 넣을 수 없고(HTML),
          몸통을 눌렀을 때 "다시 잡기" 인지 "해제" 인지가 사용자에게 모호하다. 동작은 ✕ 하나뿐이다.
        */
        <span
          className={cn(
            shell,
            'bg-brand-tint pr-1.5 text-brand-strong ring-1 ring-inset ring-brand-tint-strong',
          )}
        >
          <MapPin className="h-4 w-4 shrink-0" />
          {/*
            지역명이 길 수 있다("전남광주통합특별시"). min-w-0 이 없으면 flex 항목이
            콘텐츠 폭 밑으로 안 줄어 칩이 부모를 뚫고 나간다 — truncate 와 짝으로 둔다.
          */}
          <span className="min-w-0 truncate">{selectedName}</span>
          <button
            type="button"
            onClick={onClear}
            title={t('common.myLocation.clear', { name: selectedName })}
            aria-label={t('common.myLocation.clear', { name: selectedName })}
            className="-mr-0.5 shrink-0 rounded-md p-0.5 text-brand/70 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 active:bg-brand-tint-strong active:text-brand"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void onClick()}
          disabled={locating || granted}
          title={
            granted
              ? t('common.myLocation.granted')
              : blocked
                ? t('common.myLocation.blocked')
                : label
          }
          aria-label={label}
          className={cn(
            shell,
            'justify-center',
            /*
              **허용돼 있으면 켜진 색.** 눌렀을 때가 아니라 이 사이트가 위치를 쓸 수 있는
              상태인지를 보여준다 — 한 번 허용한 사람에게 매번 눌러야 켜지는 표시는
              "지금 위치가 공유되고 있나" 에 답하지 못한다. 켜져 있다고 좌표를 미리
              받아오지는 않는다(누를 때만 받는다).
            */
            granted
              ? 'bg-brand-tint text-brand ring-1 ring-inset ring-brand-tint-strong'
              : 'bg-surface text-ink-body ring-1 ring-inset ring-line',
            'active:scale-[0.97] active:bg-surface-subtle',
            /*
              켜진 상태는 **흐려지지도, 금지 커서가 뜨지도 않는다.** 그건 "이미 쓸 수 있다" 는
              표시지 고장이나 비활성이 아니다 — 흐리게 하거나 🚫 를 띄우면 뜻이 반대로 읽힌다.
              누를 수 없다는 것은 마우스를 올렸을 때 뜨는 안내(title)가 말한다.
            */
            granted
              ? 'disabled:opacity-100 disabled:cursor-default'
              : 'disabled:cursor-not-allowed disabled:opacity-60',
            'focus:outline-none focus:ring-2 focus:ring-brand/30',
            // 권한이 이미 막혀 있으면 눌러도 프롬프트가 안 뜬다. 흐리게 두어 미리 알린다.
            blocked && 'text-ink-subtle',
          )}
        >
          {locating ? (
            <Spinner className="h-4 w-4 shrink-0 border-2 border-ink-subtle" />
          ) : (
            <MapPin className="h-4 w-4 shrink-0" />
          )}
          {(showLabel || locating) && (
            <span className="min-w-0 truncate">
              {locating ? t('common.myLocation.locating') : label}
            </span>
          )}
        </button>
      )}

      {/*
        실패 안내. **자리를 차지하지 않게 띄운다** — 버튼이 검색 줄 안에 있어서 흐름에 끼워
        넣으면 그때마다 줄이 밀린다. aria-live 로 스크린리더에도 읽힌다.
      */}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink-body shadow-pop"
        >
          {message}
        </p>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Navigation, Phone, Share2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { DirectionsMenu } from './DirectionsMenu';
import { share } from '@/shared/lib/share';
import type { HospitalDetail } from '../api';

/**
 * 화면 아래 고정된 주요 행동.
 *
 * **빠른 실행 4칸과 겹치는 것 같지만 역할이 다르다.** 그쪽은 화면 맨 위에 있어서 스크롤을
 * 내리면 사라진다 — 정작 상세를 다 읽고 "그래서 전화해볼까" 가 되는 순간에는 화면에 없다.
 * 이 바는 그 순간을 위해 늘 붙어 있는다.
 *
 * **전화가 없으면 길찾기가 그 자리를 받는다.** 전화번호가 없는 병원이 실제로 있는데, 그때
 * 비활성 버튼을 띄우면 누르게 만들고 아무 일도 안 일어난다. 둘 다 없으면 바 자체가 없다 —
 * 할 수 있는 게 공유뿐인데 그것 하나로 화면 아래를 늘 차지할 이유는 없다.
 */
export function BottomCallBar({ hospital }: { hospital: HospitalDetail }) {
  const { t } = useTranslation();

  const tel = hospital.tel;
  const point =
    hospital.location?.lat != null && hospital.location?.lon != null
      ? {
          lat: hospital.location.lat,
          lng: hospital.location.lon,
          name: hospital.name,
        }
      : undefined;

  /**
   * 공유 결과 표시. **주소를 복사했을 때만 뜬다** — OS 공유 시트가 열렸으면 사용자는 이미
   * 무슨 일이 일어났는지 봤고, 취소했으면 아무 일도 안 일어난 것이다. 그때도 "복사됨" 을
   * 띄우면 하지 않은 일을 했다고 말하는 셈이 된다.
   */
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onShare = async () => {
    const result = await share({
      title: hospital.name,
      // 주소를 함께 보낸다 — 링크를 안 여는 사람도 어느 병원인지는 알아본다.
      text: hospital.location?.address ?? undefined,
      url: window.location.href,
    });

    if (result === 'copied') {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!tel && !point) return null;

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl',
        // 홈 인디케이터 위로 버튼이 걸리지 않게 세이프에어리어만큼 더 띄운다.
        'pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3',
      )}
    >
      <div className="mx-auto flex max-w-3xl gap-2.5 px-4">
        <button
          type="button"
          onClick={() => void onShare()}
          aria-label={copied ? t('clinic.actions.linkCopied') : t('clinic.actions.share')}
          className={cn(
            'flex h-[3rem] w-[3rem] shrink-0 items-center justify-center rounded-field bg-brand-tint text-brand',
            'transition-transform duration-100 ease-native active:scale-95',
          )}
        >
          {copied ? (
            <Check className="h-[1.15rem] w-[1.15rem]" />
          ) : (
            <Share2 className="h-[1.15rem] w-[1.15rem]" />
          )}
        </button>

        {/*
          주 행동. **하나뿐이다** — 둘을 나란히 채워 놓으면 어느 쪽이 먼저인지 매번 읽어서
          판단해야 하고, 그러면 늘 붙어 있는 값이 사라진다.
        */}
        {tel ? (
          <a
            href={`tel:${tel}`}
            className={cn(
              'flex h-[3rem] flex-1 items-center justify-center gap-2 rounded-field bg-brand text-[0.9rem] font-extrabold text-white no-underline shadow-brand',
              'transition-all duration-100 ease-native active:scale-[0.98] active:bg-brand-strong',
            )}
          >
            <Phone className="h-[1.05rem] w-[1.05rem]" />
            {t('clinic.actions.callCta')}
          </a>
        ) : (
          // 전화번호가 없는 병원에서는 길찾기가 주 행동이 된다 — 누르면 지도 앱을 고른다.
          <DirectionsMenu point={point!} align="end">
            <button
              type="button"
              className={cn(
                'flex h-[3rem] flex-1 items-center justify-center gap-2 rounded-field bg-brand text-[0.9rem] font-extrabold text-white shadow-brand',
                'transition-all duration-100 ease-native active:scale-[0.98] active:bg-brand-strong',
              )}
            >
              <Navigation className="h-[1.05rem] w-[1.05rem]" />
              {t('clinic.actions.directions')}
            </button>
          </DirectionsMenu>
        )}
      </div>
    </div>
  );
}

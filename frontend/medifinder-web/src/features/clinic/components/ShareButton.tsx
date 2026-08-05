import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Share2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { share } from '@/shared/lib/share';
import type { HospitalDetail } from '../api';

/**
 * 앱바의 공유 버튼.
 *
 * **넓은 화면에서는 여기가 공유의 유일한 자리다.** 좁은 화면은 하단 고정 바가 맡는데,
 * 그 바를 넓은 화면에서는 띄우지 않는다(화면을 가로질러 놓이면 과하다). 앱바에 두면
 * 폭과 무관하게 늘 손이 닿는다.
 *
 * **색을 스스로 정하지 않는다**(text-current) — 파란 히어로 위에서는 희고 흰 바에서는
 * 먹색이어야 하는데, 그 판단은 앱바가 한다(DetailAppBar 의 actions 래퍼).
 */
export function ShareButton({ hospital }: { hospital: HospitalDetail }) {
  const { t } = useTranslation();

  /**
   * **주소를 복사했을 때만 표시가 바뀐다.** OS 공유 시트가 열렸으면 사용자는 이미 무슨 일이
   * 일어났는지 봤고, 취소했으면 아무 일도 안 일어난 것이다. 그때도 "복사됨" 을 띄우면
   * 하지 않은 일을 했다고 말하는 셈이 된다.
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

  const label = copied
    ? t('clinic.actions.linkCopied')
    : t('clinic.actions.share');

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      aria-label={label}
      title={label}
      className={cn(
        // 뒤로가기·언어와 같은 크기·모양이라 앱바 좌우가 대칭으로 읽힌다.
        'flex h-[2.35rem] w-[2.35rem] shrink-0 items-center justify-center rounded-box text-current',
        'transition-transform duration-150 ease-native active:scale-90 active:bg-current/10',
      )}
    >
      {copied ? <Check className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
    </button>
  );
}

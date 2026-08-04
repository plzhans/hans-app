import { useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react';
import { useLangPath } from '@/shared/i18n/routing';
import { Spinner } from '@/shared/ui/Spinner';
import { LanguageSwitcher } from '@/shared/components/layout/LanguageSwitcher';
import { Section } from '../components/Section';
import { DetailTabBar } from '../components/HospitalHeader';
import { DetailAppBar } from '../components/DetailAppBar';
import { ShareButton } from '../components/ShareButton';
import { NonPaymentPanel } from '../components/NonPaymentPanel';
import { HospitalIntroCard } from '../components/HospitalIntroCard';
import { useHospitalDetail } from '../api';

/**
 * 비급여 진료비 페이지.
 *
 * **별도 페이지지만 레이아웃·디자인은 상세와 똑같다** — 같은 앱바, 같은 히어로, 같은 탭 바,
 * 같은 Section 을 쓴다. 비급여가 활성 탭인 것만 다르다. '탭을 눌러 넘어온' 느낌을 유지하고,
 * 어느 병원을 보는지도 사라지지 않는다.
 *
 * **예전엔 상세 안의 화면 전환이었다**(해시 #npay). 페이지로 뗀 이유는 그게 애초에 페이지가
 * 하는 일이었기 때문이다 — 해시를 직접 읽고 pushState 를 쓰고 스크롤 스파이를 끄고 켜야 했다.
 * 라우터가 공짜로 해주는 일이다(뒤로가기·주소 복사·SEO).
 *
 * 상세를 한 번 더 부르는 것처럼 보이지만, 그 쿼리는 상세 페이지에서 이미 캐시에 있다.
 */
export default function HospitalNonPaymentPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: hospital, isLoading } = useHospitalDetail(id);
  const navigate = useNavigate();
  const langPath = useLangPath();

  /** 앱바 높이를 재는 데만 쓴다. 여기 앱바는 늘 흰 바라 스크롤을 지켜볼 일이 없다. */
  const navRef = useRef<HTMLElement>(null);

  /**
   * 뒤로가기. **상세로 돌아간다** — 여기 오는 길은 상세의 비급여 탭 하나뿐이라 직전 기록이
   * 곧 그 상세이고, 그래야 상세에서 보던 자리(스크롤 위치)가 살아난다.
   * 주소를 직접 열어 돌아갈 기록이 없을 때만 상세로 새로 이동한다.
   */
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
    } else {
      navigate(langPath(`/hospitals/${id}`));
    }
  };

  if (isLoading || !hospital) {
    return (
      <>
        <DetailAppBar
          barRef={navRef}
          title=""
          solid
          onBack={goBack}
          backLabel={t('clinic.tabs.npay')}
        />
        <div className="py-16 text-center">
          <Spinner />
        </div>
      </>
    );
  }

  return (
    <>
      <DetailAppBar
        barRef={navRef}
        title={hospital.name}
        // 히어로가 없으니 이름을 들 자리가 여기뿐이다 — 처음부터 띄운다.
        solid
        onBack={goBack}
        backLabel={t('clinic.tabs.npay')}
        actions={
          <>
            <ShareButton hospital={hospital} />
            <LanguageSwitcher compact />
          </>
        }
      />

      {/*
        **파란 히어로를 그리지 않는다.** 비급여는 상세의 탭 하나를 누른 것이라, 여기서 표지가
        다시 크게 뜨면 페이지가 통째로 바뀐 것처럼 읽힌다 — 탭을 눌렀는데 다른 화면으로
        떨어진 느낌이 된다. 어느 병원인지는 앱바 제목이 계속 들고 있고, 왼쪽 소개 카드가
        연락처·진료시간까지 그대로 이어 준다.
      */}
      <DetailTabBar hospital={hospital} mode="npay" />

      {/*
        **상세와 똑같은 2단 껍데기다.** 왼쪽에 같은 소개 카드가 서고 오른쪽만 가격표로 바뀐다 —
        그래야 비급여가 다른 화면으로 튄 게 아니라 상세의 한 탭을 연 것처럼 읽힌다.
        예전엔 가격표 한 장만 덩그러니 놓여서, 같은 병원을 보고 있다는 감각이 끊겼다.
      */}
      <div className="mx-auto max-w-7xl px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-1 lg:px-8 lg:pb-14">
        <div className="lg:grid lg:grid-cols-[23rem_1fr] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <HospitalIntroCard hospital={hospital} first />
        </div>

        {/* 오른쪽 칸. 넓은 화면에서 첫 카드의 위 여백을 지워 두 기둥의 머리를 맞춘다. */}
        <div className="min-w-0 lg:[&>section:first-child]:mt-0">

        <Section
          title={t('clinic.npay.title')}
          icon={<Receipt className="h-4 w-4 text-brand" />}
        >
          <NonPaymentPanel id={id} />
        </Section>
        </div>
        </div>
      </div>
    </>
  );
}

import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Receipt } from 'lucide-react';
import { LangLink } from '@/shared/i18n/LangLink';
import { Spinner } from '@/shared/ui/Spinner';
import { Section } from '../components/Section';
import { HospitalHeader } from '../components/HospitalHeader';
import { NonPaymentPanel } from '../components/NonPaymentPanel';
import { useHospitalDetail } from '../api';

/**
 * 비급여 진료비 페이지.
 *
 * **별도 페이지지만 레이아웃·디자인은 상세와 똑같다** — 같은 바깥 껍데기(max-w-3xl 흰 카드),
 * 같은 헤더·탭 바(HospitalHeader), 같은 Section 을 쓴다. 비급여가 활성 탭인 것만 다르다.
 * '탭을 눌러 넘어온' 느낌을 유지하고, 어느 병원을 보는지도 사라지지 않는다.
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

  if (isLoading || !hospital) {
    return (
      <div className="py-16 text-center">
        <Spinner />
      </div>
    );
  }

  return (
    // 상세와 같은 껍데기다 — 페이지가 곧 한 장의 흰 종이. (HospitalDetailPage 와 동일)
    <div className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white px-4 py-6">
      {/* 상세의 '검색으로' 자리. 여기선 그 병원 상세로 돌아간다. */}
      <LangLink
        to={`/hospitals/${id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 no-underline hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> {hospital.name}
      </LangLink>

      <HospitalHeader hospital={hospital} mode="npay" />

      <Section
        first
        title={t('clinic.npay.title')}
        icon={<Receipt className="h-4 w-4 text-primary-600" />}
      >
        <NonPaymentPanel id={id} />
      </Section>
    </div>
  );
}

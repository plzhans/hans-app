import { useTranslation } from 'react-i18next';
import { LangLink } from '@/shared/i18n/LangLink';
import { ChevronRight, Phone, Ambulance, Baby } from 'lucide-react';
import { stationLabel, type Hospital } from '../api';
import { metroCityOf, stationLines } from '../lib/subwayLine';
import { LineBadge } from './LineBadge';
import { cn } from '@/shared/lib/utils';

/**
 * 병원 카드.
 *
 * 통합 병원 하나를 보여준다. 예전에는 원본(hira/nmc)마다 필드 모양이 달라
 * 다국어 객체(name.ko)와 주소 조각을 조립해야 했는데, 이제 백엔드가 평범한 문자열로 준다.
 */
/**
 * @param compact 첫 페이지 추천 카드용. 전화번호를 빼고 주소를 지하철역·시도 시군구까지만 줄인다 —
 *   추천은 훑어보는 자리라 상세 주소·연락처는 상세 페이지에서 본다. 검색 결과는 이 옵션을 안 쓴다.
 */
export function HospitalCard({
  hospital,
  compact = false,
}: {
  hospital: Hospital;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  // 노선색은 도시마다 다르고(부산 1호선은 주황, 서울 1호선은 남색) 노선 칸엔 지역이 없다.
  // 주소가 유일한 단서다. 색을 찾은 노선만 남긴다 — 카드는 한 줄로 위치를 알리는 자리다.
  const city = metroCityOf(hospital.location?.address);
  const lines = stationLines(hospital.location?.stationLine, city);

  // compact 는 상세 주소 대신 "시도 시군구" 만 쓴다(예: "서울특별시 종로구"). 없는 조각은 뺀다.
  const region = hospital.location?.region;
  const regionText = [region?.sido?.name, region?.name].filter(Boolean).join(' ');
  const locationText = compact ? regionText : hospital.location?.address;

  const inner = (
    <>
      {/*
        배지 줄. **규모가 맨 앞, 이름 위**다 — 상세 페이지와 같은 규칙이다.
        "상급병원인데 응급실도 있다" 가 이름보다 먼저 읽혀야 "지금 갈 수 있나" 를 바로 판단한다.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 의원급(TIER1)은 등급 배지를 달지 않는다 — 종별 배지가 없으면 어차피 의원이다. */}
        {hospital.tier && hospital.tier.code !== 'TIER1' && (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {hospital.tier.name}
          </span>
        )}
        {/* 전문병원 지정분야. 등급 옆에 "척추 전문병원" 처럼 붙인다 — 상세 페이지와 같은 규칙. */}
        {hospital.specialty && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {hospital.specialty.name
              ? `${hospital.specialty.name} ${t('clinic.specialtyHospital')}`
              : t('clinic.specialtyHospital')}
          </span>
        )}
        {hospital.emergency && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            <Ambulance className="h-3 w-3" /> {t('clinic.badge.emergency')}
          </span>
        )}
        {hospital.baby && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <Baby className="h-3 w-3" /> {t('clinic.badge.baby')}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-start justify-between gap-2">
        <h3
          className={cn(
            'font-semibold text-slate-900',
            // 추천 카드는 폭이 좁아 이름을 살짝 줄이고, 길면 한 줄에서 말줄임(…)한다.
            // truncate 가 먹으려면 flex 안에서 min-w-0 이 있어야 한다(안 그러면 안 줄고 옆칸을 민다).
            compact && 'min-w-0 flex-1 truncate text-sm',
          )}
        >
          {hospital.name}
        </h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
      </div>

      <dl className="mt-2 space-y-1.5 text-xs text-slate-600">
        {((!compact && hospital.location?.station) || locationText) && (
          <div className="flex items-start gap-1.5">
            <span className="break-keep">
              {/*
                지하철역이 주소보다 먼저다. 한국에서 위치를 가늠하는 1차 기준이고,
                "서울 종로구 대학로 101" 보다 "혜화역" 이 훨씬 빨리 읽힌다.
                단 대시보드(compact)에선 역 배지를 빼 — 카드가 좁아 지저분해진다.
              */}
              {!compact && hospital.location?.station && (
                <span className="mr-1.5 inline-flex items-center gap-1 align-middle">
                  {lines.map((line) => (
                    <LineBadge key={line} line={line} city={city} />
                  ))}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                    {stationLabel(hospital.location.station, lines.length > 0)}
                  </span>
                </span>
              )}
              {locationText}
            </span>
          </div>
        )}
        {/* compact(추천 카드)에는 전화번호를 싣지 않는다 — 훑어보는 자리라 상세에서 본다. */}
        {!compact && hospital.tel && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{hospital.tel}</span>
          </div>
        )}
      </dl>
    </>
  );

  return (
    <LangLink
      to={`/hospitals/${hospital.id}`}
      className="block rounded-2xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-md"
    >
      {inner}
    </LangLink>
  );
}

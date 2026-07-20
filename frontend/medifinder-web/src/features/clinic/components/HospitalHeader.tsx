import { Ambulance, Baby, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { LangLink } from '@/shared/i18n/LangLink';
import type { HospitalDetail } from '../api';
import { stationName, stationLabel } from '../api';
import { metroCityOf, resolveLine, stationLines } from '../lib/subwayLine';
import { LineBadge } from './LineBadge';

/** 상세의 책갈피 탭. 비급여는 여기 없다 — 그것만 별도 페이지라 성격이 다르다. */
export type DetailTab = 'subject' | 'care' | 'scale' | 'assessment' | 'location';

export const DETAIL_TABS: { key: DetailTab }[] = [
  { key: 'subject' },
  { key: 'care' },
  { key: 'scale' },
  { key: 'assessment' },
  { key: 'location' },
];

/**
 * 병원 헤더 + 탭 바. **상세와 비급여 두 페이지가 공유한다.**
 *
 * 비급여를 별도 페이지로 뗐지만 디자인은 탭 그대로여야 한다 — 그래야 "탭을 눌러 넘어온" 느낌이
 * 유지되고, 어느 병원을 보는지도 안 사라진다. 그래서 헤더(배지·이름·지역)와 탭 바를 여기 모아
 * 두 페이지가 같은 것을 그린다. 다른 점은 링크 동작뿐이다:
 *   detail : 책갈피 탭은 이 페이지 안 앵커(#care)라 스크롤 스파이가 표시를 따라간다.
 *   npay   : 책갈피 탭은 상세로 돌아가는 링크, 비급여가 활성 탭이다.
 */
type Props = { hospital: HospitalDetail } & (
  | {
      mode: 'detail';
      stickyRef: React.Ref<HTMLDivElement>;
      activeTab: DetailTab;
      onTabClick: (event: React.MouseEvent, key: DetailTab) => void;
      onRegionClick: (event: React.MouseEvent) => void;
      prefetchNpay: () => void;
    }
  | { mode: 'npay' }
);

export function HospitalHeader(props: Props) {
  const { hospital } = props;
  const { t } = useTranslation();

  const subway = hospital.transport?.subway?.[0];
  const nearestStation = stationName(subway?.arrival);
  const metroCity = metroCityOf(hospital.location?.address);
  const headerLines = nearestStation
    ? stationLines(subway?.line, metroCity)
    : [];
  const region = hospital.location?.region;
  const specialtyFields = (hospital.capabilities ?? []).filter(
    (c) => c.type === 'specialty',
  );

  // 의원급(TIER1)은 등급 배지를 달지 않는다 — 종별 배지가 없으면 어차피 의원이라 군더더기다.
  const showTier = hospital.tier && hospital.tier.code !== 'TIER1';

  const detailPath = `/hospitals/${hospital.id}`;

  return (
    <div
      ref={props.mode === 'detail' ? props.stickyRef : undefined}
      className="sticky top-14 z-20 -mx-4 !mt-0 bg-white/95 px-4 backdrop-blur"
    >
      {/* 배지 · 이름 · 지역 */}
      <header className="!mb-0 pb-3 pt-3">
        {(showTier ||
          specialtyFields.length > 0 ||
          hospital.emergency ||
          hospital.baby) && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {showTier && (
              <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                {hospital.tier!.name}
              </span>
            )}
            {specialtyFields.map((c) => (
              <span
                key={c.code}
                className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
              >
                {c.name
                  ? `${c.name} ${t('clinic.specialtyHospital')}`
                  : t('clinic.specialtyHospital')}
              </span>
            ))}
            {hospital.emergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                <Ambulance className="h-3 w-3" /> {t('clinic.badge.emergencyDetail')}
              </span>
            )}
            {hospital.baby && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Baby className="h-3 w-3" /> {t('clinic.badge.babyDetail')}
              </span>
            )}
          </div>
        )}

        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {hospital.name}
        </h1>

        {/* 지하철역 | 시도 | 시군구. 누르면 위치 섹션으로. 비급여 페이지에선 상세로 넘어가 위치로. */}
        {(region || nearestStation) &&
          (props.mode === 'detail' ? (
            <a
              href="#location"
              onClick={props.onRegionClick}
              className="mt-1 flex items-center gap-1 text-sm text-slate-500 no-underline transition-colors hover:text-primary-600"
            >
              <RegionLine
                headerLines={headerLines}
                metroCity={metroCity}
                nearestStation={nearestStation}
                region={region}
              />
            </a>
          ) : (
            <LangLink
              to={`${detailPath}#location`}
              className="mt-1 flex items-center gap-1 text-sm text-slate-500 no-underline transition-colors hover:text-primary-600"
            >
              <RegionLine
                headerLines={headerLines}
                metroCity={metroCity}
                nearestStation={nearestStation}
                region={region}
              />
            </LangLink>
          ))}
      </header>

      <nav
        role="tablist"
        className="-mx-4 !mt-0 flex border-b border-slate-200 px-4"
      >
        {/* 평가 탭은 데이터가 있을 때만. 없는 병원이 절반이 넘는다. */}
        {DETAIL_TABS.filter(
          (detailTab) => detailTab.key !== 'assessment' || hospital.assessment,
        ).map((detailTab) => {
          const active =
            props.mode === 'detail' && props.activeTab === detailTab.key;
          const className = cn(
            '-mb-px border-b-2 px-4 py-2.5 text-sm no-underline transition-colors',
            active
              ? 'border-primary-600 font-bold text-primary-700'
              : 'border-transparent font-medium text-slate-500 hover:text-slate-800',
          );

          // detail 은 이 페이지 안 앵커, npay 는 상세로 돌아가는 링크.
          return props.mode === 'detail' ? (
            <a
              key={detailTab.key}
              href={`#${detailTab.key}`}
              role="tab"
              aria-selected={active}
              onClick={(event) => props.onTabClick(event, detailTab.key)}
              className={className}
            >
              {t(`clinic.tabs.${detailTab.key}`)}
            </a>
          ) : (
            <LangLink
              key={detailTab.key}
              to={`${detailPath}#${detailTab.key}`}
              role="tab"
              aria-selected={false}
              className={className}
            >
              {t(`clinic.tabs.${detailTab.key}`)}
            </LangLink>
          );
        })}

        {/*
          비급여. 별도 페이지라 다른 탭과 링크 동작이 다르다.
            detail : 비급여 페이지로 가는 링크(프리페치 포함)
            npay   : 지금 이 페이지라 활성 탭(링크 아님)
        */}
        <span aria-hidden className="my-2 w-px shrink-0 self-stretch bg-slate-200" />
        {props.mode === 'detail' ? (
          <LangLink
            to={`${detailPath}/npay`}
            role="tab"
            aria-selected={false}
            onMouseEnter={props.prefetchNpay}
            onTouchStart={props.prefetchNpay}
            onFocus={props.prefetchNpay}
            className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 no-underline transition-colors hover:text-slate-800"
          >
            <Receipt className="h-3.5 w-3.5" />
            {t('clinic.tabs.npay')}
          </LangLink>
        ) : (
          <span
            role="tab"
            aria-selected
            className="-mb-px flex items-center gap-1.5 border-b-2 border-primary-600 px-4 py-2.5 text-sm font-bold text-primary-700"
          >
            <Receipt className="h-3.5 w-3.5" />
            {t('clinic.tabs.npay')}
          </span>
        )}
      </nav>
    </div>
  );
}

/** 지하철 노선 배지 + 역·시도·시군구 한 줄. 두 링크 분기가 같은 내용을 그린다. */
function RegionLine({
  headerLines,
  metroCity,
  nearestStation,
  region,
}: {
  headerLines: string[];
  metroCity: ReturnType<typeof metroCityOf>;
  nearestStation: string | undefined;
  region: { name?: string; sido?: { name?: string } } | undefined;
}) {
  // 역 이름을 배지와 같은 노선색으로 물들인다 — 환승역은 첫 배지(가장 왼쪽 노선) 색을 따른다.
  // headerLines 는 이미 색을 찾은 노선만 남긴 것이라 색이 없으면 역 이름도 기본색으로 둔다.
  const stationColor = headerLines
    .map((line) => resolveLine(line, metroCity)?.bg)
    .find(Boolean);
  const stationText =
    nearestStation && stationLabel(nearestStation, headerLines.length > 0);
  const regionText = [region?.sido?.name, region?.name]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {headerLines.map((line) => (
        <LineBadge key={line} line={line} city={metroCity} />
      ))}
      <span>
        {stationText && (
          <span
            className={cn(stationColor && 'font-semibold')}
            style={stationColor ? { color: stationColor } : undefined}
          >
            {stationText}
          </span>
        )}
        {stationText && regionText && ' · '}
        {regionText}
      </span>
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { LangLink } from '@/shared/i18n/LangLink';
import { ChevronRight, Phone, Ambulance, Baby } from 'lucide-react';
import {
  distanceCeiling,
  formatDistance,
  stationLabel,
  type Hospital,
  type MatchedSubject,
} from '../api';
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
 * 카드가 놓이는 자리. **자리마다 필요한 정보의 양이 다르다** — 셋을 불리언으로 쪼개면
 * (compact && !nearby) 같은 조합이 생겨 어느 화면이 무엇을 보여주는지 읽어낼 수 없게 된다.
 *
 *   search   검색 결과. 목적지를 고르는 자리라 상세 주소·전화까지 전부 준다.
 *   brief    첫 페이지 추천. 훑어보는 자리라 이름을 줄이고 지역만 남긴다(역·전화 없음).
 *   nearby   상세 하단 "근처의 비슷한 병원". **역은 남기고 상세 주소·전화는 뺀다** —
 *            이미 그 동네를 보고 있는 사람이라 "어느 역 근처냐" 만 알면 되고,
 *            2열로 좁아진 카드에 상세 주소를 넣으면 두세 줄로 접힌다.
 */
export type HospitalCardVariant = 'search' | 'brief' | 'nearby';

/**
 * @param rank 목록에서 몇 번째인가. **지도의 번호 핀과 같은 숫자다** —
 *   이게 없으면 지도의 ②가 어느 카드인지 알 방법이 없다. nearby 에서만 준다.
 * @param distance 기준 병원으로부터의 직선거리(m). nearby 에서만 준다.
 * @param matchedSubjects 기준 병원과 겹친 진료과목. distance 와 같은 자리에서만 준다 —
 *   **이 카드가 왜 거기 떠 있는지**를 설명하는 값이라, 근거 없이 목록에 뿌리면 의미가 없다.
 */
export function HospitalCard({
  hospital,
  variant = 'search',
  rank,
  distance,
  matchedSubjects,
}: {
  hospital: Hospital;
  variant?: HospitalCardVariant;
  rank?: number;
  distance?: number;
  matchedSubjects?: MatchedSubject[];
}) {
  const { t } = useTranslation();

  // 노선색은 도시마다 다르고(부산 1호선은 주황, 서울 1호선은 남색) 노선 칸엔 지역이 없다.
  // 주소가 유일한 단서다. 색을 찾은 노선만 남긴다 — 카드는 한 줄로 위치를 알리는 자리다.
  const city = metroCityOf(hospital.location?.address);
  const lines = stationLines(hospital.location?.stationLine, city);

  // 검색만 상세 주소를 쓴다. 나머지는 "시도 시군구"(예: "서울특별시 종로구") — 없는 조각은 뺀다.
  const region = hospital.location?.region;
  const regionText = [region?.sido?.name, region?.name].filter(Boolean).join(' ');
  const locationText =
    variant === 'search' ? hospital.location?.address : regionText;

  // 역 배지는 추천 카드에서만 뺀다 — 카드가 좁아 지저분해진다.
  const showStation = variant !== 'brief' && !!hospital.location?.station;

  const inner = (
    <>
      {/*
        배지 줄. **규모가 맨 앞, 이름 위**다 — 상세 페이지와 같은 규칙이다.
        "상급병원인데 응급실도 있다" 가 이름보다 먼저 읽혀야 "지금 갈 수 있나" 를 바로 판단한다.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/*
          순위 번호. **지도의 번호 핀과 같은 숫자**라, 지도에서 ②를 보고 어느 카드인지 찾는
          유일한 단서다. 모양도 지도 핀과 맞춘다(진한 남색 원 + 흰 숫자).
        */}
        {rank !== undefined && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold tabular-nums text-white">
            {rank}
          </span>
        )}
        {/*
          거리는 **배지 줄 맨 앞**이다. 근처 목록에서 가장 먼저 비교하는 값이라 제일 왼쪽에 둔다.
          윤곽선으로 그려 등급·전문병원 같은 채워진 배지와 구분한다 — 병원의 속성이 아니라
          "지금 보고 있는 병원 기준" 의 값이라서, 같은 모양이면 성격이 섞여 읽힌다.
        */}
        {distance !== undefined && (
          <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
            {t('clinic.nearby.within', {
              distance: formatDistance(distanceCeiling(distance)),
            })}
          </span>
        )}
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
            variant === 'brief' && 'min-w-0 flex-1 truncate text-sm',
            // 2열로 좁아진 근처 카드도 이름이 줄바꿈되지 않게 한 줄로 자른다.
            variant === 'nearby' && 'min-w-0 flex-1 truncate',
          )}
        >
          {hospital.name}
        </h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
      </div>

      <dl className="mt-2 space-y-1.5 text-xs text-slate-600">
        {(showStation || locationText) && (
          <div className="flex items-start gap-1.5">
            <span className="break-keep">
              {/*
                지하철역이 주소보다 먼저다. 한국에서 위치를 가늠하는 1차 기준이고,
                "서울 종로구 대학로 101" 보다 "혜화역" 이 훨씬 빨리 읽힌다.
              */}
              {showStation && hospital.location?.station && (
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
        {/* 검색만 전화번호를 싣는다 — 나머지는 훑어보는 자리라 상세에서 본다. */}
        {variant === 'search' && hospital.tel && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{hospital.tel}</span>
          </div>
        )}
      </dl>

      {/*
        겹친 진료과목. **이 병원이 목록에 뜬 이유**다 — 순위를 설명하지 않으면
        "왜 이 병원이 먼저지?" 로 남는다.

        전문의를 둘 다 보유한 과목은 진하게 칠한다. 신고만 한 과목과 실제로 그 과 전문의가
        있는 곳은 대체재로서 무게가 다른데, 배지가 똑같이 생기면 그 차이가 안 보인다.
        셋을 넘으면 자른다 — 2열에서 카드가 좁아 "심장혈관흉부외과" 같은 긴 과목명이 두어 개만
        붙어도 줄이 넘어가고, 그러면 카드가 목록이 아니라 표처럼 읽힌다.
      */}
      {matchedSubjects && matchedSubjects.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {matchedSubjects.slice(0, MATCHED_SUBJECT_LIMIT).map((subject) => (
            <span
              key={subject.code}
              className={cn(
                'rounded px-1.5 py-0.5 text-xs',
                subject.specialist
                  ? 'bg-primary-50 font-medium text-primary-700'
                  : 'bg-slate-100 text-slate-600',
              )}
            >
              {subject.name}
            </span>
          ))}
          {matchedSubjects.length > MATCHED_SUBJECT_LIMIT && (
            <span className="text-xs text-slate-400">
              +{matchedSubjects.length - MATCHED_SUBJECT_LIMIT}
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <LangLink
      to={`/hospitals/${hospital.id}`}
      className={cn(
        'block rounded-2xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-md',
        // 2열 격자에서 옆 카드와 키를 맞춘다. 한 장이 과목 배지 때문에 길어져도 나란히 선다.
        variant === 'nearby' && 'h-full',
      )}
    >
      {inner}
    </LangLink>
  );
}

/** 배지로 보여줄 겹친 과목 수의 상한. 나머지는 "+N" 으로 접는다. */
const MATCHED_SUBJECT_LIMIT = 3;

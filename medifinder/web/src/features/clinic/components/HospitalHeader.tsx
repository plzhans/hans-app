import { useEffect, useRef, type RefObject } from 'react';
import { Ambulance, Baby, MapPin, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { LangLink } from '@/shared/i18n/LangLink';
import type { HospitalDetail } from '../api';
import { stationName, stationLabel } from '../api';
import { metroCityOf, stationLines } from '../lib/subwayLine';
import { LineBadge } from './LineBadge';

/**
 * 상세의 책갈피 탭.
 *
 * **비급여는 여기 없다** — 그것만 별도 페이지라 성격이 다르다.
 * **진료시간도 없다** — 소개 카드 안으로 합쳤다(HospitalDetail 의 소개 Section 주석 참고).
 * 탭은 카드 하나에 하나씩 붙는다. 카드 안의 소제목까지 탭으로 올리면 탭이 목차가 아니라
 * 목록이 되어, 어디로 가는지가 아니라 무엇이 있는지를 읽게 된다.
 */
export type DetailTab = 'subject' | 'scale' | 'assessment' | 'location';

export const DETAIL_TABS: { key: DetailTab }[] = [
  { key: 'subject' },
  { key: 'scale' },
  { key: 'assessment' },
  { key: 'location' },
];

/* -------------------------------------------------------------------------- */
/* 히어로 (파란 그라데이션 · 배지 · 법인 · 이름 · 지역)                          */
/* -------------------------------------------------------------------------- */

/**
 * 병원 히어로. **상세와 비급여 두 페이지가 공유한다.**
 *
 * **파란 그라데이션 위 흰 글씨다.** 흰 바탕에 검은 글씨로 두면 그 아래 흰 카드들과 구분이
 * 안 되어 화면이 한 덩어리로 늘어진다. 색을 깔면 "여기가 이 병원의 표지" 라는 것이
 * 읽기 전에 보이고, 아래 카드들이 그 위로 떠오른다.
 *
 * **앱바 밑으로 파고든다.** 위로 끌어올리고(-mt) 그만큼 안쪽 여백을 줘서(pt), 앱바가
 * 그라데이션 위에 배경 없이 얹힌다. 이렇게 하지 않으면 파란 히어로 위에 흰 바가 한 겹
 * 얹혀 시안과 달라진다.
 */
type HeroProps = {
  hospital: HospitalDetail;
  /**
   * 병원 이름. **앱바가 이걸 지켜본다** — 이름이 화면 위로 지나가는 순간 바가 흰색으로
   * 바뀌며 그 이름을 받는다(useScrolledPast). 두 페이지 다 필요해서 mode 밖에 둔다.
   * 콜백 ref 다 — 이름이 늦게(데이터가 온 뒤) 생기는 걸 훅이 알아채야 해서다.
   */
  nameRef?: React.Ref<HTMLHeadingElement>;
} & (
  | { mode: 'detail'; onRegionClick: (event: React.MouseEvent) => void }
  | { mode: 'npay' }
);

export function HospitalHero(props: HeroProps) {
  const { hospital } = props;
  const { t } = useTranslation();

  const subway = hospital.transport?.subway?.[0];
  const nearestStation = stationName(subway?.arrival);
  const metroCity = metroCityOf(hospital.location?.address);
  const headerLines = nearestStation ? stationLines(subway?.line, metroCity) : [];
  const region = hospital.location?.region;
  const specialtyFields = (hospital.capabilities ?? []).filter(
    (c) => c.type === 'specialty',
  );

  // 의원급(TIER1)은 등급 배지를 달지 않는다 — 종별 배지가 없으면 어차피 의원이라 군더더기다.
  const showTier = hospital.tier && hospital.tier.code !== 'TIER1';

  const regionText = [region?.sido?.name, region?.name].filter(Boolean).join(' · ');
  const stationText =
    nearestStation && stationLabel(nearestStation, headerLines.length > 0);

  /*
    지하철역 · 시도 · 시군구 한 줄.

    **역 이름을 노선색으로 물들이지 않는다.** 흰 글씨 자리라 남색 1호선을 얹으면 파란 배경에
    묻혀 안 읽힌다. 노선 배지는 그대로 두되(그건 제 색 바탕이 있다) 글자는 흰색으로 간다.
  */
  const regionLine = (
    <>
      {headerLines.length > 0 ? (
        headerLines.map((line) => (
          <LineBadge key={line} line={line} city={metroCity} />
        ))
      ) : (
        <MapPin className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">
        {stationText}
        {stationText && regionText && ' · '}
        {regionText}
      </span>
    </>
  );

  return (
    <div
      className="relative overflow-hidden px-5 pb-11 text-white lg:px-8 lg:pb-16"
      /*
        **앱바 밑으로 파고든다** — 앱바 높이(--nav-height)만큼 끌어올리고 그만큼 안을 비운다.
        이게 없으면 앱바가 제 자리를 차지한 채 배경이 없어서, 화면 맨 위에 회색 띠가
        그대로 드러난다(스크롤하면 그 띠만 남는다).

        **유틸리티 클래스가 아니라 인라인이다.** `mt-[calc(var(--nav-height)*-1)]` 로 적으면
        Tailwind 가 그 클래스를 아예 만들지 않는다 — 아무 오류도 안 나고 조용히 빠져서,
        빌드는 통과하는데 화면만 어긋난다. 실제로 그 버그를 한 번 냈다.
      */
      style={{
        backgroundImage: 'var(--gradient-hero)',
        marginTop: 'var(--hero-pull)',
        paddingTop: 'var(--hero-pad-top)',
      }}
    >
      {/* 오른쪽 위 광원. 그라데이션만으로는 평평해서, 빛이 한 군데서 오는 것처럼 보이게 한다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-14 -top-10 h-56 w-56 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,.18), rgba(255,255,255,0) 70%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        {(showTier ||
          specialtyFields.length > 0 ||
          hospital.emergency ||
          hospital.baby) && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {showTier && <HeroBadge>{hospital.tier!.name}</HeroBadge>}
            {specialtyFields.map((c) => (
              <HeroBadge key={c.code}>
                {c.name
                  ? `${c.name} ${t('clinic.specialtyHospital')}`
                  : t('clinic.specialtyHospital')}
              </HeroBadge>
            ))}
            {/*
              응급실·달빛은 **흰 바탕**이다. 다른 배지와 같은 반투명으로 두면 "이 병원이
              지금 열려 있나" 라는 가장 다급한 정보가 종별 배지와 같은 무게로 읽힌다.
            */}
            {hospital.emergency && (
              <HeroBadge solid="text-danger">
                <Ambulance className="h-3 w-3" />
                {t('clinic.badge.emergencyDetail')}
              </HeroBadge>
            )}
            {hospital.baby && (
              <HeroBadge solid="text-amber-600">
                <Baby className="h-3 w-3" />
                {t('clinic.badge.babyDetail')}
              </HeroBadge>
            )}
          </div>
        )}

        {/*
          법인명. **이름 위에 둔다** — 읽는 순서가 "어느 법인의 → 무슨 병원" 이라서다.
          아래에 두면 병원 이름을 읽고 나서 소속을 다시 올려다보게 되고, 그 자리는 이미
          지역 줄이 쓰고 있어 층위가 섞인다.

          배지가 아니라 그냥 텍스트다. 배지는 분류·상태(등급·응급·달빛)라 눌러서 거르는
          것처럼 읽히는데, 법인명은 거르는 축이 아니라 이 병원이 어디 소속인지일 뿐이다.
        */}
        {hospital.corpName && (
          <p className="text-xs font-medium text-white/85">{hospital.corpName}</p>
        )}

        <h1
          ref={props.nameRef}
          className="mt-0.5 text-[1.6rem] font-extrabold leading-tight tracking-tight sm:text-3xl lg:text-[2.35rem]"
        >
          {hospital.name}
        </h1>

        {/* 누르면 위치 섹션으로. 비급여에선 상세로 넘어가 위치로. */}
        {(region || nearestStation) &&
          (props.mode === 'detail' ? (
            <a
              href="#location"
              onClick={props.onRegionClick}
              className="mt-2 flex items-center gap-1.5 text-[0.8rem] text-white/90 no-underline"
            >
              {regionLine}
            </a>
          ) : (
            <LangLink
              to={`/hospitals/${hospital.id}#location`}
              className="mt-2 flex items-center gap-1.5 text-[0.8rem] text-white/90 no-underline"
            >
              {regionLine}
            </LangLink>
          ))}
      </div>
    </div>
  );
}

/** 히어로 배지. 기본은 반투명 흰 판, solid 를 주면 흰 바탕에 그 색 글씨가 된다. */
function HeroBadge({
  solid,
  children,
}: {
  solid?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-bold',
        solid ? cn('bg-white', solid) : 'bg-white/20 text-white',
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 탭 바                                                                       */
/* -------------------------------------------------------------------------- */

type TabBarProps = { hospital: HospitalDetail } & (
  | {
      mode: 'detail';
      barRef: RefObject<HTMLDivElement | null>;
      activeTab: DetailTab;
      onTabClick: (event: React.MouseEvent, key: DetailTab) => void;
      prefetchNpay: () => void;
    }
  | { mode: 'npay' }
);

/**
 * 책갈피 탭.
 *
 * **밑줄이 아니라 알약이다.** 밑줄 탭은 웹 문서의 목차 관습이고, 좁은 화면에서는 활성 표시가
 * 2px 선 하나뿐이라 눈에 잘 안 걸린다. 알약은 활성 항목이 통째로 칠해져서 곁눈질로도 보이고,
 * 남는 폭이 모자라면 가로로 밀리는 것이 자연스럽다(밑줄 탭이 가로 스크롤되면 잘린 선이 보인다).
 *
 * **앱바 바로 아래 붙는다**(top: --nav-height). 고정값으로 두면 노치 기기에서 겹친다.
 * 바탕은 페이지 바닥과 같은 회색이다 — 흰 카드 위를 지나갈 때 카드가 바 밑으로 사라지는
 * 것처럼 보여야지, 흰 바가 흰 카드를 덮으면 어디까지가 바인지 알 수 없다.
 */
export function DetailTabBar(props: TabBarProps) {
  const { hospital } = props;
  const { t } = useTranslation();

  const listRef = useRef<HTMLDivElement>(null);
  const activeKey = props.mode === 'detail' ? props.activeTab : 'npay';

  /**
   * 활성 알약을 화면 안으로 끌어온다.
   *
   * 한국어는 여섯 개가 390px 에 겨우 들어가지만 영어("Assessment"·"Non-covered")는 넘친다.
   * 스크롤 스파이가 화면 밖 탭을 활성으로 바꾸면 **아무 표시도 안 보이는 탭 바**가 된다.
   *
   * **scrollIntoView 를 쓰지 않는다.** 그건 스크롤되는 조상을 전부 훑어 올라가며 움직이는데,
   * 여기서 그 조상에는 페이지 자체가 들어간다 — 탭 바가 화면에 붙어 있지 않은 넓은 화면에서
   * 아래로 내려가면, 활성 탭이 바뀌는 순간 저 위의 탭 바를 보여주려고 **페이지가 통째로 위로
   * 튕겨 올라갔다.** 그래서 화면 맨 아래(근처 병원·푸터)에 아예 닿을 수가 없었다.
   * 우리가 원한 건 탭 줄의 가로 위치 하나뿐이라 그것만 직접 옮긴다.
   */
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[aria-selected="true"]');
    if (!list || !active) return;

    const listBox = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();

    // 이미 다 보이면 그대로 둔다 — 조금씩 움직이면 읽는 동안 탭 줄이 계속 흔들린다.
    if (activeBox.left >= listBox.left && activeBox.right <= listBox.right) return;

    list.scrollBy({
      left: activeBox.left - listBox.left - (listBox.width - activeBox.width) / 2,
      behavior: 'smooth',
    });
  }, [activeKey]);

  const pill = (active: boolean) =>
    cn(
      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[0.8rem] no-underline',
      'transition-all duration-150 ease-native active:scale-95',
      active
        ? 'bg-brand font-bold text-white shadow-brand-sm'
        : 'font-bold text-ink-subtle active:bg-surface-subtle',
    );

  return (
    <div
      ref={props.mode === 'detail' ? props.barRef : undefined}
      /*
        **넓은 화면에서는 붙지 않는다**(lg:static). 좁은 화면에서는 구역이 예닐곱 개라
        위로 올라가 붙어 있어야 손이 닿지만, 넓은 화면은 스크롤이 짧고 마우스가 있어서
        굳이 화면을 붙잡아 둘 이유가 없다 — 위 영역이 스크롤에 따라 접히거나 올라붙지 않고
        제 모습 그대로 흘러간다.
      */
      /*
        바탕이 화면 폭에 따라 다르다 — 시안이 그렇다.
          좁은 화면  페이지 바닥과 같은 반투명 회색. 이 바는 **붙어 있어서** 흰 카드가 그 밑을
                    지나가는데, 바까지 희면 어디까지가 바이고 어디부터가 카드인지 알 수 없다.
          넓은 화면  흰 띠 + 아래 테두리(시안의 .d-tabs). 붙어 있지 않으니 카드를 덮을 일이
                    없고, 파란 히어로와 회색 본문 사이에서 탭이 제 구역을 갖는다.
      */
      className="sticky z-30 bg-surface-sunken/90 backdrop-blur-lg lg:border-b lg:border-line lg:bg-surface lg:backdrop-blur-none"
      style={{ top: 'var(--detail-tabs-top)' }}
    >
      <div
        ref={listRef}
        role="tablist"
        className={cn(
          'mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-3 lg:px-8',
          // 스크롤 막대는 지운다 — 알약이 밀리는 것만 보이면 되고, 막대가 보이면 창처럼 읽힌다.
          '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {/* 평가 탭은 데이터가 있을 때만. 없는 병원이 절반이 넘는다. */}
        {DETAIL_TABS.filter(
          (detailTab) => detailTab.key !== 'assessment' || hospital.assessment,
        ).map((detailTab) => {
          const active =
            props.mode === 'detail' && props.activeTab === detailTab.key;

          // detail 은 이 페이지 안 앵커, npay 는 상세로 돌아가는 링크.
          return props.mode === 'detail' ? (
            <a
              key={detailTab.key}
              href={`#${detailTab.key}`}
              role="tab"
              aria-selected={active}
              onClick={(event) => props.onTabClick(event, detailTab.key)}
              className={pill(active)}
            >
              {t(`clinic.tabs.${detailTab.key}`)}
            </a>
          ) : (
            <LangLink
              key={detailTab.key}
              to={`/hospitals/${hospital.id}#${detailTab.key}`}
              role="tab"
              aria-selected={false}
              className={pill(false)}
            >
              {t(`clinic.tabs.${detailTab.key}`)}
            </LangLink>
          );
        })}

        {/*
          비급여. **선 하나로 갈라 둔다** — 다른 탭은 이 페이지 안의 구역이고 이건 다른
          페이지다. 나란히 두면 눌렀을 때 화면이 통째로 바뀌는 이유를 설명할 것이 없다.
        */}
        <span
          aria-hidden
          className="mx-1 my-2 w-px shrink-0 self-stretch bg-line"
        />
        {props.mode === 'detail' ? (
          <LangLink
            to={`/hospitals/${hospital.id}/npay`}
            role="tab"
            aria-selected={false}
            onMouseEnter={props.prefetchNpay}
            onTouchStart={props.prefetchNpay}
            onFocus={props.prefetchNpay}
            className={pill(false)}
          >
            <Receipt className="h-3.5 w-3.5" />
            {t('clinic.tabs.npay')}
          </LangLink>
        ) : (
          <span role="tab" aria-selected className={pill(true)}>
            <Receipt className="h-3.5 w-3.5" />
            {t('clinic.tabs.npay')}
          </span>
        )}
      </div>
    </div>
  );
}

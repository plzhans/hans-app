import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  MapPin,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Input } from '@/shared/ui/Input';
import { Combobox } from '@/shared/ui/Combobox';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils';
import {
  MORE_TABS,
  PRIMARY_TABS,
  type SearchState,
} from '../model/useSearchState';
import {
  AssessmentFilter,
  Chip,
  FilterRow,
  InfoHintScope,
} from './SearchFilterParts';

/** 자주 찾는 전문분야. 기본으로 이것만 보이고 나머지는 +N 으로 펼친다. */
const FEATURED_SPECIALTIES = ['OBGY', 'PED', 'OPH', 'ENT', 'JOINT', 'SPINE'];

/** 자주 찾는 보유장비 — 일반인이 "이 검사 되나" 물을 때의 장비다. */
const FEATURED_EQUIPMENTS = ['XRAY', 'CT', 'MRI', 'US'];

/** 자주 찾는 적정성평가 항목(원본 asmGrd 번호). */
const FEATURED_ASSESSMENTS = ['08', '24', '16', '12', '13', '14', '15'];

/**
 * 검색 조건 — 탭과 상세검색 패널.
 *
 * **보기 모드에 따라 자리가 바뀐다.** 목록에서는 결과 위에 눕고, 지도에서는 왼쪽에서 밀려
 * 나오는 레이어(서랍)가 된다 — 지도는 가로 폭을 다 써야 쓸모가 있어서다.
 */
export function SearchFilters({ state }: { state: SearchState }) {
  const { t } = useTranslation();
  const {
    activeTab,
    assessmentCds,
    baby,
    detailOpen,
    dirty,
    equipmentCds,
    equipments,
    filterDrawer,
    groups,
    inpatient,
    keyword,
    locate,
    locating,
    mapView,
    moreActive,
    moreOpen,
    moreRef,
    region,
    scopedAssessmentGroups,
    search,
    selectTab,
    selected,
    setDetailOpen,
    setFilterDrawer,
    setMoreOpen,
    sggus,
    sido,
    sidos,
    specialCds,
    specialistCds,
    specials,
    specialties,
    specialtyCds,
    subjectCds,
    subjects,
    tierCds,
    tiers,
    toOptions,
    update,
  } = state;

  return (
    <>
    {/*
      필터.

      **사이드바 안에서 따로 스크롤되지 않는다.** 한때 화면에 붙여 두고(sticky) 넘치는 만큼
      안쪽에서 스크롤하게 했는데, 그러면 스크롤 영역이 두 겹이 된다 — 트랙패드나 손가락을
      굴렸을 때 페이지가 움직일지 사이드바가 움직일지 예측이 안 되고, 경계에서 스크롤이
      걸린다. 조건이 길어지면(상세검색을 펼치면) 사이드바 안에서 또 헤매야 한다.

      지금은 **자기 높이를 그대로 차지하고 페이지와 함께 움직인다.** 스크롤은 하나뿐이다.
      (지도가 실제로 붙으면 붙박이가 될 쪽은 이 조건이 아니라 지도다 — 목록을 내리는 동안
      지도가 남아 있어야 하고, 그건 오른쪽 칸에서 따로 잡는다.)
    */}
    {/*
      서랍 뒤 가림막. 눌러서 닫는다. lg 이상에서는 조건이 서랍이 아니라 그냥 칸이라 없다.
    */}
    {mapView && filterDrawer && (
      <button
        type="button"
        aria-label={t('search.closeFilters')}
        onClick={() => setFilterDrawer(false)}
        className="fixed inset-0 z-40 bg-ink/40"
      />
    )}

    <InfoHintScope>
    <aside
      className={cn(
        mapView && [
          /*
            좁은 화면: 왼쪽에서 밀려 나오는 서랍. **여기서는 안쪽 스크롤이 맞다** —
            화면을 덮고 있어서 뒤 페이지는 잠겨 있고, 스크롤할 대상이 이것 하나다.
            (본문에 눕혀 둘 때 안쪽 스크롤을 주면 스크롤이 두 겹이 되어 안 된다.)
          */
          'fixed inset-y-0 left-0 z-50 w-[86vw] max-w-sm overflow-y-auto overscroll-contain bg-surface-sunken pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] shadow-pop',
          'transition-transform duration-200 ease-native',
          filterDrawer ? 'translate-x-0' : '-translate-x-full',
          /*
            **넓은 화면에서도 서랍 그대로다.** 지도 모드에서 조건이 칸을 하나 차지하면
            그만큼 지도가 좁아진다 — 지도는 넓을수록 쓸모가 커지고, 조건은 한 번 정하고
            나면 계속 볼 필요가 없다. 필요할 때만 위로 덮어 꺼낸다.
          */
        ],
      )}
    >
      {/* 서랍 머리. 닫기는 좁은 화면에서만 — 넓은 화면에서는 서랍이 아니다. */}
      {mapView && (
        <div className="mb-3 flex items-center justify-between px-4">
          <span className="text-[0.95rem] font-extrabold text-ink">
            {t('search.openFilters')}
          </span>
          <button
            type="button"
            onClick={() => setFilterDrawer(false)}
            aria-label={t('search.closeFilters')}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-body transition-transform duration-100 ease-native active:scale-90 active:bg-surface-subtle"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    {/*
      탭. **필터가 아니라 진입점이다.**
      찾는 사람이 서로 다르다 — 병원은 진료를 계획하는 사람, 응급실은 지금 당장 아픈 사람,
      달빛어린이는 밤에 아이가 열나는 부모다. 셋을 동시에 켜는 경우가 없어서 체크박스로 두면
      오히려 헷갈린다. 하나만 고르는 탭이 맞다.
    */}
    {/*
      탭. **알약 세그먼트다** — 회색 바닥 위에 켜진 탭만 흰색으로 떠오르고, 그 탭의 색
      (응급은 빨강·달빛은 남보라)을 글자와 아이콘이 그대로 쓴다.

      예전엔 폴더 탭이었다 — 회색 트랙 위에 흰 탭이 얹혀 아래 조건 패널로 이어지는 모양.
      페이지 바닥이 흰색에서 회색으로 바뀌면서 **트랙과 바닥이 같은 색**이 되어 탭이 떠
      보이지 않게 됐다. 상세 화면이 쓰는 알약과 같은 모양으로 맞춰 그 문제를 없앴다.
    */}
    {/*
      relative 래퍼. 더보기 드롭다운은 이 래퍼 기준으로 띄운다 —
      탭줄(overflow-x-auto)에 넣으면 세로로 잘리기 때문이다.
    */}
    <div className="relative" ref={moreRef}>
      <div
        role="tablist"
        className={cn(
          'flex gap-1 pb-2.5',
          mapView
            ? /*
                좁은 자리(서랍·사이드바)에서는 **줄을 바꾼다.** 가로로 밀면 뒤쪽 탭
                (달빛어린이·더보기)이 화면 밖에 숨는데, 밀 수 있다는 표시가 없어서
                아예 없는 것처럼 보인다. 서랍은 자기 여백이 이미 있어 좌우도 안 띄운다.
              */
              'mx-0 flex-wrap px-4'
            : // 본문에 누울 때는 한 줄을 지키고 넘치면 가로로 민다(줄이 늘면 결과가 밀린다).
              'overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {PRIMARY_TABS.map((tab) => {
          const active = tab === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(tab)}
              /*
                켜진 탭은 **패널과 같은 흰색**으로 띄운다 — 회색 트랙 위에 흰 탭이 얹히고
                그대로 아래 패널로 이어져, 폴더 탭처럼 "이 탭의 내용" 이라는 게 형태로 읽힌다.
                (예전엔 흰 배경 위에 흰 탭이라 배경으로는 구분이 안 됐다. 트랙을 깔아 해결.)
              */
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-sm transition-all duration-100 ease-native active:scale-95',
                active
                  ? cn('bg-surface font-extrabold shadow-card', tab.tone)
                  : 'font-bold text-ink-muted',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? tab.tone : 'text-ink-subtle',
                )}
              />
              {t(`search.tabs.${tab.key}`)}
            </button>
          );
        })}

        {/*
          더보기. 요양·정신을 접어둔 입구다. 그 안의 탭이 켜져 있으면(moreActive)
          버튼 자체를 그 탭인 것처럼 — 아이콘·이름·색을 그대로 빌려 — 흰 탭으로 띄운다.
        */}
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-2 text-sm transition-all duration-100 ease-native active:scale-95',
            // 한 줄로 밀 때만 오른쪽 끝으로 보낸다. 줄바꿈 모드에서는 탭 뒤에 그대로 붙는다.
            !mapView && 'ml-auto',
            moreActive
              ? cn('bg-surface font-extrabold shadow-card', activeTab.tone)
              : 'font-bold text-ink-muted',
          )}
        >
          {moreActive &&
            (() => {
              const Icon = activeTab.icon;
              return <Icon className={cn('h-4 w-4 shrink-0', activeTab.tone)} />;
            })()}
          {moreActive ? t(`search.tabs.${activeTab.key}`) : t('search.tabs.more')}
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform',
              moreOpen && 'rotate-180',
            )}
          />
        </button>
      </div>

      {/* 더보기 목록. overflow 밖에 둬야 세로로 안 잘린다. 오른쪽 정렬로 버튼 아래에 편다. */}
      {moreOpen && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop">
          {MORE_TABS.map((tab) => {
            const active = tab === activeTab;
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(tab)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  active
                    ? cn('bg-brand-tint font-extrabold', tab.tone)
                    : 'font-medium text-ink-body hover:bg-surface-subtle hover:text-ink',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? tab.tone : 'text-ink-subtle',
                  )}
                />
                {t(`search.tabs.${tab.key}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>

    {/* 켜진 탭의 검색 조건 패널. 탭과 하나의 상자로 이어진다. */}
    <div
      className={cn(
        'space-y-3 border border-line-subtle bg-surface p-4',
        /*
          서랍(모바일 지도 모드)에서는 **벽까지 닿는다.** 모바일은 그러잖아도 폭이 좁은데
          서랍 여백과 카드 여백이 겹치면 양쪽에서 28px 을 먹는다 — 그래서 서랍은 좌우 여백을
          아예 안 두고, 패널이 모서리·좌우 테두리·그림자를 뗀 채 벽에 붙는다.
          넓어지면(lg) 다시 홀로 서는 카드로 돌아온다.
        */
        mapView
          ? 'mx-0 border-x-0'
          : 'rounded-card shadow-card',
      )}
    >
      {/* 시도 | 시군구 | 병원명. 한 줄이다 — 지역을 좁히고 이름을 치는 게 한 동작이다. */}
      {/*
        좁은 화면에서는 **두 줄로 접는다.** 셀렉트 둘 + 입력 + 버튼을 390px 에 한 줄로 밀어 넣으면
        병원명 칸이 글자 몇 개 폭으로 쪼그라들어 무엇을 치는 칸인지도 안 보인다.
      */}
      {/*
        **`sm:` 는 뷰포트를 본다 — 이 칸의 폭이 아니다.** 서랍(86vw·최대 24rem)이나
        사이드바(21rem)는 창이 아무리 넓어도 좁은데, 창 기준으로 가로 배치가 켜지면
        시도·시군구·병원명·버튼이 그 폭에 밀려 들어가 잘린다. 그래서 폭이 아니라
        **모드**로 가른다 — 지도 모드면 어떤 창에서든 세로로 쌓는다.
      */}
      <div className={cn('flex flex-col gap-2', !mapView && 'sm:flex-row')}>
        <div className="flex flex-wrap gap-2">
          {/* 시도는 17개지만 목록으로 훑는 것보다 "부산" 이라고 치는 게 빠르다. */}
          <Combobox
            value={sido}
            onChange={(value) => update({ sido: value, region: '' })}
            /*
              내 위치로 지역 채우기. **셀렉트 목록 안에 둔다** — 여기서 고를 값(시도)을
              대신 정해 주는 일이라, 밖에 버튼으로 세우면 또 하나의 조건처럼 보이고
              좁은 화면에서는 그만큼 셀렉트가 좁아진다.

              **검색까지 하지는 않는다.** 다른 필터와 똑같이 초안(draft)에만 얹고
              검색 버튼을 누를 때 함께 나간다 — 과목·장비를 고르는 중일 수 있다.
            */
            action={{
              icon: <MapPin className="h-3.5 w-3.5" />,
              label: t('search.useMyLocation'),
              busy: locating,
              onSelect: async () => {
                const point = await locate();
                if (!point) return;
                update({
                  sido: point.sido.code,
                  // 세종처럼 시군구가 없는 시도면 비운다 — 시도만으로도 검색은 된다.
                  region: point.region?.code ?? '',
                });
              },
            }}
            options={toOptions(sidos)}
            placeholder={t('search.sido')}
            searchPlaceholder={t('search.sidoSearch')}
            allLabel={t('common.all')}
            className={cn('min-w-0 flex-1', !mapView && 'sm:w-28 sm:flex-none')}
          />

          {/* 시군구는 250개다. 스크롤로는 못 찾으니 타이핑해서 거른다. */}
          <Combobox
            value={region}
            onChange={(value) => update({ region: value })}
            options={toOptions(sggus)}
            placeholder={t('search.sggu')}
            searchPlaceholder={t('search.sgguSearch')}
            allLabel={t('common.all')}
            disabled={!sido}
            className={cn('min-w-0 flex-1', !mapView && 'sm:w-32 sm:flex-none')}
          />
        </div>

        <div className={cn('flex flex-1', mapView ? 'gap-2' : 'gap-3')}>
          {/* 돋보기를 칸 안에 둔다 — 버튼을 보기 전에 "여기가 검색어" 라는 게 먼저 읽힌다. */}
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <Input
              placeholder={t('search.hospitalName')}
              value={keyword}
              onChange={(e) => update({ q: e.target.value })}
              onKeyDown={(e) => {
                // 엔터로도 검색한다. 입력하고 버튼을 찾아 마우스를 옮기는 건 번거롭다.
                if (e.key === 'Enter') search();
              }}
              className="pl-9"
            />
          </div>

          <Button onClick={search} className="shrink-0">
            {t('search.submit')}
          </Button>
        </div>
      </div>

      {/*
        진료 분야 칩. 47개 진료과목을 환자가 아는 이름으로 묶은 것이다.
        칩이 켜졌는지는 **계산한다** — 선택된 과목이 그 그룹의 과목과 정확히 같으면 켜진 것.
        그래서 상세 검색에서 과목 하나를 빼면 칩이 저절로 풀리고, 다시 넣으면 저절로 켜진다.
        그룹을 별도 상태로 들면 이 동기화를 우리가 해야 하고, 반드시 어긋난다.
      */}
      {/*
        달빛어린이 탭에서는 진료 분야를 안 보여준다.
        달빛어린이병원은 **야간·휴일에 소아 진료만** 한다 — 153곳 전부 소아청소년과가 있고,
        내과·피부과가 붙어 있는 건 낮에 하는 진료지 밤에 하는 진료가 아니다.
        "달빛 + 피부과" 를 고를 수 있게 두면 사용자는 그게 의미 있다고 믿는다.
      */}
      {!baby && (
      <div className="flex flex-wrap gap-1.5">
        {groups?.map((group) => {
          const codes = group.subjects.map((s) => s.code);

          // 이 그룹의 과목이 **전부** 선택돼 있으면 켜진 것이다.
          // 상세 검색에서 하나만 빼도 저절로 꺼지고, 다시 넣으면 저절로 켜진다.
          const active = codes.every((code) => subjectCds.includes(code));

          // 복수 선택. 켜면 이 그룹의 과목을 더하고, 끄면 뺀다 — 다른 그룹은 건드리지 않는다.
          const next = active
            ? subjectCds.filter((code) => !codes.includes(code))
            : [...new Set([...subjectCds, ...codes])];

          return (
            <Chip
              key={group.code}
              active={active}
              onClick={() => update({ subject: next.join(',') })}
            >
              {group.name}
            </Chip>
          );
        })}
      </div>
      )}

      {/*
        상세 검색. 칩으로 안 되는 것만 여기 둔다 —
        개별 과목(지원과 포함 47개) · 병원 규모.
      */}
      <button
        type="button"
        onClick={() => setDetailOpen(!detailOpen)}
        className="flex items-center gap-1.5 text-[0.8rem] font-bold text-ink-muted transition-colors hover:text-ink"
      >
        <SlidersHorizontal className="h-4 w-4" />
        {t('search.advanced')}
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')}
        />
      </button>

      {detailOpen && (
        <div className="overflow-hidden rounded-xl border border-line-subtle bg-surface">
          {/*
            병원 규모가 맨 위다. **"동네 의원이냐 큰 병원이냐" 가 과목보다 먼저 정해진다** —
            감기면 의원, 수술이면 종합병원. 그걸 고르고 나서 과를 고른다.
            tier 컬럼 하나로 거른다 (종별 8개를 IN 절로 나열하지 않는다).
          */}
          {/* 요양·정신 탭에서는 규모를 안 보여준다 — 그 탭 자체가 이미 규모를 정한다. */}
          {!inpatient && (
            <FilterRow
              stacked={mapView}
              label={t('search.tier')}
              options={(tiers ?? []).map((t) => ({
                code: t.code,
                name: t.name,
                description: t.description,
              }))}
              selected={tierCds}
              onChange={(codes) => update({ tier: codes.join(',') })}
            />
          )}

          {/*
            진료과목 47개. **기본으로 접어 둔다** — 위의 진료 분야 칩으로 대부분 해결되고,
            여기까지 오는 사람은 지원과(영상의학·병리)처럼 칩에 없는 것을 찾는 소수다.
            달빛 탭에서는 아예 감춘다(소아 진료만 하므로 과목 선택이 의미 없다).
          */}
          {!baby && (
            <FilterRow
              stacked={mapView}
              label={t('search.subject')}
              options={subjects ?? []}
              selected={subjectCds}
              onChange={(codes) => update({ subject: codes.join(',') })}
              collapsible
              groupByField
            />
          )}

          {/*
            전문의. 진료과목과 같은 코드지만 그 과목 전문의를 실제로 보유한 병원만 건다
            (진료과목은 신고만 하면 걸림). 옵션은 전문과목(specialist)만 — 치과·한방응급은 빠진다.
            달빛 탭에서는 진료과목처럼 감춘다.
          */}
          {!baby && (
            <FilterRow
              stacked={mapView}
              label={t('search.specialist')}
              hint={t('search.specialistHint')}
              options={(subjects ?? []).filter((s) => s.specialist)}
              selected={specialistCds}
              onChange={(codes) => update({ specialist: codes.join(',') })}
              collapsible
              groupByField
            />
          )}

          {/* 전문병원 지정분야 (관절·척추·심장 …). 보건복지부 지정, 심평원 위탁 심사.
              자주 찾는 6개만 기본 노출, 나머지는 +N 으로 펼친다. */}
          <FilterRow
            stacked={mapView}
            label={t('search.specialty')}
            hint={t('search.specialtyHint')}
            options={specialties ?? []}
            selected={specialtyCds}
            onChange={(codes) => update({ specialty: codes.join(',') })}
            featured={FEATURED_SPECIALTIES}
          />

          {/*
            우수 병원(심평원 적정성평가). 22개 항목을 8분야로 묶어 보여주고, 고른 항목에서
            1등급인 병원을 찾는다. 긴 정식명(건강보험심사평가원 평가)은 ? 툴팁으로 뺐다.
            병원급 이상만 등급이 붙어서(의원은 이 항목을 평가받지 않음) tier 를 따로 강제하진 않는다.
          */}
          {scopedAssessmentGroups.length > 0 && (
            <AssessmentFilter
              stacked={mapView}
              label={t('search.assessmentLabel')}
              hint={t('search.assessmentHint')}
              groups={scopedAssessmentGroups}
              selected={assessmentCds}
              onChange={(codes) => update({ assessment: codes.join(',') })}
              featured={FEATURED_ASSESSMENTS}
            />
          )}

          {/* 보유장비 (CT·MRI·PET …). */}
          <FilterRow
            stacked={mapView}
            label={t('search.equipment')}
            options={equipments ?? []}
            selected={equipmentCds}
            onChange={(codes) => update({ equipment: codes.join(',') })}
            featured={FEATURED_EQUIPMENTS}
          />

          {/*
            특수진료 (방문진료·치매주치의 등 시범사업). **일반인이 가장 덜 찾는 필터라 맨 아래.**
            시범사업 대상이라 대상 병원도 적고 용어도 낯설다.
          */}
          <FilterRow
            stacked={mapView}
            label={t('search.special')}
            options={specials ?? []}
            selected={specialCds}
            onChange={(codes) => update({ special: codes.join(',') })}
            collapsible
          />

        </div>
      )}

      {/*
        선택한 것들. 칩·체크박스는 접히거나 스크롤 밖으로 나가서, 켜둔 걸 잊은 채
        "왜 결과가 이것뿐이지" 하게 된다. 여기서 x 로 바로 지운다.
          */}
      {/* 흰 바탕에 흰 칩이면 안 보인다 — 옅은 회색 판을 깔아 "지금 켜둔 것" 이 따로 읽히게 한다. */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-brand-wash px-2.5 py-2">
          {selected.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={item.remove}
              className="flex items-center gap-1 rounded-full bg-surface py-1 pl-2.5 pr-1.5 text-xs font-bold text-ink-body ring-1 ring-inset ring-line transition-transform duration-100 ease-native active:scale-95"
            >
              {item.name}
              <X className="h-3.5 w-3.5 text-ink-subtle" />
            </button>
          ))}

          <button
            type="button"
            onClick={() =>
              update({
                subject: '',
                specialist: '',
                tier: '',
                specialty: '',
                assessment: '',
                special: '',
                equipment: '',
              })
            }
            className="ml-1 text-[0.72rem] font-bold text-ink-muted transition-colors hover:text-brand"
          >
            {t('search.clearAll')}
          </button>
        </div>
          )}

      {/*
        검색 버튼. **늘 자리에 있다.**

        예전엔 조건이 바뀌었을 때만(dirty) 나타났다. 누를 이유가 없을 땐 감춘다는 뜻이었는데,
        정작 사용자는 조건을 고르는 내내 "그래서 검색은 어디서 하지" 를 찾게 된다 —
        버튼이 있다 없다 하면 그게 어디 있었는지조차 기억에 안 남는다.

        **패널 바닥에 붙어 따라온다**(sticky). 상세검색을 펼치면 조건이 화면 몇 개 길이가
        되는데, 그때 버튼이 맨 아래에만 있으면 끝까지 내려가야 누른다.
      */}
      <div className="sticky bottom-0 -mx-4 -mb-4 bg-surface px-4 pb-4 pt-3">
        <Button onClick={search} className="w-full">
          <SearchIcon className="h-4 w-4" />
          {dirty ? t('search.applyFilters') : t('search.submit')}
        </Button>
      </div>
    </div>
    </aside>
    </InfoHintScope>
    </>
  );
}

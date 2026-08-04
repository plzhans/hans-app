import { useTranslation } from 'react-i18next';
import {
  List as ListIcon,
  LocateFixed,
  Map as MapIcon,
  SlidersHorizontal,
} from 'lucide-react';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/lib/utils';
import { HospitalCard } from '@/features/clinic/components/HospitalCard';
import { MapView } from '@/shared/components/map/MapView';
import type { SearchState } from '../model/useSearchState';

/**
 * 검색 결과 — 건수 줄 · 지도 · 카드 목록.
 *
 * 지도 모드에서는 왼쪽 목록 1/3 · 오른쪽 지도 2/3 로 갈리고, 좁은 화면에서는 지도가 위로
 * 목록이 아래로 쌓인다. 그 판단은 이 안에서 끝난다 — 페이지는 어느 쪽인지만 넘긴다.
 */
export function SearchResults({ state }: { state: SearchState }) {
  const { t } = useTranslation();
  const {
    focusResult,
    focusedId,
    isError,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isWide,
    items,
    mapPoints,
    mapView,
    sentinelRef,
    setFilterDrawer,
    setView,
    sortBy,
    changeSort,
    needsCoords,
    locatingCoords,
    canSearchArea,
    searchArea,
  } = state;

  return (
    <section className={cn('mt-5 min-w-0', mapView && 'lg:mt-0')}>

    {/* 결과 목록의 제목 줄. 카드 바로 위에 붙여 "이 아래가 결과" 임을 잇는다. */}
    {/*
      **전부 왼쪽에 모은다** — 버튼 먼저, 건수가 그 뒤.

      조건·보기를 바꾸는 것은 손이 가는 일이라 눈이 먼저 닿는 왼쪽에 두고, 건수는 그 결과로
      따라 읽는 값이라 바로 옆에 붙인다. 한때 건수를 반대편 끝으로 보냈는데, 지도 모드에서는
      그 끝이 **지도 위**라 왼쪽 목록을 설명하는 값이 엉뚱한 자리에 떠 있게 됐다.

      row-reverse + justify-end: 화면에는 [버튼][건수] 순으로 왼쪽부터 쌓인다.
      (DOM 순서는 건수가 먼저다 — 스크린리더가 "20건" 을 먼저 읽는 편이 맞다.)
    */}
    <div className="mb-2.5 flex flex-row-reverse items-center justify-end gap-3 px-1">
      <p className="min-w-0 truncate text-[0.85rem] font-extrabold text-ink">
        {isLoading
          ? t('common.loading')
          : t('search.count', { count: items.length })}
        {isFetching && !isLoading && !isFetchingNextPage && (
          <span className="ml-1.5 text-[0.75rem] font-medium text-ink-subtle">
            {t('search.refreshing')}
          </span>
        )}
      </p>

      <div className="flex shrink-0 items-center gap-1.5">
      {/* 조건 서랍 열기. 지도 모드의 좁은 화면에서만 — 그때만 조건이 화면 밖에 있다. */}
      {mapView && (
        <button
          type="button"
          onClick={() => setFilterDrawer(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[0.75rem] font-bold text-ink-body shadow-card ring-1 ring-inset ring-line transition-transform duration-100 ease-native active:scale-95"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t('search.openFilters')}
        </button>
      )}

      {/*
        정렬. **보기 전환 옆이다** — 둘 다 "결과를 어떻게 볼까" 라 같은 묶음으로 읽힌다.

        토글 하나다(기본↔가까운 순). 선택지가 둘뿐인데 드롭다운을 열게 하면 무엇이 있는지
        보려고 한 번 더 눌러야 한다 — 지금 무엇으로 정렬돼 있는지도 접힌 채로 숨는다.
      */}
      <button
        type="button"
        onClick={() => void changeSort(sortBy === 'distance' ? 'default' : 'distance')}
        disabled={locatingCoords}
        aria-pressed={sortBy === 'distance'}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.75rem] font-bold shadow-card ring-1 ring-inset transition-transform duration-100 ease-native active:scale-95',
          sortBy === 'distance'
            ? 'bg-brand text-white ring-brand'
            : 'bg-surface text-ink-body ring-line',
          locatingCoords && 'opacity-60',
        )}
      >
        <LocateFixed className={cn('h-3.5 w-3.5', locatingCoords && 'animate-pulse')} />
        {t('search.sortNearest')}
      </button>

      {/*
        보기 전환. **결과 줄에 둔다** — 무엇을 보고 있는지(N건) 바로 옆이 "그걸 어떻게
        볼까" 를 정하는 자리다. 조건 패널에 넣으면 필터의 하나처럼 읽힌다.
      */}
      <button
        type="button"
        onClick={() => setView(mapView ? 'list' : 'map')}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[0.75rem] font-bold text-ink-body shadow-card ring-1 ring-inset ring-line transition-transform duration-100 ease-native active:scale-95"
      >
        {mapView ? (
          <ListIcon className="h-3.5 w-3.5" />
        ) : (
          <MapIcon className="h-3.5 w-3.5" />
        )}
        {mapView ? t('search.viewList') : t('search.viewMap')}
      </button>
      </div>
    </div>

    {/*
      지도 자리. **아직 지도를 띄우지 않는다.**
      지금 검색 API 는 지역 코드(region)로만 거를 수 있고 좌표·영역(bbox) 파라미터가 없다 —
      지도를 움직여 그 영역을 다시 검색하는, 이 화면의 핵심 동작을 못 만든다. 결과에 좌표는
      이미 들어 있으므로(LocationDto.lat/lon) 서버가 영역 검색을 주면 여기에 핀부터 붙인다.
    */}

    {/*
      지도 모드의 본문. **왼쪽 목록 1/3 · 오른쪽 지도 2/3.**

      지도는 넓을수록 쓸모가 커지고(핀 사이가 벌어져야 고를 수 있다) 목록은 훑는 자리라
      좁아도 된다. 높이를 화면에 맞춰 고정하고 **목록만 안에서 스크롤**한다 — 그래야
      목록을 내리는 동안 지도가 화면에 남는다(에어비앤비가 그렇게 한다).

      좁은 화면에서는 나누지 않는다. 지도가 위, 목록이 아래로 쌓이고 페이지가 통째로
      스크롤된다 — 1/3 로 쪼개면 어느 쪽도 쓸 수 없는 폭이 된다.
    */}
    <div
      className={cn(
        mapView &&
          'lg:grid lg:h-[calc(100vh-10rem)] lg:grid-cols-[1fr_2fr] lg:gap-4',
      )}
    >
      {/* 지도. DOM 에서 앞에 두어 좁은 화면에서 위로 오게 하고, 넓으면 오른쪽 칸으로 보낸다. */}
    {mapView &&
      (mapPoints.length > 0 ? (
        <div className={cn('relative mb-3', mapView && 'lg:col-start-2 lg:row-start-1 lg:mb-0 lg:h-full')}>
          {/*
            "이 지역에서 검색". **지도 위에 띄운다** — 방금 옮긴 그 지도를 보면서 누르는
            버튼이라, 화면 밖(조건 패널·결과 줄)에 두면 무엇에 대한 검색인지 끊긴다.

            **지도를 옮겨야 나타난다.** 늘 떠 있으면 지도의 한가운데를 상시로 가리는데,
            정작 누를 일은 자리를 옮겼을 때뿐이다. 판정은 상태가 한다(canSearchArea).
          */}
          {canSearchArea && (
            <button
              type="button"
              onClick={searchArea}
              className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-brand px-4 py-2 text-[0.78rem] font-extrabold text-white shadow-pop transition-transform duration-100 ease-native active:scale-95"
            >
              {t('search.searchThisArea')}
            </button>
          )}
          <MapView
            // 지도의 가운데. 결과 중 첫 좌표를 쓰고, 나머지가 다 들어오게 확대율이 맞춰진다.
            lat={mapPoints[0].lat}
            lng={mapPoints[0].lng}
            name={mapPoints[0].name}
            nearby={mapPoints}
            // 검색 결과에는 '기준 병원' 이 없다 — 가운데 회색 점을 그리지 않는다.
            anchor={false}
            /*
              화면 높이를 따라간다. 목록을 훑다가 지도를 보는 화면이라 지도가 한 화면을
              다 먹으면 안 되고, 그렇다고 고정 높이로 두면 넓은 모니터에서 우표만 해진다.
              아래위로 한계를 둔 채(clamp) 뷰포트의 절반쯤을 쓴다.
            */
            height={isWide ? '100%' : 'clamp(18rem, 55vh, 38rem)'}
            onSelect={focusResult}
            onBoundsChange={state.handleBoundsChange}
            /*
              영역으로 검색한 뒤에는 확대율을 다시 맞추지 않는다 — 사용자가 정한 자리에서
              지도가 밀려나면 버튼을 누른 대가가 "화면이 엉뚱한 데로 감" 이 된다.
            */
            fitToPoints={!state.searchedBounds}
          />
          <p className="!mb-0 !mt-2 px-1 text-[0.7rem] text-ink-subtle">
            {t('search.mapNote', { count: mapPoints.length })}
          </p>
        </div>
      ) : (
        <div className="mb-3 flex h-56 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-6 text-center">
          <MapIcon className="h-6 w-6 text-ink-subtle" />
          <p className="!my-0 text-sm font-bold text-ink-body">
            {t('search.mapEmpty')}
          </p>
        </div>
      ))}

      <div
        className={cn(
          mapView && 'lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto',
        )}
      >
    {isLoading && (
      <div className="py-12 text-center">
        <Spinner />
      </div>
    )}
    {isError && (
      <p className="py-12 text-center text-danger">{t('common.loadError')}</p>
    )}

    {/*
      거리순인데 좌표가 없다. 링크로 ?sort=distance 를 받고 들어왔거나 위치를 거부한 경우다.

      **빈 목록을 보여주지 않는다** — 조건에 맞는 병원이 없는 것과 위치를 못 얻은 것은
      해야 할 일이 다르다(조건을 고치는 것 vs 위치를 허용하는 것). 여기서는 그대로 눌러
      다시 시도할 수 있게 둔다.
    */}
    {needsCoords && !locatingCoords && (
      <div className="py-12 text-center">
        <p className="text-ink-muted">{t('search.nearestNeedsLocation')}</p>
        <button
          type="button"
          onClick={() => void changeSort('distance')}
          className="mt-3 rounded-full bg-brand px-4 py-2 text-[0.8rem] font-bold text-white shadow-brand transition-transform duration-100 ease-native active:scale-95"
        >
          {t('search.allowLocation')}
        </button>
      </div>
    )}

    {/*
      **목록 모드에서만 2열로 편다.** 1920px 화면에서 768px 한 줄만 쓰면 좌우가 텅 빈다.

      지도 모드는 1열 그대로다 — 거기서는 오른쪽 칸을 결과와 지도가 나눠 쓰기 때문에,
      결과가 2열로 벌어지면 지도가 설 자리가 없다. 두 모드가 애초에 다른 갈래라
      나중에 지도가 실제로 붙어도 이쪽은 손댈 일이 없다.
    */}
    <div className={cn('grid gap-2.5', !mapView && 'xl:grid-cols-2')}>
      {items.map((h) => (
        /*
          지도에서 고른 카드를 잠깐 칠한다. 감싸는 div 에 거는 이유는 HospitalCard 가
          홈·상세와 공용이라, 검색에서만 필요한 표식을 그쪽까지 들고 가지 않으려는 것이다.
          scroll-mt: 스크롤해서 데려올 때 위 고정 헤더에 가리지 않게 비운다.
        */
        <div
          key={h.id}
          id={`search-result-${h.id}`}
          className={cn(
            'scroll-mt-24 rounded-tile transition-shadow duration-300',
            focusedId === String(h.id) && 'ring-2 ring-brand ring-offset-2',
          )}
        >
          {/*
            거리는 **거리순으로 조회했을 때만** 서버가 준다(그때만 기준 좌표가 있다).
            기본 정렬이면 undefined 라 카드가 알아서 안 그린다.
          */}
          <HospitalCard hospital={h} distance={h.distance} />
        </div>
      ))}
    </div>

    {items.length === 0 && !isLoading && !needsCoords && (
      <p className="py-12 text-center text-ink-muted">{t('search.empty')}</p>
    )}

    {/* 무한스크롤 센티넬 — 화면에 들어오면(바닥 근처) 다음 페이지를 부른다 */}
    <div ref={sentinelRef} className="h-1" aria-hidden />
    {isFetchingNextPage && (
      <div className="py-6 text-center">
        <Spinner />
      </div>
    )}
      </div>
    </div>
    </section>
  );
}

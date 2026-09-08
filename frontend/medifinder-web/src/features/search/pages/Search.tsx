import { cn } from '@/shared/lib/utils';
import { useSeo } from '@/shared/seo/useSeo';
import { useTranslation } from 'react-i18next';
import { useSearchState } from '../model/useSearchState';
import { SearchFilters } from '../components/SearchFilters';
import { SearchResults } from '../components/SearchResults';

export default function SearchPage() {
  /*
    상태는 전부 훅이 든다(useSearchState). 여기 남은 것은 **어떻게 배치하느냐** 뿐이다 —
    보기 모드에 따라 조건이 본문에 눕는지 레이어로 뜨는지, 결과와 지도가 칸을 어떻게 나누는지.
  */
  const { t } = useTranslation();
  const state = useSearchState();
  const { heading, mapView } = state;

  // 제목은 화면의 h1 과 같은 문장을 쓴다 — 검색 결과에 뜨는 줄과 화면에 보이는 줄이 같다.
  useSeo({ title: heading, description: t('seo.search.description') });

  return (
    /*
      **보기 모드가 배치를 정한다.**
        목록  조건이 위에 눕고 결과가 그 아래 — 여느 검색 화면과 같은 순서다.
        지도  조건이 왼쪽 사이드바로 서고 오른쪽을 지도가 쓴다.

      지도에서만 사이드바인 이유는, 지도가 가로 폭을 다 써야 쓸모가 있어서다. 목록만 볼 때까지
      조건을 옆으로 밀어두면 좁아진 사이드바에서 체크박스가 줄줄이 줄바꿈된다.
    */
    <div
      className={cn(
        /*
          모바일에서도 좌우를 띄우되 **최소치만** 준다(3px). 예전엔 px-0 이라 결과 카드가
          화면 끝에 붙어 잘린 것처럼 읽혔다. 그렇다고 넉넉히 주면 그러잖아도 좁은 폭에서
          카드가 한 번 더 안으로 밀려 병원 이름·주소가 일찍 줄바꿈된다. 목록은 훑는 자리라
          **내용 폭이 우선**이고, 여백은 "화면에 붙어 있지 않다" 는 것만 보이면 된다.

          rem 이 아니라 px 인 이유: 기준 글자 크기가 17px 이라 px-1 조차 4.25px 이 된다.
          이 값은 글자와 함께 커질 이유가 없는 물리적 여백이다.
        */
        'mx-auto px-[3px] py-4 sm:py-6',
        mapView
          ? // 지도는 화면을 꽉 쓴다. 조건은 레이어로 떠 있어 여기서 자리를 차지하지 않는다.
            'max-w-none'
          : // 목록만 볼 때는 아주 넓은 화면(xl~)에서 폭을 연다. 그 아래는 읽기 좋은 768px.
            'max-w-3xl xl:max-w-6xl',
      )}
    >
      {/*
        화면 제목. **한 줄로 자른다** — 지역·진료과 이름이 길어도 두 줄로 늘어나면
        그만큼 아래가 밀린다(조건이 늦게 도착하면 그게 그대로 레이아웃 이동이 된다).
      */}
      <h1 className="mb-3 truncate px-1 text-lg font-extrabold tracking-tight text-ink">
        {heading}
      </h1>

      <SearchFilters state={state} />

      <SearchResults state={state} />
    </div>
  );
}

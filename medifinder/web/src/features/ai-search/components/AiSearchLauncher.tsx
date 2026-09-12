import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useAiSearchPanel } from '../model/AiSearchPanel';

/** 화면 아래에서 띄우는 기본 간격(px). 세이프에어리어는 여기에 더해진다. */
const BOTTOM_GAP = 16;

/**
 * 푸터에 가려지지 않도록 띄워야 할 높이(px).
 *
 * **`fixed` 는 스크롤과 무관하게 화면에 붙어 있어서, 페이지 끝까지 내려가면 푸터 위에
 * 그대로 얹힌다.** 푸터에는 약관·문의처 링크가 있어 가리면 안 된다.
 *
 * 그래서 푸터가 화면 안으로 들어온 만큼(`innerHeight - top`) 버튼을 위로 민다 —
 * 스크롤을 내릴수록 버튼이 푸터를 타고 올라가 항상 그 바로 위에 선다.
 *
 * **푸터에 ref 를 심지 않고 DOM 으로 찾는다.** Footer 는 공용 컴포넌트라 이것 하나 때문에
 * prop 을 뚫으면 쓰는 쪽마다 전달해야 한다. 문서에 `<footer>` 는 하나뿐이라 질의로 충분하다.
 */
function useFooterOffset(): number {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const { top } = footer.getBoundingClientRect();
      // 푸터가 아직 화면 밖이면 0. 들어온 만큼만 밀어 올린다.
      setLift(Math.max(0, window.innerHeight - top));
    };
    // 스크롤마다 레이아웃을 읽으므로 프레임당 한 번으로 묶는다.
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return lift;
}

/**
 * AI 문의 진입 버튼과 패널을 한 벌로 묶은 것. **레이아웃이 이걸 하나 달면 끝난다.**
 *
 * [떠 있는 버튼(FAB)인 이유]
 * "검색으로 못 찾겠다" 는 홈에서만 생기지 않는다 — 결과를 훑다가, 조건을 바꿔 보다가 생긴다.
 * 화면 안에 박아 두면 그 순간 스크롤을 올려 찾아야 하고, 대개는 그냥 포기한다.
 *
 * 오른쪽 아래에 두는 것은 **패널이 거기서 열리기 때문**이다. 버튼과 패널이 다른 구석에 있으면
 * 누른 것과 뜬 것이 이어져 보이지 않는다.
 *
 * [상세 화면에는 안 단다]
 * 거기는 하단 전화 바(BottomCallBar)가 `fixed bottom-0` 로 그 자리를 이미 쓴다. 얹으면
 * "전화하기" 를 가리는데, 병원 상세에서 그건 양보할 수 있는 행동이 아니다.
 * 그래서 MainLayout(홈·검색)에만 붙는다.
 */
export function AiSearchLauncher() {
  const { t } = useTranslation();
  const panel = useAiSearchPanel();
  const lift = useFooterOffset();

  return (
    <>
      {/*
        **창을 여기서 그리지 않는다.** 여는 곳이 둘(이 버튼과 홈 검색창 아래)이라
        창은 AiSearchProvider 가 하나만 들고 있고, 여기서는 열어 달라고만 한다.

        **열려 있으면 버튼을 감춘다.** 둘 다 오른쪽 아래라 그대로 두면 버튼이 패널 위에
        얹히거나 패널 그림자에 반쯤 묻힌다. 닫는 길은 패널 안의 X 와 Esc 다.
      */}
      {!panel.isOpen && (
        <button
          type="button"
          onClick={panel.open}
          aria-label={t('aiSearch.title')}
          /*
            bottom 을 클래스가 아니라 인라인으로 잡는 이유는 푸터 오프셋이 실시간 픽셀이라서다.
            transform 은 비워 둔다 — 누름 효과(active:scale-95)가 그 자리를 쓴다.
          */
          style={{
            bottom: `calc(env(safe-area-inset-bottom) + ${BOTTOM_GAP + lift}px)`,
          }}
          className="
            fixed right-4 z-40 flex h-11 items-center gap-1.5 rounded-full
            bg-brand pl-3 pr-4 text-white shadow-brand
            transition-transform duration-100 ease-native active:scale-95
            sm:right-5
          "
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          {/*
            라벨. **좁은 화면에서는 아이콘만** 남긴다 — 결과 목록 위에 뜨는 물건이라
            폭을 넓게 잡으면 마지막 카드의 오른쪽을 계속 가린다.

            beta 꼬리표는 여기 안 붙인다. 눌러서 열면 패널 제목 옆에 바로 보이고,
            버튼에까지 달면 이 작은 알약에 요소가 셋이 되어 뭘 누르는지가 흐려진다.
          */}
          <span className="hidden text-[0.8rem] font-bold sm:inline">
            {t('aiSearch.launcher')}
          </span>
        </button>
      )}
    </>
  );
}

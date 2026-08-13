import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LangLink } from '@/shared/i18n/LangLink';
import { formatBuildStamp } from '@/shared/lib/buildStamp';
import { APP_BUILT_AT, APP_ENV, APP_RELEASE } from '../../config/env';
import { CONTACT_EMAIL } from '../../config/contact';

/**
 * 하단 고지.
 *
 * **긴 고지는 여기 두지 않는다.** 서비스 소개·데이터 정확성·출처는 한때 이 자리에 있었는데,
 * 푸터의 글은 찾아 읽는 것이 아니라 눈길이 스치는 자리라 정작 필요한 사람에게 안 닿는다.
 * 진료과목·진료시간·비급여 진료비를 실제로 읽는 곳은 병원 상세이므로 고지도 거기로 옮겼다.
 *
 * 법인이라면 대표·사업자등록번호·통신판매업신고번호가 따라붙지만 여기는 개인 운영이라
 * 그 블록이 통째로 없다 — 표시 의무가 있는 항목이 아니라서 빈칸을 만들지 않는다.
 * 남는 것은 브랜드·약관 링크·책임 한계 한 줄·운영 주체·저작권이다.
 *
 * [배치]
 * 흔한 웹 푸터 그대로다 — 왼쪽에 브랜드, 오른쪽에 링크, 그 아래 고지, 맨 밑에 부가 정보와
 * 저작권. **한 항목에 한 줄씩 세로로 쌓지 않는다.** 푸터의 글은 대부분 찾아 읽는 것이 아니라
 * 눈길이 스치는 것이라, 줄이 늘어난 만큼 본문이 위로 밀리기만 한다. 짧은 항목은 가운뎃점으로
 * 이어 붙이고, 좁은 화면에서는 flex-wrap 이 알아서 접는다.
 */
export function Footer() {
  const { t } = useTranslation();
  return (
    // 세이프에어리어(홈 인디케이터) 위로 마지막 줄이 걸리지 않게 아래를 더 띄운다.
    <footer className="border-t border-line bg-surface pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto max-w-7xl px-4 text-xs text-ink-subtle">
        {/* 1단 — 왼쪽 브랜드, 오른쪽 링크. 좁으면 링크가 다음 줄로 내려간다. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p>
            <span className="font-bold text-ink-muted">{t('app.name')}</span>
            <span className="ml-2">{t('app.tagline')}</span>
          </p>

          {/*
            약관·방침은 **밑줄 있는 링크로** 둔다. 푸터의 나머지 글이 전부 읽기만 하는 문장이라,
            같은 회색 글자로 두면 누를 수 있다는 것을 아무도 모른다.
          */}
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <LangLink
              to="/terms/service"
              className="text-ink-muted underline active:text-brand"
            >
              {t('legal.terms')}
            </LangLink>
            <Dot />
            <LangLink
              to="/terms/location"
              className="text-ink-muted underline active:text-brand"
            >
              {t('legal.locationTerms')}
            </LangLink>
            <Dot />
            <LangLink
              to="/terms/privacy"
              className="text-ink-muted underline active:text-brand"
            >
              {t('legal.privacy')}
            </LangLink>
            <Dot />
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-ink-muted no-underline active:text-brand"
            >
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>

        {/*
          **안내는 여기 없지만 책임 한계는 여기다.** 서비스 소개(disclaimer)·정확성(accuracy)·
          출처(dataSource)는 병원 상세로 옮겼다 — 진료과목·진료시간·비급여 진료비를 실제로
          읽는 자리가 거기고, 안내는 읽히는 자리에 있어야 의미가 있다(i18n 키는 그대로 둔다).

          반대로 **우리가 무엇의 당사자가 아닌지는 모든 화면에 붙어 있어야 한다.** 어느 페이지를
          보다가 병원에 전화를 걸든 그 전에 눈에 닿아야 하는 문장이라, 전 페이지 하단인 여기가
          제자리다. 같은 업계가 이 자리에 같은 성격의 한 줄을 두는 이유도 같다.

          다만 문장은 그쪽 것을 못 가져온다. 굿닥·강남언니는 통신판매중개자라 "통신판매의
          당사자가 아니다" 를 적을 의무가 있지만(전자상거래법 제20조의2), 우리는 거래를 중개하지
          않는다 — 그 문장을 베끼면 하지도 않는 통신판매를 한다고 알리는 꼴이 된다.
        */}
        <div className="mt-4 border-t border-line pt-4">
          <p className="max-w-4xl leading-relaxed">{t('footer.liability')}</p>

          {/* 운영 주체와 저작권은 짧아서 한 줄에 마주 세운다. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p>{t('footer.operator')}</p>
            <Copyright />
          </div>
        </div>
      </div>
    </footer>
  );
}

/** 연속 클릭으로 인정할 간격. 이보다 뜸하면 처음부터 다시 센다. */
const REVEAL_CLICK_GAP_MS = 1500;
/** 몇 번 눌러야 열리나. */
const REVEAL_CLICKS = 5;

/**
 * 저작권 표시. **다섯 번 연달아 누르면 산출물 정보가 나온다**(포털·인증웹과 같은 장치다).
 *
 * 늘 띄워 두지 않는 건 이용자에게는 아무 의미가 없는데 화면만 어수선해지기 때문이다.
 * 그렇다고 볼 방법이 없으면 "지금 배포된 게 뭔지" 확인하려고 매번 개발자도구를 열어야 한다.
 *
 * **서버 버전은 적지 않는다.** 이 앱이 부르는 API 는 병원 데이터를 주는 곳이라 화면과 같이
 * 배포되지 않고, 여기서 확인할 값도 아니다 — 그건 포털·인증웹 푸터가 하는 일이다.
 *
 * **구운 시각을 버전 옆에 같이 둔다.** 같은 커밋을 두 번 배포하면 버전도 sha 도 똑같아서,
 * 그것만으로는 지금 뜬 화면이 방금 올린 것인지 가릴 수 없다.
 *
 * 버튼으로 만들지 않는다. role 을 붙이는 순간 스크린 리더와 키보드 탭 순서에 "누를 수 있는
 * 것" 으로 드러나서, 숨겨 둔 의미가 없어진다.
 */
function Copyright() {
  const [shown, setShown] = useState(false);
  const clicks = useRef(0);
  const lastClickAt = useRef(0);

  function handleClick() {
    const now = Date.now();
    clicks.current =
      now - lastClickAt.current > REVEAL_CLICK_GAP_MS ? 1 : clicks.current + 1;
    lastClickAt.current = now;

    if (clicks.current >= REVEAL_CLICKS) {
      clicks.current = 0;
      // 다시 다섯 번 누르면 닫힌다. 한 번 연 걸 되돌릴 방법이 새로고침뿐이면 곤란하다.
      setShown((prev) => !prev);
    }
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {/*
        다섯 번 누르는 동안 글자가 블록으로 잡히면 지저분하다 — select-none 으로 막고,
        커서도 그대로 둬서 누를 수 있는 자리처럼 보이지 않게 한다.
      */}
      <span onClick={handleClick} className="cursor-default select-none">
        © {'2026'} medifinder.kr
      </span>
      {shown && (
        // 환경 · 버전 · 구운 시각 순. 앞에서부터 좁혀 읽힌다.
        <span
          className="font-mono text-ink-muted"
          title={`구운 시각 · ${APP_BUILT_AT}`}
        >
          {APP_ENV} · v{APP_RELEASE} {formatBuildStamp(APP_BUILT_AT)}
        </span>
      )}
    </p>
  );
}

/** 항목 사이 구분점. 읽어 줄 내용이 없으니 스크린 리더에서는 숨긴다. */
function Dot() {
  return (
    <span aria-hidden className="text-line">
      ·
    </span>
  );
}

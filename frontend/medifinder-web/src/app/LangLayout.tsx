import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/shared/i18n';
import { langPath, stripLang } from '@/shared/i18n/routing';

/**
 * 정식 URL 을 만들 때 쓰는 사이트 주소.
 * canonical·hreflang 은 **절대 URL 이어야** 검색엔진이 언어 묶음을 이해한다.
 */
const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  'https://medifinder.kr';

/** 이 문서가 만든 태그만 지운다. index.html 이 넣은 것과 섞이지 않게 표시를 달아 둔다. */
const MARK = 'data-i18n-seo';

/**
 * 언어 레이아웃. **URL 의 접두사를 실제 언어로 만든다.**
 *
 * 하는 일이 셋이다.
 *   1. i18n 언어를 URL 에 맞춘다 (URL 이 단일 진실 공급원이다)
 *   2. <html lang> 을 바꾼다 — 스크린리더·번역기·검색엔진이 이걸 본다
 *   3. canonical + hreflang 을 넣는다 — 같은 페이지의 언어별 판본을 서로 묶어 준다.
 *      이게 없으면 검색엔진은 /en-us/search 와 /search 를 **중복 콘텐츠**로 보고 하나를 버린다.
 *
 * **주의: 이건 CSR 이라 크롤러가 JS 를 실행해야 이 태그들이 생긴다.** 구글은 대체로 하지만
 * 네이버(Yeti)는 못 한다. 실제 SEO 효과는 SSR/프리렌더가 붙어야 나온다 —
 * 여기서 URL 구조를 먼저 잡아 두는 것은 그때 이 구조를 그대로 쓰기 위해서다.
 */
export function LangLayout({ lang }: { lang: SupportedLanguage }) {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();

  // 언어는 렌더 중에 맞춘다. useEffect 로 미루면 첫 페인트가 이전 언어로 한 번 그려진다.
  if (i18n.language !== lang) {
    void i18n.changeLanguage(lang);
  }

  useEffect(() => {
    document.documentElement.lang = lang;

    for (const el of document.querySelectorAll(`link[${MARK}]`)) {
      el.remove();
    }

    const bare = stripLang(pathname);
    const head = document.head;

    const add = (rel: string, href: string, hreflang?: string) => {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = `${SITE_URL}${href}`;
      if (hreflang) link.hreflang = hreflang;
      link.setAttribute(MARK, '');
      head.appendChild(link);
    };

    // 이 페이지의 정식 주소. 지금 언어 판본이 곧 canonical 이다.
    add('canonical', langPath(bare, lang));

    // 언어별 판본. x-default 는 "언어가 안 맞으면 여기로" — 기본 언어 URL 을 준다.
    for (const l of SUPPORTED_LANGUAGES) {
      add('alternate', langPath(bare, l), l);
    }
    add('alternate', langPath(bare, 'ko'), 'x-default');
  }, [lang, pathname]);

  return <Outlet />;
}

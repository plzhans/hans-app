import * as RadixSelect from '@radix-ui/react-select';
import { Check, Globe } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@/shared/i18n';
import { langPath, stripLang } from '@/shared/i18n/routing';
import { cn } from '@/shared/lib/utils';

const LABELS: Record<string, string> = {
  ko: '한국어',
  'en-us': 'English',
  ja: '日本語',
  'zh-hans': '中文',
};

/**
 * 언어 전환. **URL 을 바꾼다 — i18n 상태만 바꾸지 않는다.**
 *
 * 예전엔 `i18n.changeLanguage()` 만 불렀다. 그러면 화면은 영어가 되는데 주소는 그대로라,
 * 그 URL 을 공유하면 상대는 한국어를 본다. 지금은 언어가 URL 에 있으니(LangLayout 이 그걸 읽는다)
 * 경로만 갈아 끼우면 언어는 저절로 따라온다. 쿼리(검색 조건)는 그대로 들고 간다.
 *
 * 버튼 나열에서 셀렉트로 바꿨다. 언어가 넷을 넘어가면 버튼이 헤더를 밀어낸다.
 * 앱 다른 곳과 같은 Radix Select 라이브러리로 그려서 목록 스타일·접근성을 통일한다.
 */
export function LanguageSwitcher({
  /**
   * 아이콘만. **상세 내비바용이다** — 거기엔 뒤로가기·제목·공유가 이미 폭을 다투고 있어,
   * "Language" 다섯 글자가 붙으면 병원 이름이 그만큼 일찍 말줄임된다. 그 화면은 언어를
   * 바꾸러 오는 자리가 아니라(이미 URL 에 언어가 들어 있다) 막다른 길을 막아두는 것뿐이다.
   */
  compact = false,
}: { compact?: boolean } = {}) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  // 지금 언어. i18n.language 는 SUPPORTED_LANGUAGES 의 값(`en-us` 등) 그대로다 —
  // 서브태그를 자르면 Select 항목 값(`en-us`)과 안 맞아 체크가 안 뜬다.
  const current = isSupportedLanguage(i18n.language)
    ? i18n.language
    : DEFAULT_LANGUAGE;

  return (
    <RadixSelect.Root
      value={current}
      onValueChange={(lng) =>
        navigate(
          `${langPath(stripLang(pathname), lng as SupportedLanguage)}${search}${hash}`,
        )
      }
    >
      <RadixSelect.Trigger
        aria-label="Language"
        className={cn(
          'inline-flex items-center justify-center gap-1.5 font-medium',
          'focus:outline-none focus:ring-2 focus:ring-brand/30',
          compact
            ? // 앱바 안. 뒤로가기 버튼과 같은 크기·모양이라 좌우가 대칭으로 읽힌다.
              // **색을 스스로 정하지 않는다**(text-current) — 파란 히어로 위에서는 희고
              // 흰 바에서는 먹색이어야 하는데, 그 판단은 앱바가 한다.
              'h-[2.35rem] w-[2.35rem] rounded-box text-current transition-transform duration-150 ease-native active:scale-90 active:bg-current/10'
            : 'rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-subtle',
        )}
      >
        <Globe className={cn(compact ? 'h-5 w-5' : 'h-4 w-4 text-ink-subtle')} />
        {/* 선택된 언어명이 아니라 영어 "Language" 를 고정 표시한다.
            "中文" 만 떠 있으면 그 언어를 못 읽는 사람은 전환 메뉴인 줄 모른다.
            영어는 어느 언어권에서도 대체로 알아보므로 여기가 언어 바꾸는 곳임을 안다.
            지금 언어가 뭔지는 열었을 때 목록의 체크 표시로 보인다. */}
        {!compact && <span>Language</span>}
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          align="end"
          sideOffset={6}
          className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <RadixSelect.Viewport className="p-1">
            {SUPPORTED_LANGUAGES.map((lng) => (
              <RadixSelect.Item
                key={lng}
                value={lng}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none',
                  'data-[highlighted]:bg-slate-50 data-[state=checked]:font-medium data-[state=checked]:text-primary-600',
                )}
              >
                <RadixSelect.ItemText>{LABELS[lng] ?? lng}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Check className="h-4 w-4" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

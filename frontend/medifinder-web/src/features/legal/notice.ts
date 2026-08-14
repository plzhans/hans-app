import type { TFunction } from 'i18next';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@/shared/i18n';
import type { LegalDoc } from './content';

/**
 * 문서 위에 띄우는 안내들. 없으면 빈 배열이다.
 *
 * 안내문은 전부 화면 언어로 나간다 — 한국어를 못 읽는 이용자에게 하는 말이라
 * 한국어로 적으면 뜻이 없다(조문 자체는 한국어 한 벌뿐이다).
 */
export function legalNotices(
  doc: LegalDoc,
  lang: SupportedLanguage,
  t: TFunction,
): string[] {
  const notices: string[] = [];

  const pending = pendingRevision(doc);
  if (pending) notices.push(t('legal.revisionPending', { date: pending }));

  if (lang !== DEFAULT_LANGUAGE) notices.push(t('legal.koreanOnly'));

  return notices;
}

/**
 * 아직 시행 전이면 시행일을, 이미 시행됐으면 undefined 를 준다.
 *
 * **이 배너가 약관 제3조·방침 제16조의 "시행 7일 전 공지" 를 이행하는 자리다.** 조문이
 * 약속한 것을 코드가 실제로 하지 않으면 그 조문이 거짓이 되므로, 개정할 때 시행일만
 * 미래로 적어 두면 배너가 저절로 뜨고 시행일이 지나면 저절로 사라지게 해 뒀다.
 * (로그인한 이용자에게 메일로도 알리는 부분은 계정 계층이 맡는다.)
 */
function pendingRevision(doc: LegalDoc): string | undefined {
  // 시행일 당일부터는 시행된 것으로 본다 — 자정을 기준으로 끊는다.
  const effective = new Date(`${doc.effectiveDate}T00:00:00`);
  if (Number.isNaN(effective.getTime())) return undefined;
  if (Date.now() >= effective.getTime()) return undefined;
  return doc.effectiveDate;
}

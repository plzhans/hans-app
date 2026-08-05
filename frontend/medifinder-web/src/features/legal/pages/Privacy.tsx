import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '@/shared/i18n';
import { privacyFor } from '../content';
import { LegalDocumentView } from '../components/LegalDocumentView';
import { translationNotice } from '../notice';

export default function Privacy() {
  const { t, i18n } = useTranslation();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

  return (
    <LegalDocumentView doc={privacyFor(lang)} notice={translationNotice(lang, t)} />
  );
}

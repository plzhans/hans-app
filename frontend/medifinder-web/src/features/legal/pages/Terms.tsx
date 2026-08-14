import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '@/shared/i18n';
import { termsDoc } from '../content';
import { LegalDocumentView } from '../components/LegalDocumentView';
import { legalNotices } from '../notice';

export default function Terms() {
  const { t, i18n } = useTranslation();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;

  return (
    <LegalDocumentView doc={termsDoc} notices={legalNotices(termsDoc, lang, t)} />
  );
}

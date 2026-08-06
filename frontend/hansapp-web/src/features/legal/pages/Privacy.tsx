import { Gnb } from '@/shared/components/Gnb';
import { privacyDoc } from '../content';
import { LegalDocumentView } from '../components/LegalDocumentView';

/** HansApp 계정 개인정보처리방침. **로그인 없이 열려야 한다** — 가입 화면이 여기를 링크한다. */
export default function Privacy() {
  return (
    <div className="min-h-full">
      <Gnb />
      <main>
        <LegalDocumentView doc={privacyDoc} />
      </main>
    </div>
  );
}

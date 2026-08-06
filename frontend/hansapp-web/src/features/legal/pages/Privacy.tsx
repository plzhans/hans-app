import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { privacyDoc, LegalDocumentView } from '../content';


/** HansApp 계정 개인정보처리방침. **로그인 없이 열려야 한다** — 가입 화면이 여기를 링크한다. */
export default function Privacy() {
  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className="flex-1">
        <LegalDocumentView doc={privacyDoc} />
      </main>
      <Footer />
    </div>
  );
}

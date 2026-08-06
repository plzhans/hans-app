import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { accountTermsDoc, LegalDocumentView } from '../content';


/** HansApp 계정 이용약관. **로그인 없이 열려야 한다** — 가입 화면이 여기를 링크한다. */
export default function Terms() {
  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className="flex-1">
        <LegalDocumentView doc={accountTermsDoc} />
      </main>
      <Footer />
    </div>
  );
}

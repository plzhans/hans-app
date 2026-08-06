import { Gnb } from '@/shared/components/Gnb';
import { accountTermsDoc } from '../content';
import { LegalDocumentView } from '../components/LegalDocumentView';

/** HansApp 계정 이용약관. **로그인 없이 열려야 한다** — 가입 화면이 여기를 링크한다. */
export default function Terms() {
  return (
    <div className="min-h-full">
      <Gnb />
      <main>
        <LegalDocumentView doc={accountTermsDoc} />
      </main>
    </div>
  );
}

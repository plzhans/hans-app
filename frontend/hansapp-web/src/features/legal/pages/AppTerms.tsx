import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { apiTermsDoc, LegalDocumentView } from '../content';

/** HansApp API 이용약관. 앱을 등록하기 전에 동의하는 문서라 로그인 없이 열린다. */
export default function AppTerms() {
  return (
    <div className="flex min-h-full flex-col">
      <Gnb />
      <main className="flex-1">
        <LegalDocumentView doc={apiTermsDoc} />
      </main>
      <Footer />
    </div>
  );
}

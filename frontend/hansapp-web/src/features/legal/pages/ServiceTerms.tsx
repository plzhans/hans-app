import { Gnb } from '@/shared/components/Gnb';
import { Footer } from '@/shared/components/Footer';
import { accountTermsDoc, LegalDocumentView } from '../content';

/**
 * HansApp 계정 이용약관. **로그인 없이 열려야 한다** — 가입 화면이 여기를 링크한다.
 * 다만 공개와 색인은 다른 문제다.
 * 검색에는 노출하지 않는다 — robots.txt 가 /terms 크롤을 막고, 그걸 안 지키는 크롤러용으로
 * scripts/seo/generate.ts 가 noindex 를 HTML 에 구워 둔다.
 */
export default function ServiceTerms() {
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

import { useTranslation } from 'react-i18next';
import { CONTACT_EMAIL } from '../../config/contact';

/**
 * 하단 고지.
 *
 * 브랜드 줄보다 **면책 문구가 본체다.** 우리는 공공데이터를 정리해 보여줄 뿐이고 진료의
 * 당사자가 아닌데, 병원 정보를 이만큼 자세히 늘어놓으면 우리가 보증하는 것처럼 읽힌다.
 * 같은 업계(굿닥 등)가 footer 에 중개자 고지를 박아 두는 것도 같은 이유다.
 *
 * 다만 그쪽은 법인이라 대표·사업자등록번호·통신판매업신고번호가 따라붙는다. 여기는 개인
 * 운영이라 그 블록이 통째로 없다 — 표시 의무가 있는 항목이 아니라서 빈칸을 만들지 않는다.
 * 대신 남는 것은 (1) 우리 역할의 한계, (2) 원본 데이터의 출처다. 공공데이터는 출처 표시가
 * 이용 조건이기도 하다.
 */
export function Footer() {
  const { t } = useTranslation();
  return (
    // 세이프에어리어(홈 인디케이터) 위로 마지막 줄이 걸리지 않게 아래를 더 띄운다.
    <footer className="border-t border-line bg-surface pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto max-w-3xl px-4 text-center text-xs text-ink-subtle">
        <p className="font-bold text-ink-muted">{t('app.name')}</p>
        <p className="mt-1">{t('app.tagline')}</p>
        <p className="mt-2">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-ink-muted no-underline active:text-brand"
          >
            {CONTACT_EMAIL}
          </a>
        </p>

        {/* 고지는 읽히라고 두는 것이라 가운데 정렬을 풀고 왼쪽으로 세운다.
            여러 줄짜리 문단을 가운데 맞추면 줄 시작점이 들쭉날쭉해 눈이 못 따라간다. */}
        <div className="mt-5 border-t border-line pt-4 text-left leading-relaxed">
          <p>{t('footer.disclaimer')}</p>
          <p className="mt-2">{t('footer.accuracy')}</p>
          <p className="mt-3 text-ink-subtle">{t('footer.dataSource')}</p>
          <p className="mt-1">{t('footer.operator')}</p>
        </div>

        <p className="mt-4">© {'2026'} medifinder.kr</p>
      </div>
    </footer>
  );
}

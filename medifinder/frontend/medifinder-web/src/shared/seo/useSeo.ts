import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 문서 제목과 meta description 을 라우트마다 세운다.
 *
 * **왜 필요한가.** 이 앱은 index.html 한 장으로 모든 화면을 그린다. 그래서 손대지 않으면
 * 홈·검색·병원 상세·약관이 전부 같은 제목을 쓴다 — 검색 결과에 뜨는 이름이 병원 이름이
 * 아니라 사이트 이름이 되고, 같은 제목의 페이지가 수만 개면 검색엔진은 그걸 중복으로 보고
 * 대부분을 색인에서 뺀다.
 *
 * **CSR 의 한계는 그대로다.** 여기서 세운 제목은 JS 를 실행하는 크롤러만 본다.
 * 네이버 Yeti 와 카카오톡 미리보기 봇은 index.html 의 정적 제목을 그대로 읽는다.
 * 프리렌더가 붙어야 완전해진다 — 그때 이 함수가 만드는 값을 그대로 구워 내면 된다.
 *
 * **비어 있으면 건드리지 않는다.** 상세 화면은 병원 이름을 받아야 제목을 만들 수 있는데,
 * 데이터가 오기 전에 빈 제목으로 덮으면 그 사이 제목이 사라진다. undefined 를 넘기면
 * LangLayout 이 세워 둔 기본값이 그대로 남고, 데이터가 도착하면 그때 갈아 끼운다.
 */
export type Seo = {
  /** 사이트 이름을 뺀 이 화면만의 제목. 예: '모내가의원' */
  title?: string;
  description?: string;
};

/** 여러 조각을 이어 붙일 때 생기는 빈칸을 정리한다(지역이 없으면 그 자리가 빈다). */
function tidy(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function setDescription(description: string) {
  let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = 'description';
    document.head.appendChild(tag);
  }
  tag.content = description;
}

/**
 * 지금 문서에 값을 적는다. 훅 밖에서도 부른다 — LangLayout 이 라우트가 바뀔 때
 * 기본값을 세울 때 쓴다(그 화면이 자기 제목을 안 세워도 이전 화면 제목이 남지 않게).
 */
export function applySeo({ title, description }: Seo, suffix: string) {
  if (title) document.title = tidy(`${title}${suffix}`);
  if (description) setDescription(tidy(description));
}

/**
 * 화면에서 부르는 쪽. 사이트 이름 접미사는 여기서 붙인다 — 언어마다 다를 수 있어
 * (`| MediFinder` / `— MediFinder`) 번역 파일이 정하고, 화면은 자기 제목만 넘긴다.
 */
export function useSeo(seo: Seo) {
  const { t } = useTranslation();
  const suffix = t('seo.titleSuffix');
  const { title, description } = seo;
  useEffect(() => {
    applySeo({ title, description }, suffix);
  }, [title, description, suffix]);
}

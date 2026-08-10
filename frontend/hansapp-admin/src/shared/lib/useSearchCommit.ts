import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** 조건 한 벌. 값은 URL 에 실리는 그대로의 문자열이고, 해석은 쓰는 쪽이 한다. */
export type SearchFilters = Record<string, string>;

export interface SearchCommit {
  /**
   * 검색을 눌러 URL 에 실린 조건. **아직 안 눌렀으면 null 이다** — 이 값이 null 인 동안은
   * 조회를 걸지 않는다(useQuery 의 enabled 에 그대로 쓴다).
   */
  readonly committed: SearchFilters | null;
  /** 화면에서 만지고 있는 조건. 여기를 바꿔도 조회는 나가지 않는다. */
  readonly draft: SearchFilters;
  /** 초안 일부를 바꾼다. */
  readonly setDraft: (patch: SearchFilters) => void;
  /** 초안을 커밋한다(= 검색). 페이지는 1 로 되돌린다. */
  readonly commit: () => void;
  readonly page: number;
  readonly goPage: (page: number) => void;
  /** 초안이 커밋된 것과 다른가. 아직 안 눌렀다는 표시에 쓴다. */
  readonly dirty: boolean;
}

/**
 * 조건을 **초안**과 **커밋**으로 나눠 든다. 검색을 눌러야 조회가 나간다.
 *
 * 로그 표는 대상을 가리지 않고 기간으로 훑는 조회라 한 번이 무겁다. 칩을 누를 때마다
 * 질의가 나가면 조건을 고르는 동안 DB 가 계속 얻어맞는다 — 기간을 바꾸고 종류를 고르고
 * 결과를 좁히는 사이에 이미 서너 번이다. 그래서 조건을 바꾸는 것과 조회하는 것을 가른다.
 *
 * **커밋된 조건은 URL 에 둔다.** 새로고침해도 보던 화면이 남고 링크를 그대로 넘길 수 있다.
 * 조건이 실린 URL 로 들어오면 그 자체를 커밋으로 본다 — 링크를 받은 사람에게 검색을 한 번
 * 더 누르게 할 이유가 없다.
 *
 * 페이지 이동은 검색과 별개다. 이미 커밋된 조건 위에서 하는 행동이라 바로 나간다.
 *
 * @param defaults 조건의 기본값. **여기 적힌 키만** URL 을 오간다.
 *   값이 하나도 없으면 커밋해도 URL 에 남는 게 없어 '검색 전' 으로 되돌아간다 —
 *   기간처럼 항상 값이 있는 조건이 최소 하나는 있어야 한다(로그 표는 어차피 기간이 필수다).
 */
export function useSearchCommit(defaults: SearchFilters): SearchCommit {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(defaults);

  // URL 에 조건이 하나라도 실려 있으면 검색을 누른 상태로 본다.
  const searched = keys.some((key) => params.has(key));
  const fromUrl = read(params, defaults);
  const committed = searched ? fromUrl : null;

  const [draft, setDraftState] = useState<SearchFilters>(fromUrl);

  /*
    URL 이 바뀌면 초안을 맞춘다 — 뒤로가기로 이전 조건에 돌아왔는데 화면의 칩이 그대로면
    보이는 것과 조회된 것이 어긋난다. 커밋 직후에는 같은 값이라 아무 일도 일어나지 않는다.
  */
  // 값에 무엇이 들어와도 서로 안 섞이게 JSON 으로 굳힌다(검색어에는 공백도 콤마도 들어온다).
  const signature = JSON.stringify(keys.map((key) => params.get(key) ?? ''));
  useEffect(() => {
    setDraftState(read(params, defaults));
    // signature 가 URL 의 조건을 대표한다. params 객체는 렌더마다 새로 와 의존성이 못 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const setDraft = (patch: SearchFilters) =>
    setDraftState((prev) => ({ ...prev, ...patch }));

  const commit = () => {
    const next = new URLSearchParams();
    // 빈 값은 URL 에 남기지 않는다("전체" 를 고른 것과 조건을 안 준 것이 같다).
    for (const key of keys) {
      if (draft[key]) next.set(key, draft[key]);
    }
    setParams(next);
  };

  const goPage = (page: number) => {
    const merged = new URLSearchParams(params);
    merged.set('page', String(page));
    setParams(merged);
    window.scrollTo({ top: 0 });
  };

  return {
    committed,
    draft,
    setDraft,
    commit,
    page: Math.max(1, Number(params.get('page') ?? 1) || 1),
    goPage,
    dirty: keys.some((key) => draft[key] !== (committed?.[key] ?? defaults[key])),
  };
}

/** URL 에서 조건을 읽는다. 없는 키는 기본값으로 채운다. */
function read(params: URLSearchParams, defaults: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    out[key] = params.get(key) ?? fallback;
  }
  return out;
}

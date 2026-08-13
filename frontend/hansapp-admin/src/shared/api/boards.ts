import { apiFetch } from '@/shared/api/client';
import type { CacheState } from '@/shared/components/CachePanel';

/** 글을 쓸 수 있는 사람. 백엔드 BoardWriteRole 과 같은 값. */
export type BoardWriteRole = 'ADMIN' | 'MEMBER';

/** HIDDEN 은 공개 API 에서 사라진다(콘솔에서는 보인다). */
export type BoardStatus = 'ACTIVE' | 'HIDDEN';

/**
 * 게시판 한 줄.
 *
 * **name 은 기계가 쓰는 이름, title 은 사람이 읽는 이름이다.** 주소에 실리는 것은 name 이라
 * 소문자·숫자·하이픈만 받는다.
 */
export interface Board {
  id: number;
  name: string;
  title: string;
  description?: string | null;
  writeRole: BoardWriteRole;
  /** 댓글을 받는 게시판인가. **글의 설정보다 위에 있다.** */
  commentEnabled: boolean;
  /** 좋아요를 받는 게시판인가. 댓글과 같은 규칙. */
  likeEnabled: boolean;
  secretPostEnabled: boolean;
  secretCommentEnabled: boolean;
  status: BoardStatus;
  sortOrder: number;
  /** 이 게시판의 글 수(상태 무관). 0 이 아니면 삭제가 막힌다. */
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 만들 때 보내는 것. 스위치를 빼면 서버가 끈 것으로 본다. */
export interface BoardCreateBody {
  name: string;
  title: string;
  description?: string;
  writeRole?: BoardWriteRole;
  commentEnabled?: boolean;
  likeEnabled?: boolean;
  secretPostEnabled?: boolean;
  secretCommentEnabled?: boolean;
  status?: BoardStatus;
  sortOrder?: number;
}

/** 고칠 때. **보낸 값만 바뀐다** — 빠진 값은 서버가 그대로 둔다. */
export type BoardUpdateBody = Partial<BoardCreateBody>;

export const listBoards = () => apiFetch<Board[]>('/api/boards');

export const createBoard = (body: BoardCreateBody) =>
  apiFetch<Board>('/api/boards', { method: 'POST', body: JSON.stringify(body) });

export const updateBoard = (id: number, body: BoardUpdateBody) =>
  apiFetch<Board>(`/api/boards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteBoard = (id: number) =>
  apiFetch<void>(`/api/boards/${id}`, { method: 'DELETE' });

/** 삭제함 한 줄. 게시판 정보에 지운 시각과 되살릴 이름 후보가 붙는다. */
export interface DeletedBoard extends Board {
  deletedAt: string;
  /** 비켜 두기 전 이름. **지금도 비어 있다는 보장은 없다.** */
  suggestedName: string;
}

export const listDeletedBoards = () =>
  apiFetch<DeletedBoard[]>('/api/boards/deleted');

/** 되살린다. 이름이 이미 쓰이고 있으면 409 로 거절된다. */
export const restoreBoard = (id: number, name: string) =>
  apiFetch<Board>(`/api/boards/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

/**
 * 포털이 쓰는 공개 게시판 목록 캐시(`board:list`).
 *
 * **글 캐시와 같은 모양이다** — 콘솔이 같은 패널(CachePanel)로 보여 준다.
 */
export const getBoardListCacheState = () => apiFetch<CacheState>('/api/boards/cache');

export const purgeBoardListCache = () =>
  apiFetch<void>('/api/boards/cache/purge', { method: 'POST' });

/** 이 게시판과 그 안의 글 캐시를 함께 지운다. 지운 글 캐시 수를 돌려준다. */
export const purgeBoardCache = (id: number) =>
  apiFetch<{ deletedPosts: number }>(`/api/boards/${id}/cache/purge`, {
    method: 'POST',
  });

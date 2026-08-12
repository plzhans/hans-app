import { apiFetch } from '@/shared/api/client';

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

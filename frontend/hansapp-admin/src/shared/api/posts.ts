import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';

/** 글·댓글을 쓴 주체의 갈래. 번호(id)가 어느 표의 것인지를 이 값이 정한다. */
export type AuthorType = 'USER' | 'ADMIN';

/**
 * 쓴 사람. **한 객체로 온다** — 프로필 사진처럼 뒤에 붙을 것이 여기 들어온다.
 *
 * name 은 쓸 당시의 표시 이름 사본이라 그 뒤에 이름을 바꿔도 옛 글은 그대로다.
 * 공개 API(포털)는 관리자 글의 이름을 'HansApp' 으로 바꿔 내보낸다 — 콘솔은 실명을 본다.
 */
export interface PostAuthor {
  type: AuthorType;
  id: number;
  name: string;
}

/** DRAFT(작성 중)·PUBLISHED(공개)·HIDDEN(내림). 공개 API 는 PUBLISHED 만 본다. */
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

/** 목록 한 줄. **본문은 없다** — 상세에서만 온다. */
export interface Post {
  id: number;
  boardId: number;
  title: string;
  summary?: string | null;
  author: PostAuthor;
  commentEnabled: boolean;
  secret: boolean;
  pinned: boolean;
  status: PostStatus;
  publishedAt?: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostDetail extends Post {
  /** 본문(마크다운). */
  content: string;
}

export interface PostListParams {
  page?: number;
  size?: number;
  status?: PostStatus;
  keyword?: string;
}

/** 쓰기·수정 공통. 수정도 본문을 통째로 보낸다(에디터가 통째로 들고 있다). */
export interface PostWriteBody {
  title: string;
  content: string;
  summary?: string;
  commentEnabled?: boolean;
  secret?: boolean;
  pinned?: boolean;
  status?: PostStatus;
}

export function listPosts(boardId: number, params: PostListParams = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return apiFetch<PageResponse<Post>>(
    `/api/boards/${boardId}/posts?${query.toString()}`,
  );
}

export const getPost = (id: number) => apiFetch<PostDetail>(`/api/posts/${id}`);

export const createPost = (boardId: number, body: PostWriteBody) =>
  apiFetch<PostDetail>(`/api/boards/${boardId}/posts`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updatePost = (id: number, body: PostWriteBody) =>
  apiFetch<PostDetail>(`/api/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deletePost = (id: number) =>
  apiFetch<void>(`/api/posts/${id}`, { method: 'DELETE' });

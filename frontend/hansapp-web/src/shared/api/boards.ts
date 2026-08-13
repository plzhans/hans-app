import { apiFetch } from '@/shared/api/client';

/** 백엔드 AuthorType 과 같은 이름. 운영자 글은 이름이 HansApp 으로 내려온다. */
export type AuthorType = 'USER' | 'ADMIN';

export interface PostAuthor {
  type: AuthorType;
  /** 회원 글이면 회원번호, 운영자 글이면 0. */
  id: number;
  name: string;
}

export interface Board {
  /** 주소에 쓰는 이름(`notice`). */
  name: string;
  title: string;
  description?: string | null;
  writeRole: 'ADMIN' | 'MEMBER';
  commentEnabled: boolean;
  likeEnabled: boolean;
}

export interface Post {
  id: number;
  title: string;
  summary?: string | null;
  author: PostAuthor;
  pinned: boolean;
  secret: boolean;
  commentEnabled: boolean;
  likeEnabled: boolean;
  publishedAt?: string | null;
  viewCount: number;
  commentCount: number;
}

/** 댓글 한 줄. 비공개 댓글이면 content 가 안 온다. */
export interface Comment {
  id: number;
  parentId?: number | null;
  author: PostAuthor;
  content?: string | null;
  secret: boolean;
  createdAt: string;
}

export interface PostDetail extends Post {
  /** 본문(마크다운). **비공개 글을 볼 수 없으면 아예 오지 않는다.** */
  content?: string | null;
  comments: Comment[];
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

export const listBoards = () => apiFetch<Board[]>('/boards');

export const listPosts = (board: string, page = 1, size = 20) =>
  apiFetch<PageResponse<Post>>(
    `/boards/${encodeURIComponent(board)}/posts?page=${page}&size=${size}`,
  );

export const getPost = (board: string, id: number) =>
  apiFetch<PostDetail>(`/boards/${encodeURIComponent(board)}/posts/${id}`);

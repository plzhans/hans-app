/**
 * 커뮤니티(게시판·글·댓글)의 값 목록.
 *
 * **DB enum 을 쓰지 않는다.** 값 하나 늘 때마다 ALTER TABLE 이 따라오고, 코드는 새 값을
 * 아는데 DB 는 모르는 구간이 배포 사이에 생긴다. 허용 값은 이 파일이 정한다.
 *
 * ## 규칙 셋
 *
 *  1. **DB 는 숫자로 담는다**(글·댓글처럼 쌓이는 표). 문자열이면 행마다 그 길이를 물고 가고
 *     인덱스도 그만큼 커진다.
 *  2. **코드는 enum 으로 다룬다.**
 *  3. **API 응답은 이름(문자열)으로 나간다.**
 *
 * ## enum 값이 곧 DB 값이다
 *
 * 그래서 DB 를 드나들 때 변환이 없다 — `where: { status: PostStatus.PUBLISHED }` 가 그대로
 * `status = 2` 다. 코드와 DB 를 대조할 때 눈으로 바로 맞춰 볼 수 있다.
 *
 * 이름으로 바꾸는 일은 **HTTP 경계 한 곳**이 한다(→ @hansapp/http-common 의 EnumField).
 * 숫자 enum 은 양방향 색인을 스스로 갖는다 — `PostStatus[2] === 'PUBLISHED'`,
 * `PostStatus['PUBLISHED'] === 2`. 그래서 요청·응답 양쪽이 같은 한 줄로 처리된다.
 *
 * ```
 * DB      2
 * 코드     PostStatus.PUBLISHED === 2
 * JSON    "PUBLISHED"        ← @EnumField 가 바꾼다
 * ```
 *
 * **값을 바꾸거나 다시 매기지 말 것.** 이미 쌓인 행이 그 숫자를 들고 있다.
 */

/** 작성자 갈래. 번호(authorId)가 어느 표의 것인지를 정한다. */
export enum AuthorType {
  USER = 1,
  ADMIN = 2,
}

/** 글 상태. 공개 API 는 PUBLISHED 만 본다. */
export enum PostStatus {
  DRAFT = 1,
  PUBLISHED = 2,
  HIDDEN = 3,
}

/** 댓글 상태. HIDDEN 은 화면에서 "삭제된 댓글" 로 남는다. */
export enum CommentStatus {
  VISIBLE = 1,
  HIDDEN = 2,
}

/**
 * 게시판 설정. **이쪽은 DB 도 문자열이다** — 몇 행뿐이라 숫자로 줄일 이유가 없고,
 * DB 를 열어 봤을 때 바로 읽히는 편이 낫다. 그래서 코드 표도 없다.
 */
export enum BoardWriteRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum BoardStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN = 'HIDDEN',
}

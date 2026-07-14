import { Link, type LinkProps } from 'react-router-dom';
import { useLangPath } from './routing';

/**
 * 언어 접두사를 자동으로 붙이는 Link.
 *
 * **내부 링크는 전부 이걸 쓴다.** 평범한 `<Link to="/search">` 를 쓰면 영어 페이지에서
 * 누르는 순간 한국어로 튕긴다 — 접두사가 빠지기 때문이다. 사용자는 언어가 초기화된 걸
 * 이해하지 못하고, 크롤러는 언어 트리가 끊긴 것으로 본다.
 *
 * to 는 문자열만 받는다. 객체(To)를 허용하면 접두사를 어디에 끼울지 규칙이 갈라진다.
 */
export function LangLink({
  to,
  ...props
}: Omit<LinkProps, 'to'> & { to: string }) {
  const path = useLangPath();
  return <Link to={path(to)} {...props} />;
}

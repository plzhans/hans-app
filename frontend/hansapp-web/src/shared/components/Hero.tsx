import { cn } from '@/shared/lib/cn';
import { PAGE_CONTAINER } from '@/shared/ui/layout';

/**
 * 화면 맨 위의 어두운 띠.
 *
 * **모든 페이지가 같은 것을 쓴다.** 첫 화면에만 있으면 다른 페이지로 넘어가는 순간 사이트가
 * 바뀐 것처럼 보인다 — 위쪽에 늘 같은 색의 띠가 있으면 그 아래 내용이 달라져도 한 곳이다.
 *
 * **크기도 하나다.** 화면마다 높이가 다르면 페이지를 옮길 때 그 아래 내용이 위아래로
 * 튀어, 같은 띠인데도 다른 것처럼 보인다.
 */
/**
 * 띠에 적히는 말. **페이지가 정하지 않는다** — 어느 화면에서든 같은 문장이어야 "같은
 * 사이트" 로 읽힌다. 페이지마다 달라지는 제목은 이 띠가 아니라 아래 PageHeader 가 맡는다.
 */
const BRAND = {
  title: 'HansApp',
  description: '직접 만든 서비스들을 한 곳에서. 하나의 계정으로 연결됩니다.',
} as const;

export function Hero() {
  return (
    <section className="bg-gray-900">
      <div className={cn(PAGE_CONTAINER, 'py-16 sm:py-20')}>
        <h1 className="text-3xl font-extrabold text-white sm:text-5xl">
          {BRAND.title}
        </h1>
        <p className="mt-4 max-w-xl text-base text-gray-300 sm:text-lg">
          {BRAND.description}
        </p>
      </div>
    </section>
  );
}

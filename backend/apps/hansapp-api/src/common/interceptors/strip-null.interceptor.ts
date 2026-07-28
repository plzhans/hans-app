import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 응답 본문에서 값이 없는(null/undefined) 프로퍼티를 재귀적으로 제거하는 전역 인터셉터.
 * 스프링의 전역 설정 spring.jackson.default-property-inclusion=non_null 과 동일한 효과를 낸다.
 * 추가로, 프로퍼티 제거 결과 완전히 비게 된 객체({})도 함께 제거해 빈 껍데기가 남지 않게 한다.
 *
 * - 배열 요소는 인덱스가 흐트러지지 않도록 제거하지 않고 각 요소만 정리한다.
 * - 0, false, "" 는 유효한 값이므로 유지한다(제거 대상은 오직 null/undefined).
 */
@Injectable()
export class StripNullInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((body) => stripNullDeep(body)));
  }
}

/** null/undefined 프로퍼티와 그로 인해 비게 된 객체를 재귀적으로 제거한 새 값을 반환한다. */
function stripNullDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((element) => stripNullDeep(element));
  }

  // Date 등 특수 객체는 그대로 둔다(직렬화 형태 유지).
  if (value === null || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  // toJSON 을 가진 객체(LangText 등)는 그 직렬화 형태로 변환한 뒤 정리한다.
  // (JSON.stringify 와 동일 규칙. 안 그러면 내부 필드가 그대로 노출된다.)
  const toJson = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJson === 'function') {
    return stripNullDeep((toJson as () => unknown).call(value));
  }

  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || raw === undefined) {
      continue;
    }
    const cleaned = stripNullDeep(raw);
    // 정리 후 빈 객체({})가 된 경우도 생략한다. (배열/Date 는 유지)
    if (isEmptyPlainObject(cleaned)) {
      continue;
    }
    result[key] = cleaned;
  }
  return result;
}

function isEmptyPlainObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.keys(value).length === 0
  );
}

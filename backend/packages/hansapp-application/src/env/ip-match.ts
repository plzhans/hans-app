/**
 * 허용목록 판정용 IP 매칭. 단일 IP(정확히 일치)와 CIDR 대역을 함께 다룬다.
 *
 * [왜 BigInt 인가]
 * IPv4(32비트)와 IPv6(128비트)를 같은 코드로 비교하려면 128비트를 담을 정수가 필요하다.
 * 주소를 정수로 펼쳐 두면 CIDR 판정이 "상위 prefix 비트가 같은가" 한 줄로 끝난다.
 * 문자열을 자르거나 정규식으로 대역을 흉내내면 /24 같은 옥텟 경계에서만 맞고
 * /20 처럼 경계에 안 걸리는 프리픽스에서 조용히 틀린다.
 *
 * [IPv4-mapped IPv6 를 접는 이유]
 * 같은 클라이언트가 접속 경로에 따라 `1.2.3.4` 로도 `::ffff:1.2.3.4` 로도 올 수 있다.
 * 접어서 보지 않으면 목록에 같은 IP 를 두 표기로 넣어야 하고, 한쪽만 넣은 채
 * "등록했는데 왜 막히지" 를 디버깅하게 된다.
 */

export interface ParsedIp {
  version: 4 | 6;
  bits: bigint;
}

const IPV4_BIT_WIDTH = 32;
const IPV6_BIT_WIDTH = 128;

/** `::ffff:x.x.x.x` 의 상위 96비트 값. 하위 32비트가 IPv4 주소다. */
const IPV4_MAPPED_PREFIX = 0xffffn;

function parseIpv4(value: string): bigint | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  let bits = 0n;
  for (const part of parts) {
    // 선행 0 을 허용하면 '010' 을 8진수로 읽는 구현과 해석이 갈린다. 자릿수만 보고 값으로 판정한다.
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    bits = (bits << 8n) | BigInt(octet);
  }
  return bits;
}

function parseIpv6(value: string): bigint | null {
  // '::' 는 한 번만 나올 수 있다. 두 번 나오면 어디를 0 으로 채울지 정해지지 않는다.
  const halves = value.split('::');
  if (halves.length > 2) return null;

  const split = (raw: string): string[] => (raw ? raw.split(':') : []);
  const head = split(halves[0]);
  const tail = halves.length === 2 ? split(halves[1]) : [];

  // 마지막 그룹이 점 표기면(IPv4-mapped/compatible) 16비트 두 그룹으로 바꿔 끼운다.
  const trailing = tail.length > 0 ? tail : head;
  const last = trailing[trailing.length - 1];
  if (last?.includes('.')) {
    const embedded = parseIpv4(last);
    if (embedded === null) return null;
    trailing.splice(
      -1,
      1,
      ((embedded >> 16n) & 0xffffn).toString(16),
      (embedded & 0xffffn).toString(16),
    );
  }

  const total = head.length + tail.length;
  if (total > 8) return null;
  // '::' 가 없으면 8그룹이 전부 적혀 있어야 한다(축약 없이 생략된 건 잘못된 표기다).
  if (halves.length === 1 && total !== 8) return null;

  const groups = [...head, ...(Array(8 - total).fill('0') as string[]), ...tail];

  let bits = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    bits = (bits << 16n) | BigInt(parseInt(group, 16));
  }
  return bits;
}

/**
 * IP 문자열을 비교 가능한 정수로 바꾼다. 형식이 틀리면 null —
 * 호출측은 null 을 "판정 불가"로 보고 **막아야** 한다(뚫지 말고).
 */
export function parseIp(value: string): ParsedIp | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.includes(':')) {
    const bits = parseIpv4(trimmed);
    return bits === null ? null : { version: 4, bits };
  }

  const bits = parseIpv6(trimmed);
  if (bits === null) return null;

  // IPv4-mapped(::ffff:1.2.3.4) 는 IPv4 로 접어 같은 주소로 취급한다.
  if (bits >> 32n === IPV4_MAPPED_PREFIX) {
    return { version: 4, bits: bits & 0xffffffffn };
  }
  return { version: 6, bits };
}

/**
 * 클라이언트 IP 가 허용목록 한 줄(`ipAddress`)에 걸리는지 본다.
 * 패턴은 단일 IP("1.2.3.4") 또는 CIDR("1.2.3.0/24", "2001:db8::/32").
 *
 * 패턴이 깨져 있으면 false — 목록에 오타가 있어도 그 줄만 무효가 되고 통과되지는 않는다.
 */
export function matchesAllowedIp(client: ParsedIp, pattern: string): boolean {
  const trimmed = pattern.trim();
  const slash = trimmed.indexOf('/');

  if (slash === -1) {
    const target = parseIp(trimmed);
    return target !== null && target.version === client.version && target.bits === client.bits;
  }

  const network = parseIp(trimmed.slice(0, slash));
  const prefixRaw = trimmed.slice(slash + 1);
  if (network === null || !/^\d{1,3}$/.test(prefixRaw)) return false;
  if (network.version !== client.version) return false;

  const width = network.version === 4 ? IPV4_BIT_WIDTH : IPV6_BIT_WIDTH;
  const prefix = Number(prefixRaw);
  if (prefix > width) return false;

  // prefix 비트만 남기고 밀어내 비교한다. /0 이면 shift 가 전체 폭이라 양쪽 다 0 → 전부 허용.
  const shift = BigInt(width - prefix);
  return client.bits >> shift === network.bits >> shift;
}

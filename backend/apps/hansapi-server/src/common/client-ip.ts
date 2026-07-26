/**
 * 요청의 실제 클라이언트 IP 를 뽑는다. rate limit 의 IP 버킷 키로 쓰인다.
 *
 * 프록시/CDN 마다 "진짜 클라 IP" 를 담는 헤더가 다르다. 어떤 헤더를 신뢰할지는
 * 배포 환경(env CLIENT_IP_HEADER)으로 고른다 — 코드는 그대로 두고 provider 만 바꾼다.
 *   Cloudflare      : CLIENT_IP_HEADER=cf-connecting-ip
 *   Akamai/일부 CDN : CLIENT_IP_HEADER=true-client-ip
 *   nginx           : CLIENT_IP_HEADER=x-real-ip
 *   미설정          : req.ip (Express trust proxy 결과) → 소켓 IP 순으로 폴백
 *
 *   AWS CloudFront  : CLIENT_IP_HEADER=cloudfront-viewer-address (값이 `IP:포트` → 포트 제거함)
 *   AWS ALB 단독    : 전용 헤더 없음 → CLIENT_IP_HEADER 비우고 TRUST_PROXY(홉 수)로 req.ip
 *
 * 범용 프록시(nginx/OCI LB/AWS ALB)는 전용 헤더 대신 X-Forwarded-For 를 쓰므로
 * CLIENT_IP_HEADER 를 비우고 TRUST_PROXY(홉 수/서브넷)로 req.ip 를 잡게 하는 편이 안전하다.
 *
 * ⚠️ 어떤 헤더를 읽든, 그 헤더는 신뢰하는 프록시만 설정할 수 있어야 한다.
 *    오리진이 프록시를 우회해 직접 노출되면 공격자가 이 헤더를 위조할 수 있으므로,
 *    네트워크(보안그룹/방화벽)에서 프록시에서 온 트래픽만 받도록 잠가야 이 전제가 성립한다.
 */
export function resolveClientIp(
  req: {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string };
  },
  headerName?: string,
): string {
  if (headerName) {
    const raw = req.headers?.[headerName.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string' && value.trim()) {
      // 전용 헤더는 단일 IP 지만, XFF 형태(콤마 목록)를 지정한 경우 맨 앞(원 클라이언트)만 취한다.
      return stripPort(value.split(',')[0].trim());
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * `IP:포트` 형식(예: CloudFront-Viewer-Address `1.2.3.4:46532`)에서 포트를 뗀다.
 * IP 만 rate limit 버킷 키로 써야 포트마다 다른 IP 로 취급되는 걸 막는다.
 *   - IPv4:포트          (1.2.3.4:46532)      → 1.2.3.4
 *   - [IPv6]:포트        ([2001:db8::1]:46532) → 2001:db8::1
 *   - 순수 IP(IPv4·IPv6) → 그대로 반환
 *
 * 대괄호 없는 IPv6 는 포트 콜론과 주소 콜론을 구분할 수 없어 건드리지 않는다.
 * (CloudFront 의 IPv6 표기가 이 경우라면 포트가 남을 수 있다 — IPv6 뷰어 비중이 크면
 *  CloudFront Function 으로 IP 만 담은 커스텀 헤더를 내려 CLIENT_IP_HEADER 로 쓰는 게 정확하다.)
 */
function stripPort(value: string): string {
  // [IPv6]:port
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 0 ? value.slice(1, end) : value;
  }
  // IPv4:port — 콜론이 정확히 하나이고 앞이 IPv4(점 포함)일 때만 뗀다(IPv6 오판 방지).
  const colon = value.indexOf(':');
  if (
    colon > 0 &&
    value.indexOf(':', colon + 1) === -1 &&
    value.lastIndexOf('.', colon) !== -1
  ) {
    return value.slice(0, colon);
  }
  return value;
}

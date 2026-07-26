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
 * 범용 프록시(nginx/OCI LB/AWS ALB·CloudFront)는 전용 헤더 대신 X-Forwarded-For 를 쓰므로
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
      return value.split(',')[0].trim();
    }
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

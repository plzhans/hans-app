/**
 * 외부 서비스 바로가기 링크. env(VITE_LINK_*)로 덮어쓸 수 있고, 없으면 기본값을 쓴다.
 */
export const LINKS = {
  medifinder:
    (import.meta.env.VITE_LINK_MEDIFINDER as string | undefined) ??
    'https://medifinder.kr',
  telegramExporter:
    (import.meta.env.VITE_LINK_TELEGRAM_EXPORTER as string | undefined) ??
    'https://telegram-exporter.plzhans.com',
  blog:
    (import.meta.env.VITE_LINK_BLOG as string | undefined) ??
    'https://blog.plzhans.com',
  docs:
    (import.meta.env.VITE_LINK_DOCS as string | undefined) ??
    'https://docs.plzhans.com',
};

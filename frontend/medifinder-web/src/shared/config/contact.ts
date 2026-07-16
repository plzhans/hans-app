// 노출용 대표 이메일. VITE_CONTACT_EMAIL 로 주입되며, 빌드 시 번들에 인라인된다.
// footer 외에도 이메일을 노출할 곳이 생기면 이 값을 재사용한다.
export const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? 'medifinder.help@gmail.com';

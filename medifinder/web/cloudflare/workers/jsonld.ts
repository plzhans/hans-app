/**
 * JSON-LD 를 <head> 에 넣을 수 있는 <script> 로 감싼다. 스키마 종류와 무관하다.
 *
 * 줄바꿈해서 낸다. 한 줄로 뽑으면 소스 보기에서 수 KB 가 가로로 이어져 못 읽는다.
 * 늘어나는 바이트는 전송 시 압축된다.
 *
 * `</script>` 를 이스케이프하는 것은 병원 소개가 사람이 쓴 자유 텍스트라,
 * 그 문자열이 들어오면 브라우저가 스크립트를 거기서 끊기 때문이다.
 */
export function script(data: unknown): string {
  const json = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  const indented = json.split('\n').join('\n    ');
  return `<script type="application/ld+json">\n    ${indented}\n    </script>`;
}

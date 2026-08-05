/**
 * 길찾기 링크.
 *
 * **우리가 길을 찾지 않는다.** 상세 안의 지도(MapView)는 "여기가 어디냐" 에 답하는 자리고,
 * 길찾기는 그 다음 행동이다 — 실제로 출발하려는 사람은 실시간 교통·환승·음성 안내가 있는
 * 지도 앱으로 간다. 우리가 흉내 낼 수 있는 것이 아니라 넘겨준다.
 *
 * **어느 지도로 갈지는 사용자가 고른다.** 한 곳으로 몰면 그 앱이 안 깔린 사람은 웹으로
 * 떨어져 로그인·설치 안내를 만난다. 한국에서 쓰는 지도가 갈려 있어서(네이버·카카오)
 * 우리가 대신 정할 근거가 없다. 구글은 국내 도보·자동차 경로가 약하지만, 한국 지도 앱이
 * 없는 외국인 방문자에게는 유일하게 익숙한 선택지다.
 */
export interface DirectionsPoint {
  lat: number;
  lng: number;
  name: string;
}

export type DirectionsProviderId = 'naver' | 'kakao' | 'google';

export interface DirectionsProvider {
  id: DirectionsProviderId;
  url: string;
}

/**
 * 목적지 이름. **쉼표를 지운다** — 카카오 link API 가 쉼표를 구분자로 쓰기 때문에,
 * 이름에 쉼표가 들어 있으면 좌표 자리가 밀려 엉뚱한 곳을 찍는다.
 */
function safeName(name: string): string {
  return name.replace(/,/g, ' ').trim();
}

export function directionsProviders(
  point: DirectionsPoint,
): DirectionsProvider[] {
  const name = safeName(point.name);
  const encoded = encodeURIComponent(name);

  return [
    {
      id: 'naver',
      /*
        출발지는 비우고(-) 도착지만 준다. 마지막 칸은 이동수단이다.
        **공식 문서가 있는 형식은 아니다** — 네이버가 지도 웹을 개편하면서 쓰는 주소라,
        바뀌면 여기만 고치면 된다. 앱이 깔려 있으면 이 주소가 앱으로 넘어간다.
      */
      url: `https://map.naver.com/p/directions/-/${point.lng},${point.lat},${encoded}/-/transit`,
    },
    {
      id: 'kakao',
      // 카카오가 공식으로 문서화한 link API. 앱이 있으면 앱, 없으면 웹으로 떨어진다.
      url: `https://map.kakao.com/link/to/${encoded},${point.lat},${point.lng}`,
    },
    {
      id: 'google',
      // 구글이 문서화한 Maps URLs. 어느 나라에서 눌러도 같게 동작한다.
      url: `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`,
    },
  ];
}

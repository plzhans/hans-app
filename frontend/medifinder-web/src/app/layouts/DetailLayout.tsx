import { Outlet } from 'react-router-dom';
import { Footer } from '@/shared/components/layout/Footer';

/**
 * 병원 상세·비급여의 껍데기.
 *
 * **전역 헤더가 없다.** 앱에서 상세는 목록 위로 밀려 올라온 화면이라, 상단에 있어야 하는 것은
 * 서비스 로고가 아니라 "돌아가기" 다(DetailAppBar 가 그 자리를 맡는다). 헤더를 그대로 두면
 * 고정 바가 두 겹(56+56)이 되어 390px 기기에서 본문이 그만큼 사라진다.
 */
export function DetailLayout() {
  return (
    /*
      **회색 바닥이다.** 흰 카드(Section)가 그 위에 떠 있어야 구역이 나뉘어 보인다 —
      바닥까지 희면 카드 테두리만 남아 어디가 끊기는지 안 읽힌다.
      폭은 각 조각이 알아서 모은다(히어로·탭 바는 화면을 꽉 채우고 안에서 max-w-7xl).
    */
    <div className="flex min-h-full flex-col bg-surface-sunken">
      <div className="flex-1">
        <Outlet />
      </div>

      {/*
        푸터는 **넓은 화면에만** 둔다.

        웹으로 보는 화면에서는 저작권·문의처가 페이지 끝에 있는 게 당연하고, 상세로 바로
        들어온 사람에게는 여기가 그 정보를 만날 유일한 자리다. 반대로 앱(좁은 화면)에서는
        상세의 끝이 "근처의 비슷한 병원" 이고, 그 뒤에 회사 정보를 붙이면 다음 병원을 고르려던
        흐름이 끊긴다 — 게다가 그 자리는 하단 전화 바가 이미 쓰고 있다.
      */}
      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Clock, Navigation, Phone, Receipt } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { LangLink } from '@/shared/i18n/LangLink';
import { DirectionsMenu } from './DirectionsMenu';
import type { DirectionsPoint } from '@/shared/lib/directions';
import type { HospitalDetail } from '../api';
import type { DetailTab } from './HospitalHeader';

/**
 * 히어로에 겹쳐 뜨는 빠른 실행 4칸.
 *
 * **이 화면에서 가장 자주 하는 일 넷을 맨 앞으로 끌어냈다.** 예전엔 전화번호가 소개 카드 안
 * 작은 텍스트 링크였고, 진료시간과 평가는 스크롤해서 찾아야 했다. 정작 상세를 여는 이유가
 * 그것들인데 읽을거리 사이에 묻혀 있었다.
 *
 * **히어로 위로 26px 올라타 있다.** 파란 면과 흰 카드가 만나는 자리에 걸쳐 놓으면 두 영역을
 * 꿰매는 다리가 되고, 스크롤을 내리기 전에 이미 눈에 걸린다.
 *
 * **성격이 둘 섞여 있다** — 전화·길찾기는 앱을 여는 진짜 행동이고, 진료시간·평가는 이 페이지
 * 안에서 자리를 옮기는 것이다. 그래도 한 줄에 두는 이유는 사용자가 그 둘을 구분해서 찾지 않기
 * 때문이다("전화해볼까 / 몇 시까지 하나" 는 같은 층위의 질문이다).
 */
export function QuickActions({
  hospital,
  onJump,
}: {
  hospital: HospitalDetail;
  /**
   * 페이지 안 앵커로 이동. **탭과 같은 함수를 쓴다** — 그래야 이동하는 동안 스크롤 스파이가
   * 잠겨서, 중간 구역들을 스쳐 지나가며 탭 표시가 깜빡이는 일이 없다.
   */
  onJump: (event: React.MouseEvent, key: DetailTab) => void;
}) {
  const { t } = useTranslation();

  const tel = hospital.tel;
  const point =
    hospital.location?.lat != null && hospital.location?.lon != null
      ? {
          lat: hospital.location.lat,
          lng: hospital.location.lon,
          name: hospital.name,
        }
      : undefined;

  /*
    **없는 칸은 자리도 안 만든다.** 전화번호가 없는 병원, 좌표가 없는 병원이 실제로 있다.
    흐리게 비활성으로 남겨두면 "왜 안 눌리지" 를 누르게 할 뿐이라, 남은 것만 폭을 나눠 갖는다.

    셋째 칸은 평가다. 다만 **평가 대상이 아닌 병원이 절반이 넘어서**, 그때는 그 자리를
    비급여가 받는다 — 빈칸으로 두면 넷이 셋이 되어 격자가 어그러지고, 비급여는 어느 병원에나
    있는 화면이라 대신 세우기에 알맞다.
  */
  const tiles = [
    tel && {
      key: 'call',
      icon: <Phone className="h-[1.05rem] w-[1.05rem]" />,
      label: t('clinic.actions.call'),
      href: `tel:${tel}`,
    },
    {
      key: 'care',
      icon: <Clock className="h-[1.05rem] w-[1.05rem]" />,
      label: t('clinic.actions.hours'),
      // 진료시간은 소개 카드 안으로 합쳐졌다 — 그 카드로 데려가면 시간표가 함께 보인다.
      anchor: 'subject' as DetailTab,
    },
    hospital.assessment
      ? {
          key: 'assessment',
          icon: <ClipboardCheck className="h-[1.05rem] w-[1.05rem]" />,
          label: t('clinic.actions.assessment'),
          anchor: 'assessment' as DetailTab,
        }
      : {
          key: 'npay',
          icon: <Receipt className="h-[1.05rem] w-[1.05rem]" />,
          label: t('clinic.tabs.npay'),
          to: `/hospitals/${hospital.id}/npay`,
        },
    point && {
      key: 'directions',
      icon: <Navigation className="h-[1.05rem] w-[1.05rem]" />,
      label: t('clinic.actions.directions'),
      // 누르면 어느 지도로 갈지 고르는 메뉴가 뜬다(DirectionsMenu).
      directions: point,
    },
  ].filter(Boolean) as Tile[];

  return (
    /*
      **넓은 화면에서는 감춘다.** 좁은 화면에서 이 넷이 맨 앞에 나오는 이유는 스크롤이 길어
      전화·진료시간·평가가 저 아래 묻히기 때문인데, 넓은 화면은 카드가 두 단으로 갈려서
      그 셋이 첫 화면에 이미 다 보인다. 같은 것을 두 번 놓는 셈이 된다.
    */
    <div className="relative z-20 mx-auto -mt-[26px] max-w-3xl px-4 lg:hidden">
      <div
        className={cn(
          'grid gap-2',
          tiles.length === 4
            ? 'grid-cols-4'
            : tiles.length === 3
              ? 'grid-cols-3'
              : 'grid-cols-2',
        )}
      >
        {tiles.map((tile) => (
          <QuickTile key={tile.key} tile={tile} onJump={onJump} />
        ))}
      </div>
    </div>
  );
}

/**
 * 칸 하나. 셋 중 하나로 그려진다.
 *   href        전화 앱을 여는 바깥 링크
 *   anchor      이 페이지 안 구역으로 이동
 *   to          다른 페이지(비급여)
 *   directions  지도 앱 선택 메뉴를 여는 방아쇠
 */
interface Tile {
  key: string;
  icon: React.ReactNode;
  label: string;
  href?: string;
  external?: boolean;
  anchor?: DetailTab;
  to?: string;
  /** 길찾기. 바로 열지 않고 지도 앱을 고르게 한다. */
  directions?: DirectionsPoint;
}

function QuickTile({
  tile,
  onJump,
}: {
  tile: Tile;
  onJump: (event: React.MouseEvent, key: DetailTab) => void;
}) {
  const className = cn(
    'flex flex-col items-center gap-1.5 rounded-tile border border-line-subtle bg-surface px-1.5 py-3 no-underline shadow-raised',
    // 눌림. **손을 뗀 뒤에도 잠깐 따라오는 곡선(ease-native)** 이라야 앱의 버튼처럼 느껴진다.
    'transition-transform duration-100 ease-native active:scale-95',
  );

  const inner = (
    <>
      {/* 아이콘 판. 시안의 34px 연파랑 사각형이다 — 네 칸의 아이콘이 같은 크기로 정렬된다. */}
      <span className="flex h-[2rem] w-[2rem] items-center justify-center rounded-box bg-brand-tint text-brand">
        {tile.icon}
      </span>
      <span className="w-full truncate text-center text-[0.68rem] font-bold text-ink-body">
        {tile.label}
      </span>
    </>
  );

  if (tile.directions) {
    return (
      <DirectionsMenu point={tile.directions}>
        <button type="button" className={className}>
          {inner}
        </button>
      </DirectionsMenu>
    );
  }

  if (tile.anchor) {
    return (
      <a
        href={`#${tile.anchor}`}
        onClick={(event) => onJump(event, tile.anchor!)}
        className={className}
      >
        {inner}
      </a>
    );
  }

  if (tile.to) {
    return (
      <LangLink to={tile.to} className={className}>
        {inner}
      </LangLink>
    );
  }

  return (
    <a
      href={tile.href}
      // 지도 앱이 깔려 있으면 이 탭이 앱으로 바뀐다 — 같은 탭에서 열면 돌아왔을 때 상세가 없다.
      {...(tile.external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={className}
    >
      {inner}
    </a>
  );
}

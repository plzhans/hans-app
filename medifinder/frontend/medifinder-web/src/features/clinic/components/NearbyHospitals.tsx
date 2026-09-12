import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, MapPin } from 'lucide-react';
import { Spinner } from '@/shared/ui/Spinner';
import { MapView } from '@/shared/components/map/MapView';
import type { MapPoint } from '@/shared/components/map/mapAdapters';
import { formatDistance, useHospitalNearby } from '../api';
import { HospitalCard } from './HospitalCard';
import { Section } from './Section';

/**
 * 상세 화면 맨 아래의 "근처의 비슷한 병원".
 *
 * **여기서 보여주는 건 순위지 목록이 아니다.** 서버가 진료과목 겹침을 가장 크게 보고
 * 거리를 가중치로 곱해 정렬해 주므로, 받은 순서를 그대로 그린다 — 다시 정렬하면 근거가 사라진다.
 *
 * **섹션 껍데기까지 이 컴포넌트가 그린다.** 바깥에서 Section 을 두르면 조회가 실패했을 때
 * 제목만 남고 속이 비어, 고장난 화면처럼 보인다. 낼 게 없으면 섹션 자체가 없어야 한다.
 */
export function NearbyHospitals({
  id,
  origin,
}: {
  id: string | undefined;
  /**
   * 지도의 가운데가 될 이 병원. 좌표가 없으면(색인에 좌표가 없는 병원) 안 넘기고,
   * 그러면 지도 버튼도 안 뜬다 — 가운데를 못 잡는 지도는 의미가 없다.
   */
  origin?: MapPoint;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useHospitalNearby(id);

  /**
   * 지도는 눌렀을 때만 만든다. 지도 인스턴스 생성이 과금 단위라, 상세를 열기만 해도
   * 뜨면 콜이 낭비된다 — 위치 섹션의 지도와 같은 규칙이다.
   */
  const [mapOpen, setMapOpen] = useState(false);

  /**
   * 지도에 찍을 곁들임 지점. **정체성을 고정해야** 렌더마다 핀을 다시 만들지 않는다.
   * 좌표 없는 병원은 뺀다 — 찍을 데가 없다.
   */
  const points = useMemo<MapPoint[]>(
    () =>
      (data?.items ?? [])
        // 번호를 **거르기 전에** 매긴다 — 좌표 없는 병원을 빼고 나서 매기면
        // 목록의 3번이 지도의 2번이 되어 서로 못 알아본다.
        .map((h, index) => ({ hospital: h, rank: index + 1 }))
        .filter(
          ({ hospital }) =>
            hospital.location?.lat != null && hospital.location?.lon != null,
        )
        .map(({ hospital, rank }) => ({
          lat: hospital.location.lat as number,
          lng: hospital.location.lon as number,
          name: hospital.name,
          rank,
        })),
    [data],
  );

  // 이건 "이 병원" 을 보러 온 사람에게 덤으로 얹는 자리다. 덤이 안 왔다고 빨간 오류 상자를
  // 띄우면 정작 멀쩡한 상세 정보까지 고장난 페이지로 보인다 — 통째로 접는다.
  if (isError) {
    return null;
  }

  // 지도를 켤 수 있을 때만 토글을 낸다 — 찍을 좌표가 없으면 눌러봐야 이 병원 핀 하나뿐이다.
  const canMap = !!origin && points.length > 0;

  return (
    <Section
      id="nearby"
      // 안에 병원 카드가 들어오는 구역이라 껍데기를 두르지 않는다 — 카드 안의 카드가 된다.
      bare
      title={t('clinic.nearby.title')}
      icon={<Compass className="h-4 w-4 text-brand" />}
      action={
        canMap && (
          <button
            type="button"
            onClick={() => setMapOpen((v) => !v)}
            aria-expanded={mapOpen}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-white py-1 pl-2 pr-2.5 text-xs font-medium text-ink-body transition-colors hover:bg-surface-subtle hover:text-ink"
          >
            <MapPin className="h-3.5 w-3.5" />
            {t(mapOpen ? 'clinic.nearby.hideMap' : 'clinic.nearby.showMap')}
          </button>
        )
      }
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <>
          {/*
            무엇을 기준으로 고른 목록인지 먼저 밝힌다. 이 줄이 없으면 사용자는 그냥
            "가까운 순" 으로 읽고, 더 가까운 병원이 왜 빠졌는지 오해한다.

            **반경은 응답이 준 값을 쓴다** — 서버가 기준 병원 등급을 보고 정하므로
            의원이면 1km, 상급종합이면 80km 로 화면마다 다르다.
          */}
          <p className="text-xs text-ink-muted">
            {t('clinic.nearby.hint', {
              radius: formatDistance(data.radius),
            })}
          </p>

          {data.items.length === 0 ? (
            <p className="mt-3 rounded-xl bg-surface-subtle p-4 text-center text-sm text-ink-muted">
              {t('clinic.nearby.empty')}
            </p>
          ) : (
            <>
              {/*
                지도. **목록 위**다 — 토글이 제목 줄에 있으니 눌렀을 때 바로 아래에서 열려야
                시선이 안 튄다. 이 병원을 가운데 두고 목록의 병원들을 회색 핀으로 함께 찍는다.
                카드가 "어디가 비슷한가" 에 답한다면 지도는 "어느 방향인가" 에 답한다.
              */}
              {canMap && mapOpen && origin && (
                <div className="mt-3">
                  <MapView
                    lat={origin.lat}
                    lng={origin.lng}
                    name={origin.name}
                    nearby={points}
                  />
                </div>
              )}

              {/*
                좁은 화면은 한 줄에 하나, 640px 부터 둘씩. 상세 본문이 max-w-3xl(768px)이라
                **두 열이 이 페이지에서 낼 수 있는 최대**다 — 셋이 되면 카드가 이름도 못 담을 만큼 좁아진다.

                홀수 개(기본 5건)면 마지막 칸이 빈다. 그 자리를 채우려고 개수를 짝수로 맞추지 않는다 —
                순위가 있는 목록이라 "격자를 채우려고 한 곳 더" 는 순서를 왜곡한다.
              */}
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.items.map((hospital, index) => (
                  <li key={hospital.id}>
                    <HospitalCard
                      hospital={hospital}
                      variant="nearby"
                      rank={index + 1}
                      distance={hospital.distance}
                      matchedSubjects={hospital.matchedSubjects}
                    />
                  </li>
                ))}
              </ul>

            </>
          )}
        </>
      )}
    </Section>
  );
}

import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { Spinner } from '@/shared/ui/Spinner';
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
export function NearbyHospitals({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useHospitalNearby(id);

  // 이건 "이 병원" 을 보러 온 사람에게 덤으로 얹는 자리다. 덤이 안 왔다고 빨간 오류 상자를
  // 띄우면 정작 멀쩡한 상세 정보까지 고장난 페이지로 보인다 — 통째로 접는다.
  if (isError) {
    return null;
  }

  return (
    <Section
      id="nearby"
      title={t('clinic.nearby.title')}
      icon={<Compass className="h-4 w-4 text-primary-600" />}
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
          <p className="text-xs text-slate-500">
            {t('clinic.nearby.hint', {
              radius: formatDistance(data.radius),
            })}
          </p>

          {data.items.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
              {t('clinic.nearby.empty')}
            </p>
          ) : (
            /*
              좁은 화면은 한 줄에 하나, 640px 부터 둘씩. 상세 본문이 max-w-3xl(768px)이라
              **두 열이 이 페이지에서 낼 수 있는 최대**다 — 셋이 되면 카드가 이름도 못 담을 만큼 좁아진다.

              홀수 개(기본 5건)면 마지막 칸이 빈다. 그 자리를 채우려고 개수를 짝수로 맞추지 않는다 —
              순위가 있는 목록이라 "격자를 채우려고 한 곳 더" 는 순서를 왜곡한다.
            */
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.items.map((hospital) => (
                <li key={hospital.id}>
                  <HospitalCard
                    hospital={hospital}
                    variant="nearby"
                    distance={hospital.distance}
                    matchedSubjects={hospital.matchedSubjects}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

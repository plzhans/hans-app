import { useTranslation } from 'react-i18next';
import { Baby, Clock, Globe, Phone, Stethoscope } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatTime, openStatus, todayDay, tomorrowDay, type HospitalDetail } from '../api';
import { Section } from './Section';
import { StatusPill } from './StatusPill';

/**
 * 소개 카드 — 연락처 · 병원 소개글 · 진료시간 · 안내.
 *
 * **상세와 비급여 두 페이지가 공유한다.** 비급여는 가격표 한 장뿐이라 혼자 두면 상세에서
 * 넘어온 것 같지 않고 다른 화면으로 튄 것처럼 보인다. 왼쪽 칸에 같은 카드를 세워 두면
 * 두 페이지가 한 화면의 두 상태로 읽힌다 — 탭을 눌러 오른쪽만 갈아 끼운 것처럼.
 *
 * 연락처와 진료시간이 한 카드인 이유는 결국 같은 질문("이 병원에 어떻게 닿나")에 답해서다 —
 * 전화번호를 보고 나서 몇 시까지 하는지 보는 게 한 동작이다.
 */
export function HospitalIntroCard({
  hospital,
  id,
  first,
}: {
  hospital: HospitalDetail;
  /** 책갈피 대상. 탭이 여기로 스크롤하는 상세에서만 준다. */
  id?: string;
  first?: boolean;
}) {
  const { t } = useTranslation();

  /** 진료시간은 kind 로 갈린다. 달빛은 야간에 소아만 받으므로 시간대가 다르다. */
  const hours = hospital.hours ?? [];
  const general = hours.filter((h) => h.kind === 'general');
  const baby = hours.filter((h) => h.kind === 'baby');

  /**
   * 지금 진료 중인가. 오늘 시간표가 없으면 undefined 라 배지 자체를 안 그린다 —
   * 휴진인지 데이터가 없는 건지 구분할 근거가 없어서, 단정하면 거짓말이 된다(openStatus 주석).
   */
  const status = openStatus(hours);

  return (
    <Section
      first={first}
      id={id}
      title={t('clinic.tabs.subject')}
      icon={<Stethoscope className="h-4 w-4 text-brand" />}
      action={status && <StatusPill status={status} />}
    >
      {/*
        연락처. **줄이 아니라 행(行)이다** — 아이콘 판·라벨/값·바로가기 버튼이 한 줄을
        이룬다. 예전엔 작은 글씨 옆에 아이콘 하나였는데, 그러면 전화번호가 '읽는 것' 으로
        보이고 누를 수 있다는 게 안 보였다. 오른쪽 파란 버튼이 그걸 말한다.
      */}
      <div className="divide-y divide-line-subtle">
        {hospital.tel && (
          <ContactRow
            icon={<Phone className="h-[1.05rem] w-[1.05rem]" />}
            label={t('clinic.contactField.tel')}
            value={hospital.tel}
            href={`tel:${hospital.tel}`}
          />
        )}
        {hospital.homepage && (
          <ContactRow
            icon={<Globe className="h-[1.05rem] w-[1.05rem]" />}
            label={t('clinic.contactField.homepage')}
            value={hospital.homepage.replace(/^https?:\/\//, '')}
            href={hospital.homepage}
            external
          />
        )}
      </div>

      {/*
        소개(intro)와 안내(notice)는 성격이 다르다.
          소개  병원이 스스로 밝힌 진료 특징·중점 분야
          안내  진료시간이 못 담는 예외 (접수마감·휴진일)
        라벨을 붙여 구분한다. 안 그러면 사용자가 무슨 문장인지 모른다.
      */}
      {hospital.intro && (
        <div className="mt-3.5 rounded-xl bg-brand-wash p-3">
          <p className="text-[0.7rem] font-bold text-ink-subtle">
            {t('clinic.intro')}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-body">
            {hospital.intro.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()}
          </p>
        </div>
      )}


      {/*
        진료시간. 같은 카드 안의 **소제목**이다 — 위 연락처와 한 덩어리로 읽혀야 해서
        선 하나로만 가른다. 카드 제목(소개)과 위계가 겹치지 않게 아이콘도 달지 않는다.
      */}
      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-[0.8rem] font-extrabold text-ink">
          <Clock className="h-3.5 w-3.5 text-brand" />
          {t('clinic.hours')}
        </p>
      {/*
        진료시간이 없는 병원이 있다. **비워두면 안 된다** — 사용자는 확인할 방법을 못 찾고
        목록으로 돌아간다. 없다고 말하고, **할 수 있는 행동(전화)** 을 준다.
        추측해서 채우지 않는다("의원은 보통 9시~6시") — 헛걸음을 만든다.
      */}
      {general.length === 0 && baby.length === 0 && (
        <div className="rounded-xl bg-brand-wash p-4 text-center">
          <p className="text-sm text-ink-muted">{t('clinic.hoursEmpty')}</p>
          {/*
            진료시간 "없음"은 중요도가 낮은 상태다. 채움 버튼으로 강조하면
            과한 시선을 뺏는다. 전화는 **보조 행동**이니 텍스트 링크 톤으로 낮춘다.
          */}
          {hospital.tel && (
            <a
              href={`tel:${hospital.tel}`}
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-ink-muted no-underline active:text-brand"
            >
              <Phone className="h-3.5 w-3.5" />
              {t('clinic.hoursConfirm', { tel: hospital.tel })}
            </a>
          )}
        </div>
      )}

      {/*
        요일 한 줄 = 한 행. **오늘 행만 파랗게 칠한다** — 일곱 줄을 눈으로 훑어 오늘을
        찾는 일을 없앤다. 회색 박스로 통째로 묶던 예전 방식은 그 안에서 다시 오늘을
        찾아야 했고, 그게 이 표를 읽는 유일한 이유였다.
      */}
      {general.length > 0 && (
        <dl className="flex flex-col gap-0.5">
          {general.map((h) => {
            const today = h.day === todayDay();
            return (
              <div
                key={h.day}
                className={cn(
                  'flex flex-wrap items-center gap-x-2.5 rounded-lg px-2.5 py-2 text-sm',
                  today && 'bg-brand-tint',
                )}
              >
                <dt
                  className={cn(
                    'w-7 shrink-0 font-extrabold',
                    today ? 'text-brand-strong' : 'text-ink-body',
                  )}
                >
                  {t(`common.days.${h.day}`)}
                </dt>
                <dd className="flex flex-1 flex-wrap items-center gap-x-2">
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      today ? 'text-brand-strong' : 'text-ink-body',
                    )}
                  >
                    {formatTime(h.open)} ~ {formatTime(h.close)}
                  </span>

                  {/*
                    점심시간은 닫혀 있는 시간이다. 흐리게 두면 눈에 안 들어와 그 시간에
                    헛걸음한다. 강조까지 할 필요는 없고, **읽히기만 하면 된다.**
                  */}
                  {h.breakStart && (
                    <span className="text-[0.78rem] text-ink-muted">
                      {t('clinic.lunch', { start: formatTime(h.breakStart), end: formatTime(h.breakEnd) })}
                    </span>
                  )}

                  <DayBadge day={h.day} />
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* 달빛 시간은 일반 진료와 다르다. 뭉치면 성인이 야간에 헛걸음한다. */}
      {baby.length > 0 && (
        <div className="mt-3.5 rounded-xl bg-amber-50 p-3">
          <p className="flex items-center gap-1 text-[0.7rem] font-bold text-amber-800">
            <Baby className="h-3 w-3" /> {t('clinic.babyHours')}
          </p>
          <dl className="mt-1.5 space-y-1 text-sm">
            {baby.map((h) => (
              <div key={h.day} className="flex gap-3">
                <dt className="w-12 shrink-0 font-bold text-amber-700">
                  {t(`common.days.${h.day}`)}
                </dt>
                <dd className="font-semibold tabular-nums text-amber-900">
                  {formatTime(h.open)} ~ {formatTime(h.close)}
                  <DayBadge day={h.day} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/*
        진료시간의 부가 설명. **실측 30,725건(97%)이 점심·휴진·접수시간 얘기다.**
          "점심 13:00-14:30" · "매주 수요일 정기 휴무" · "토일 문의"
        구조화된 시간표가 못 담는 예외라 **시간표 바로 아래**에 붙인다.
        위쪽 소개(intro)와는 다르다 — 그건 "무슨 진료를 잘하나"(72%가 진료 특징)다.

        라벨은 그냥 "안내" 다. 실측상 97% 가 점심·휴진 얘기지만 나머지 3%(932건)에는
        "토일 문의", "예약제" 처럼 시간과 무관한 것도 온다 — 라벨을 좁게 달면 그때 거짓말이 된다.
        **파선 테두리**는 시간표가 못 담은 예외라는 표시다 — 채운 박스로 두면 시간표와
        같은 무게로 읽혀 휴진일을 놓친다.
      */}
      {hospital.notice && (
        <div className="mt-3.5 rounded-xl border border-dashed border-brand-tint-strong bg-brand-wash p-3">
          <p className="text-[0.7rem] font-bold text-ink-subtle">
            {t('clinic.notice')}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-body">
            {hospital.notice.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim()}
          </p>
        </div>
      )}
      </div>
    </Section>
  );
}

/**
 * 연락처 한 줄. 아이콘 판 · 라벨/값.
 *
 * **줄 전체가 링크다.** 시안에는 오른쪽 끝에 파란 화살표 버튼이 있었는데 뺐다 —
 * 줄을 눌러도 같은 일이 일어나므로 그 버튼은 **따로 존재할 이유가 없다.** 오히려 과녁이
 * 둘인 것처럼 보여서, 실제로는 어디를 눌러도 되는데 그 30px 을 맞추게 만든다.
 * 무엇을 하는 줄인지는 왼쪽 아이콘(전화기·지구본)이 이미 말한다.
 */
function ContactRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  /** 바깥으로 나가는 링크(홈페이지). 전화는 앱을 열 뿐이라 새 탭이 아니다. */
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="flex items-center gap-3 py-2.5 no-underline transition-opacity duration-100 active:opacity-60"
    >
      <span className="flex h-[2.2rem] w-[2.2rem] shrink-0 items-center justify-center rounded-box bg-brand-tint text-brand">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.68rem] font-bold text-ink-subtle">
          {label}
        </span>
        <span className="block truncate text-[0.85rem] font-bold text-ink">
          {value}
        </span>
      </span>
    </a>
  );
}

/** 오늘·내일 표시. 공휴일(8)은 날짜와 무관해서 붙이지 않는다. */
function DayBadge({ day }: { day: number }) {
  const { t } = useTranslation();

  if (day === todayDay()) {
    return (
      <span className="ml-2 rounded bg-brand-tint-strong px-1.5 py-0.5 text-xs font-medium text-brand-ink">
        {t('clinic.today')}
      </span>
    );
  }
  if (day === tomorrowDay()) {
    return (
      <span className="ml-2 rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-ink-muted">
        {t('clinic.tomorrow')}
      </span>
    );
  }
  return null;
}


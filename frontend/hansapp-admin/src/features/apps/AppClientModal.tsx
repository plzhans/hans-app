import type { ReactNode } from 'react';

import type { AppClient } from '@/shared/api/apps';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/Badge';
import { Modal } from '@/shared/ui/Modal';
import { formatDateTime } from '@/shared/lib/formatDateTime';

/**
 * OAuth 클라이언트 상세 모달.
 *
 * **URL 이 여는 모달이다** — `/apps/:id/clients/:clientId` 로 라우팅되고, 닫으면 앱 상세로
 * 되돌아간다. 그래서 브라우저 뒤로가기로도 닫히고 링크를 그대로 공유할 수 있다.
 * 컴포넌트 state 로만 열면 둘 다 안 된다.
 *
 * 서버를 따로 부르지 않는다 — 앱 상세가 이미 클라이언트를 통째로 갖고 있다.
 */
export function AppClientModal({
  client,
  onClose,
}: {
  client: AppClient;
  onClose: () => void;
}) {
  const web = client.type === 'WEB';

  return (
    <Modal
      size="lg"
      onClose={onClose}
      /*
        **제목은 이름만 둔다.** 식별자·플랫폼·상태는 전부 값이라 아래 정보 섹션이 갖는다 —
        제목 옆에 흩어 두면 "어디를 봐야 그 값이 있나" 가 화면마다 달라진다.
      */
      title={client.name}
    >
      <div className="space-y-5">
        <Section title="기본">
          {/* 우리 DB 의 행 번호. 표의 첫 열과 같은 값이라 맨 앞에 둔다. */}
          <Field label="id">
            <span className="font-mono">{client.id}</span>
          </Field>
          {/*
            **Client ID 가 이 화면의 핵심 정보다.** 앱이 인증할 때 실제로 보내는 값이고,
            문의를 받으면 이 값으로 대조한다 — 그래서 한 줄을 통째로 준다.
            공개 식별자라 감출 이유는 없다(프론트 번들에 그대로 박히는 값이다).
            OAuth 스펙의 이름을 그대로 쓴다 — 우리 DB 의 행 번호(id)와 헷갈리지 않게.
          */}
          <Field label="Client ID" wide>
            <span className="break-all font-mono text-xs">
              {client.clientId}
            </span>
          </Field>
          <Field label="플랫폼">
            <Badge tone="blue">{client.type}</Badge>
          </Field>
          <Field label="상태">
            {/* 값이지만 색으로도 읽히게 배지로 그린다. 자리는 다른 값들과 같다. */}
            <Badge tone={client.status === 'ACTIVE' ? 'green' : 'gray'}>
              {client.status}
            </Badge>
          </Field>
          <Field label="등록일">{formatDateTime(client.createdAt)}</Field>
          <Field label="마지막 사용">
            {formatDateTime(client.lastUsedAt)}
          </Field>
        </Section>

        {web ? (
          <>
            {/*
              **"시크릿" 이 아니라 client secret 이다.** OAuth 스펙의 용어이고, 앱이
              토큰을 받을 때 client_id 와 짝으로 보내는 값이다. 다른 비밀값(서비스 키·
              JWT 시크릿)과 이름이 겹치면 문의를 받았을 때 무엇을 말하는지 갈리지 않는다.
            */}
            <Section title="Client Secret">
              <Field label="마스킹">
                <span className="font-mono text-xs">
                  {client.secretSuffix ? `****${client.secretSuffix}` : '—'}
                </span>
              </Field>
              <Field label="발급·재발급">
                {formatDateTime(client.secretCreatedAt)}
              </Field>
              <p className="sm:col-span-2 text-xs text-gray-400">
                원문과 해시는 서버가 내보내지 않습니다. 발급 시점에 한 번만 볼 수
                있습니다.
              </p>
            </Section>

            <UriBlock
              title="Origins"
              hint="이 오리진의 JS 만 앱 API 를 부를 수 있습니다(CORS)."
              values={client.origins}
            />
            <UriBlock
              title="Redirect URIs"
              hint="로그인 후 돌아갈 수 있는 주소입니다. 여기 없는 주소로는 못 보냅니다."
              values={client.redirectUris}
            />
          </>
        ) : (
          /*
            네이티브는 origins·redirectUris 가 없고 config 에 플랫폼 식별자가 들어 있다.
            iOS={ bundleId }, Android={ packageName, fingerprints[] }.
            앱스토어에 공개되는 값이라 비밀이 아니다.
          */
          <ConfigBlock config={client.config} />
        )}
      </div>
    </Modal>
  );
}

/** 목록이 이만큼을 넘으면 자체 스크롤을 단다(대략 5줄). */
const URI_LIST_MAX_HEIGHT = 'max-h-44';

/**
 * URI 목록(Origins·Redirect URIs).
 *
 * **자체 스크롤을 단다.** 운영 중인 앱은 이 목록이 십수 개까지 늘어난다 — 전부 펼치면
 * 모달이 세로로 길어져서 아래에 있는 다른 섹션이 화면 밖으로 밀린다. 값 하나하나보다
 * "어떤 항목들이 있나" 를 먼저 보게 하려면 이 블록만 스크롤하는 편이 낫다.
 *
 * 개수를 제목 옆에 적어 둔다 — 스크롤이 생기면 몇 개인지가 안 보인다.
 */
function UriBlock({
  title,
  hint,
  values,
}: {
  title: string;
  hint: string;
  values: string[];
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400">{values.length}개</span>
      </div>
      <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">등록된 값이 없습니다.</p>
      ) : (
        <ul
          className={cn(
            'mt-2 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2',
            URI_LIST_MAX_HEIGHT,
          )}
        >
          {values.map((v) => (
            <li
              key={v}
              // 항목마다 테두리를 두르면 목록이 통째로 상자 더미가 된다.
              // 바깥 상자 하나만 두고 안은 줄로 나눈다.
              className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-700"
            >
              {v}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 네이티브 config 를 "키: 값" 으로 편다. 배열 값(fingerprints)은 줄로 나눠 그린다. */
function ConfigBlock({ config }: { config?: Record<string, unknown> | null }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900">플랫폼 식별자</h3>
      {!config || Object.keys(config).length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">등록된 값이 없습니다.</p>
      ) : (
        <dl className="mt-2 space-y-3">
          {Object.entries(config).map(([key, value]) => (
            <div key={key} className="text-sm">
              <dt className="text-gray-400">{key}</dt>
              <dd className="mt-1">
                {Array.isArray(value) ? (
                  // fingerprints 는 기기·빌드마다 늘어난다. 위 URI 목록과 같은 규칙으로 담는다.
                  <ul
                    className={cn(
                      'space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2',
                      URI_LIST_MAX_HEIGHT,
                    )}
                  >
                    {value.map((v, i) => (
                      <li
                        key={i}
                        className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-700"
                      >
                        {String(v)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="break-all font-mono text-xs text-gray-800">
                    {String(value)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  /** 두 단 그리드에서 한 줄을 통째로 쓴다. 값이 길어 반으로 자르면 읽기 어려운 것에 쓴다. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex gap-3 text-sm', wide && 'sm:col-span-2')}>
      <dt className="w-24 shrink-0 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-gray-800">{children}</dd>
    </div>
  );
}

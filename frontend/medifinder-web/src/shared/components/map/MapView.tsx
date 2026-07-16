import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { PlatformMap } from './PlatformMap';
import { MAP_ADAPTERS, type PlatformAdapter, type PlatformId } from './mapAdapters';

interface MapViewProps {
  lat: number;
  lng: number;
  name: string;
}

/**
 * 지도 플랫폼 전환.
 *
 * 기본은 네이버. 다른 지도는 작은 드롭다운 뒤에 숨긴다 — 탭 버튼처럼 크게 노출하면
 * 무심코 눌러 카카오·구글 지도 SDK 가 로드되고(= 호출 비용), 정작 대부분은 네이버면 충분하다.
 * **고른 플랫폼만 렌더한다** — `key` 를 달아, 바꾸면 이전 지도가 언마운트되고 그때서야
 * 새 SDK 가 로드된다. 고르지 않은 플랫폼의 지도 API 를 미리 부를 이유가 없다.
 */
export function MapView({ lat, lng, name }: MapViewProps) {
  const { t } = useTranslation();

  // 키가 설정된 플랫폼만 노출한다. 키 없는 탭은 "미설정" 안내 대신 아예 안 그린다.
  const adapters = MAP_ADAPTERS.filter((a) => a.key);
  const [platform, setPlatform] = useState<PlatformId>(() => pickInitial(adapters));
  // 한 번이라도 연 플랫폼. 이것만 마운트해두고, 활성 아닌 건 숨긴다(언마운트 안 함).
  const [activated, setActivated] = useState<PlatformId[]>(() => [platform]);

  // 쓸 수 있는 지도가 하나도 없으면 지도 영역 자체를 숨긴다.
  if (adapters.length === 0) return null;

  const point = { lat, lng, name };

  /**
   * 전환할 때 이전 지도를 **언마운트하지 않는다.** 언마운트하면 다시 고를 때 지도 인스턴스를
   * 새로 만들며 콜이 또 오른다(과금 기준). 처음 고른 플랫폼만 생성(콜 1) 하고,
   * 이미 방문한 플랫폼을 다시 고르면 숨겨둔 걸 도로 보여줄 뿐 — **콜 0**.
   */
  const select = (id: PlatformId) => {
    setPlatform(id);
    setActivated((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  return (
    <div>
      {/*
        지도가 둘 이상일 때만 전환 UI 를 띄운다. 눌러야 목록이 펼쳐지므로
        스치듯 다른 지도를 로드하는 일이 없다. 오른쪽 위에 조그맣게 둔다.
      */}
      {adapters.length > 1 && (
        <div className="mb-2 flex justify-end">
          <PlatformSwitcher
            adapters={adapters}
            value={platform}
            onChange={select}
            label={(id) => t(`map.tabs.${id}`)}
            ariaLabel={t('map.switchLabel')}
          />
        </div>
      )}

      {/*
        방문한 플랫폼을 겹쳐 쌓고, 활성 아닌 건 display:none 으로 숨긴다.
        지도 인스턴스는 살아 있으니 재선택 시 새로 만들지 않는다(콜 절약).
      */}
      <div className="relative">
        {adapters
          .filter((a) => activated.includes(a.id))
          .map((a) => {
            const isActive = a.id === platform;
            return (
              <div key={a.id} className={isActive ? '' : 'hidden'}>
                <PlatformMap adapter={a} point={point} visible={isActive} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

/**
 * 첫 활성 지도를 고른다.
 *
 * 무료 플랜 호출 수를 한 플랫폼에 몰지 않으려고 **네이버·카카오 중 랜덤**으로 시작한다.
 * 한국 지도는 구글이 부실해서(도로·상호 누락) 초기 후보에서 뺀다 — 전환 목록엔 그대로 둔다.
 * 둘 다 키가 없으면 남은 것(구글뿐일 수 있음) 중 첫 번째로 떨어진다.
 */
function pickInitial(adapters: PlatformAdapter[]): PlatformId {
  const pool = adapters.filter((a) => a.id === 'naver' || a.id === 'kakao');
  const from = pool.length > 0 ? pool : adapters;
  const idx = Math.floor(Math.random() * from.length);
  return (from[idx] ?? MAP_ADAPTERS[0]).id;
}

interface PlatformSwitcherProps {
  adapters: { id: PlatformId }[];
  value: PlatformId;
  onChange: (id: PlatformId) => void;
  label: (id: PlatformId) => string;
  ariaLabel: string;
}

/**
 * 네이티브 `<select>` 를 안 쓴다 — 펼쳤을 때 옵션 목록이 OS 기본 디자인이라
 * 앱의 나머지와 겉돈다. 버튼 + 커스텀 팝오버로 목록까지 직접 그린다.
 * 바깥 클릭·Esc 로 닫고, 지도가 몇 개뿐이라 키보드 화살표까지는 과하다.
 */
function PlatformSwitcher({
  adapters,
  value,
  onChange,
  label,
  ariaLabel,
}: PlatformSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1 pl-2.5 pr-2 text-xs font-medium text-slate-600 transition-colors hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-200"
      >
        {label(value)}
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          /* z 를 크게 — 아래 지도의 줌 컨트롤(SDK 가 z-index 100대로 얹는다) 위로 떠야 안 가린다. */
          className="absolute right-0 z-[1000] mt-1 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {adapters.map((a) => {
            const selected = a.id === value;
            return (
              <li key={a.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 whitespace-nowrap py-1.5 pl-2.5 pr-3 text-left text-xs transition-colors hover:bg-slate-50 ${
                    selected ? 'font-medium text-primary-600' : 'text-slate-600'
                  }`}
                >
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-primary-600' : 'text-transparent'}`}
                  />
                  {label(a.id)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

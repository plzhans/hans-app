/**
 * 공공데이터 제공기관. 기관끼리 데이터를 서로 참조하지 않는다.
 *
 * **순서가 의미를 갖는다.** mois(법정동코드)가 맨 앞이다 — HIRA(코드)와 NMC(이름)가
 * 서로 다른 방식으로 주는 지역을 우리 코드로 옮기려면 기준이 되는 정본이 먼저 있어야 한다.
 * 배치가 이 순서대로 돈다.
 */
export const DATA_PROVIDERS = ['mois', 'nmc', 'hira'] as const;

export type DataProvider = (typeof DATA_PROVIDERS)[number];

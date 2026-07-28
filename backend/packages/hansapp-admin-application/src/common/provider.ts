/** 공공데이터 제공기관. 두 기관의 데이터는 서로 참조하지 않는다. */
export const DATA_PROVIDERS = ['nmc', 'hira'] as const;

export type DataProvider = (typeof DATA_PROVIDERS)[number];

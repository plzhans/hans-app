export { LlmModule } from './llm.module';
export { LLM_CONFIG, buildLlmConfig } from './llm.config';
/*
  런타임에 바뀌는 LLM 설정. 구현(어디서 읽나)은 각 응용 계층이 준다 —
  값이 DB(env_setting)에 있어 이 패키지가 직접 읽을 수 없다.
*/
export { LLM_SETTINGS_SOURCE } from './llm-settings.source';
export type {
  LlmSettings,
  LlmSettingsSource,
  LlmEndpointSettings,
} from './llm-settings.source';
export type { LlmConfig, LlmProviderName } from './llm.config';
export { LlmService, jsonOutput } from './llm.service';
export { SvcPromptRepository } from './svc-prompt.repository';
export type { SvcPrompt } from './svc-prompt.repository';
export {
  LlmConfigError,
  LlmError,
  LlmInvalidCallError,
  LlmModelNotAllowedError,
} from './llm.types';
export type {
  LlmCall,
  LlmJsonSchema,
  LlmModelChoice,
  LlmPrepareInput,
  LlmProviderOptions,
} from './llm.types';

/*
  업체에 실제로 있는 모델 목록. **우리가 허용한 목록(LlmService.listModels)과 다르다** —
  이쪽은 관리 화면이 "무엇을 고를 수 있나" 를 보여 주려고 업체를 직접 부르는 것이다.
*/
export { fetchVendorModels } from './vendor-models';

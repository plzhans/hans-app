import { Injectable } from '@nestjs/common';
import { LLM_DEFAULTS } from '@hansapp/common';
import type { LlmSettings, LlmSettingsSource as Contract } from '@hansapp/llm';

import { SettingCache } from '../setting/setting-cache.service';
import { EnvLlmKeyCache } from './env-llm-key.cache';

/**
 * LlmService 에 설정을 대 준다. **값은 DB 에서 온다** — 동작·한도는 env_setting,
 * 접속처는 llm_endpoint 다.
 *
 * MailSettingsSource 와 같은 자리다 — LlmService 는 값의 출처를 모르고, 그 사이를 잇는 것이
 * 이 클래스 하나라 출처를 바꾸는 일이 여기서 끝난다.
 *
 * **부를 때마다 읽는다.** SettingCache 가 5분 캐시를 들고 있어 DB 를 매번 때리지 않으면서도
 * 화면에서 바꾼 값이 재시작 없이 먹는다.
 *
 * 기본값이 여기 있는 이유는 설정 파일에서 걷어냈기 때문이다 — 아무것도 없을 때 무엇이
 * 되는지는 이제 코드만 말할 수 있다.
 */
@Injectable()
export class LlmSettingsSource implements Contract {
  constructor(
    private readonly settings: SettingCache,
    private readonly endpoints: EnvLlmKeyCache,
  ) {}

  async load(): Promise<LlmSettings> {
    return {
      /*
        **기본값은 LLM_DEFAULTS 하나가 갖는다**(@hansapp/common). 화면의 placeholder 도 같은
        상수를 보므로, 한쪽만 고쳐 "적힌 값과 실제가 다른" 상태가 생기지 않는다.
      */
      timeoutSec: await this.settings.getNumber(
        'llm.timeoutSec',
        LLM_DEFAULTS.timeoutSec,
      ),
      maxTokens: await this.settings.getNumber(
        'llm.maxTokens',
        LLM_DEFAULTS.maxTokens,
      ),
      appDailyTokens: await this.settings.getNumber(
        'llm.appDailyTokens',
        LLM_DEFAULTS.appDailyTokens,
      ),
      appMonthlyTokens: await this.settings.getNumber(
        'llm.appMonthlyTokens',
        LLM_DEFAULTS.appMonthlyTokens,
      ),
      userTokens: await this.settings.getNumber(
        'llm.userTokens',
        LLM_DEFAULTS.userTokens,
      ),
      /*
        **둘 다 기본은 꺼짐이다.** 설정을 빠뜨린 환경에서 켜져 있는 것이 최악이다 —
        /test 는 유료 답변을 공짜로 내주고, 사용량 노출은 요금을 역산당한다.
      */
      allowTestCommand: await this.settings.getBoolean(
        'llm.allowTestCommand',
        false,
      ),
      exposeDebugUsage: await this.settings.getBoolean(
        'llm.exposeDebugUsage',
        false,
      ),
      /*
        **접속처는 목록(llm_endpoint)에서 온다.** 업체마다 한 자리씩 고정해 두면 같은 업체를
        둘 이상 등록할 수가 없다 — 운영용·개발용 키를 따로 두려는 것이 이 목록의 이유다.
      */
      ...(await this.endpoints.resolve()),
    };
  }
}

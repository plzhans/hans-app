import { Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { HealthcareMcpServer } from '@hansapp/mcp';
import type { Request, Response } from 'express';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';

/**
 * 병원 도메인 MCP 엔드포인트. **외부 AI 클라이언트(Claude Desktop·Cursor 등)가 붙는 자리다.**
 *
 * ```
 *   Claude Desktop          ← 모델은 여기 있다
 *        │ JSON-RPC over HTTP POST
 *        ▼
 *   POST /mcp/healthcare    ← 우리. LLM 을 부르지 않는다
 *        ├ tools/list       도구 목록
 *        └ tools/call       ES·DB 조회
 * ```
 *
 * `/healthcare/ai-search` 와 **비용 구조가 정반대다** — 저쪽은 우리가 LLM 요금을 내고,
 * 여기는 붙은 쪽 구독이 낸다. 우리는 데이터만 서빙한다.
 *
 * [경로가 하나인 이유]
 * MCP 는 JSON-RPC 라 무엇을 부를지가 URL 이 아니라 **본문**에 있다. 스펙이 "서버 하나당
 * 엔드포인트 하나" 를 MUST 로 못 박는다 — 도구별로 쪼개면 클라이언트가 붙지 못한다.
 * 도메인이 늘면 `/mcp/<도메인>` 컨트롤러를 하나 더 만든다(도구를 한 서버에 몰지 않는 이유는
 * 모든 도구 스키마가 매 턴 모델 컨텍스트에 실리기 때문이다).
 *
 * [Swagger 에서 뺀 이유]
 * REST 가 아니라 RPC 라 문서화할 리소스가 없다. 도구 목록은 `tools/list` 가 스스로 답한다.
 */
@ApiExcludeController()
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('mcp/healthcare')
export class HealthcareMcpController {
  /**
   * SDK 핸들러. **팩토리를 넘긴다** — 요청마다 McpServer 를 새로 만든다(McpServerFactory 계약).
   * 새 스펙(2026-07-28)은 세션이 없어 서버에 남는 상태가 없으므로 안전하고, 만드는 비용은
   * 도구 등록 몇 번뿐이다.
   */
  private readonly handle = toNodeHandler(createMcpHandler(() => this.mcp.create()));

  constructor(private readonly mcp: HealthcareMcpServer) {}

  /**
   * **`@Res()` 를 쓰는 이유**는 응답 형식을 SDK 가 요청마다 고르기 때문이다 —
   * `application/json` 일 수도 `text/event-stream` 일 수도 있다. Nest 직렬화를 태우면
   * SSE 가 깨진다. 그래서 DTO 도 반환값도 없다.
   *
   * **`req.body` 를 세 번째로 넘긴다.** Nest 의 전역 body parser 가 스트림을 이미 소비했기
   * 때문이다 — 어댑터가 이 경우를 위해 파싱된 본문을 받아 준다(안 넘기면 본문이 비어 온다).
   */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handle(req, res, req.body);
  }
}

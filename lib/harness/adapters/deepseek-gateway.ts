import type {ModelGatewayPort} from '../ports';
import {
  err,
  ok,
  type HarnessError,
  type LinePatch,
  type ModelInferOutput,
  type ModelTier,
  type Result,
  type RoleKind,
  type SlotFrame,
} from '../types';

export interface DeepSeekGatewayConfig {
  apiKey: string;
  baseUrl?: string;
  flashModel?: string;
  proModel?: string;
}

/**
 * Server-side DeepSeek OpenAI-compatible ModelGatewayPort.
 * Targets DeepSeek-V4.1-Flash-1017 / Pro tiers while keeping Slot 1 byte-identical for Prefix Cache hits.
 */
export class DeepSeekModelGateway implements ModelGatewayPort {
  public readonly adapterName = 'deepseek-v4.1-flash-1017';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly flashModel: string;
  private readonly proModel: string;

  constructor(config: DeepSeekGatewayConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.deepseek.com/v1').replace(/\/$/, '');
    this.flashModel = config.flashModel ?? 'deepseek-chat';
    this.proModel = config.proModel ?? 'deepseek-reasoner';
  }

  async inferPatch(
    frame: SlotFrame,
    _role: RoleKind,
    tier: ModelTier,
  ): Promise<Result<ModelInferOutput, HarnessError>> {
    if (!this.apiKey) {
      return err({
        code: 'MODEL_GATEWAY_ERROR',
        message: 'DEEPSEEK_API_KEY is not configured in server environment (.env.local).',
      });
    }

    const model = tier === 'pro' ? this.proModel : this.flashModel;

    const systemMessage = frame.slot1StaticHead.content;
    const userMessage = [
      frame.slot2ContractAnchors.content,
      frame.slot3SurgicalSlice.content,
      frame.slot4VerifyFeedback.content,
      'Respond strictly as JSON with shape: {"reasoningSummary": string, "patch": {"file": string, "startLine": number, "endLine": number, "expectedFirstLine": string, "newCode": string}}. Do NOT include line-number prefixes (like "32 | ") in newCode or expectedFirstLine, and ensure newCode completely replaces lines [startLine..endLine] with balanced braces.',
    ].join('\n\n');

    const isReasoner = model.toLowerCase().includes('reasoner');
    try {
      const requestBody: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: [
          {role: 'system', content: systemMessage},
          {role: 'user', content: userMessage},
        ],
      };
      if (!isReasoner) {
        requestBody.temperature = 0.1;
        requestBody.response_format = {type: 'json_object'};
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const body = await response.text();
        return err({
          code: 'MODEL_GATEWAY_ERROR',
          message: `DeepSeek API HTTP ${response.status}`,
          details: body.slice(0, 300),
        });
      }

      const data = (await response.json()) as {
        choices?: Array<{message?: {content?: string; reasoning_content?: string}}>;
        usage?: {
          prompt_tokens?: number;
          prompt_cache_hit_tokens?: number;
          completion_tokens?: number;
        };
      };

      const rawContent =
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.message?.reasoning_content;
      if (!rawContent) {
        return err({
          code: 'MODEL_GATEWAY_ERROR',
          message: 'DeepSeek API returned an empty response body.',
        });
      }

      const trimmed = rawContent.trim();
      const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const candidate = fenceMatch?.[1]?.trim() ?? trimmed;
      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');
      const jsonStr =
        firstBrace !== -1 && lastBrace > firstBrace
          ? candidate.slice(firstBrace, lastBrace + 1)
          : candidate;

      const parsed = JSON.parse(jsonStr) as {
        reasoningSummary?: string;
        patch?: LinePatch;
      };

      if (
        !parsed.patch ||
        typeof parsed.patch.file !== 'string' ||
        typeof parsed.patch.startLine !== 'number' ||
        typeof parsed.patch.endLine !== 'number' ||
        typeof parsed.patch.newCode !== 'string'
      ) {
        return err({
          code: 'MODEL_GATEWAY_ERROR',
          message: 'Model output violated replace_lines JSON schema.',
          details: rawContent.slice(0, 240),
        });
      }

      return ok({
        reasoningSummary:
          parsed.reasoningSummary ?? `DeepSeek (${model}) generated line-range patch`,
        patch: {
          file: parsed.patch.file,
          startLine: parsed.patch.startLine,
          endLine: parsed.patch.endLine,
          expectedFirstLine: parsed.patch.expectedFirstLine ?? '',
          newCode: parsed.patch.newCode,
        },
        promptTokens: data.usage?.prompt_tokens,
        cacheHitTokens: data.usage?.prompt_cache_hit_tokens,
        completionTokens: data.usage?.completion_tokens,
      });
    } catch (error) {
      return err({
        code: 'MODEL_GATEWAY_ERROR',
        message:
          error instanceof Error
            ? `DeepSeek request failed: ${error.message}`
            : 'Unknown DeepSeek request failure',
      });
    }
  }
}

// The Claude client behind an interface (§8.0), so tests can use a fake.
import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../lib/app-error.ts';

export interface StructuredRequest {
  /** For logs, e.g. "parse-filter". */
  feature: string;
  /** Stable instructions + reference data (cached). */
  system: string;
  /** The per-request part (user text, today's date, …). */
  user: string;
  /** JSON schema for structured outputs. */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface StructuredLLM {
  /** Returns the parsed JSON matching `schema`, or throws AppError('AI_UNAVAILABLE'). */
  generate(req: StructuredRequest): Promise<unknown>;
}

export const aiUnavailable = (message: string, details?: unknown) =>
  new AppError('AI_UNAVAILABLE', message, details);

/** Used when no client is configured: every AI request is a clean 503. */
export const disabledLLM: StructuredLLM = {
  generate: () => Promise.reject(aiUnavailable('AI features are not configured')),
};

export function createAnthropicLLM({ model }: { model: string }): StructuredLLM {
  // Credentials resolve from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or the `ant auth login`
  // profile. They never reach the browser (§8).
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });

  return {
    async generate(req) {
      const started = Date.now();
      let response: Anthropic.Beta.Messages.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model,
          max_tokens: req.maxTokens ?? 4096,
          // §8.0: refusal fallback, low effort, structured output. No sampling params.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
          // Cache breakpoint on the stable system prompt; the user message varies per request.
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: req.user }],
        });
      } catch (err) {
        const status = err instanceof Anthropic.APIError ? err.status : undefined;
        console.error(
          `[ai:${req.feature}] request failed`,
          status ?? '',
          err instanceof Error ? err.message : err,
        );
        throw aiUnavailable('Claude is unavailable right now. Try again in a moment.');
      }

      const { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } =
        response.usage;
      console.info(
        `[ai:${req.feature}] ${response.model} ${response.stop_reason} in ${Date.now() - started} ms ` +
          `(in ${input_tokens}, cache read ${cache_read_input_tokens ?? 0}, ` +
          `cache write ${cache_creation_input_tokens ?? 0}, out ${output_tokens})`,
      );

      if (response.stop_reason === 'refusal') {
        throw aiUnavailable('Claude declined this request.', {
          category: response.stop_details?.category ?? null,
        });
      }
      if (response.stop_reason === 'max_tokens') {
        throw aiUnavailable('Claude ran out of room before finishing. Try a shorter request.');
      }
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw aiUnavailable('Claude returned an unexpected response.');
      }
    },
  };
}

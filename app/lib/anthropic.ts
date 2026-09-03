import Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '../server/db/repository';
import { assertWithinLimits } from '../server/limits';
import { estimateCostUsd } from './pricing';
import type { TokenUsage } from './types';

/**
 * The single point through which every Anthropic call in the app passes.
 *
 * The reason this exists is not abstraction for its own sake — it is so that
 * quota enforcement, usage accounting, and the daily spend ceiling have exactly
 * one place to live. A future handler that forgets to meter itself is not
 * possible if the only way to reach Claude is through here.
 *
 * See docs/adr/0004-single-anthropic-choke-point.md.
 */

/** Effort levels the app uses, mapped per call kind below. */
export type Effort = 'low' | 'medium' | 'high';

/**
 * What kind of work a call represents. Recorded against every call so per-kind
 * cost can be reported, and so quotas can price an interview differently from a
 * generation.
 */
export type UsageKind =
  | 'extract'
  | 'extract_resume'
  | 'tailor'
  | 'instruct'
  | 'interview_turn'
  | 'compose';

/** Per-kind model + budget. Keeps model choice out of the handlers. */
const CALL_CONFIG: Record<UsageKind, { model: string; maxTokens: number; effort: Effort }> = {
  extract: { model: 'claude-sonnet-4-6', maxTokens: 4000, effort: 'low' },
  extract_resume: { model: 'claude-sonnet-4-6', maxTokens: 4000, effort: 'low' },
  tailor: { model: 'claude-sonnet-4-6', maxTokens: 8000, effort: 'medium' },
  instruct: { model: 'claude-sonnet-4-6', maxTokens: 8000, effort: 'medium' },
  interview_turn: { model: 'claude-sonnet-4-6', maxTokens: 2000, effort: 'low' },
  compose: { model: 'claude-sonnet-4-6', maxTokens: 8000, effort: 'medium' },
};

/** The model used for the GET health check. */
export const HEALTH_CHECK_MODEL = CALL_CONFIG.tailor.model;

export interface CallClaudeOptions {
  /**
   * Who this call is for. Required, and required for a reason: it is what makes
   * metering unforgettable. A new handler cannot reach Claude without naming an
   * owner, so it cannot spend money anonymously.
   */
  userId: string;
  kind: UsageKind;
  system: string;
  content: unknown[];
  tool: Anthropic.Tool;
  /** Overrides the per-kind default. Rarely needed. */
  maxTokens?: number;
  effort?: Effort;
  /** Ties the spend to an interview, for per-session cost reporting. */
  sessionId?: string | null;
  /**
   * Per-user prompt text, sent after the cached block.
   *
   * Anything that differs between people belongs here rather than in `system`.
   * The cache key is a prefix match, so a name or a personal rule inside the
   * shared block would give every user their own copy of the whole prompt and
   * the hit rate would collapse to what one person can reuse alone.
   */
  systemSuffix?: string;
}

export interface CallClaudeResult<T> {
  toolInput: T;
  usage: TokenUsage;
}

/** Thrown when Claude returns no tool_use block despite a forced tool_choice. */
export class NoToolUseError extends Error {
  constructor() {
    super('Model returned no tool_use block despite a forced tool_choice.');
    this.name = 'NoToolUseError';
  }
}

/**
 * Makes one forced-tool-use call and returns the tool input plus usage.
 *
 * Every mode in the app is single-turn and forces exactly one tool, so that
 * shape is baked in here rather than re-expressed at each call site.
 */
export async function callClaude<T>(opts: CallClaudeOptions): Promise<CallClaudeResult<T>> {
  const config = CALL_CONFIG[opts.kind];
  const model = config.model;

  // Before spending anything, not after.
  await assertWithinLimits(opts.userId, opts.kind);

  const client = new Anthropic();

  // The system prompt is the stable part of every request, so it carries the
  // cache breakpoint. Anything volatile must stay in the user content or the
  // prefix changes each turn and nothing is ever reused. Below the model's
  // minimum cacheable length this is simply ignored, so it is safe to always
  // send. Watch usage.cacheReadTokens: a persistent zero across turns means
  // something volatile has leaked into the system prompt.
  const system = [
    { type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } },
    ...(opts.systemSuffix
      ? [{ type: 'text' as const, text: opts.systemSuffix }]
      : []),
  ];

  // `output_config` is not in the SDK's published request type yet, hence the
  // cast. Confined to this one place instead of every call site.
  const response: any = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? config.maxTokens,
    output_config: { effort: opts.effort ?? config.effort },
    system,
    tools: [opts.tool],
    tool_choice: { type: 'tool', name: opts.tool.name },
    messages: [{ role: 'user', content: opts.content }],
  } as any);

  const toolUse = response.content.find((block: any) => block.type === 'tool_use') as
    | Anthropic.ToolUseBlock
    | undefined;
  if (!toolUse) throw new NoToolUseError();

  const raw = response.usage ?? {};
  const inputTokens = raw.input_tokens ?? 0;
  const outputTokens = raw.output_tokens ?? 0;
  const cacheReadTokens = raw.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = raw.cache_creation_input_tokens ?? 0;

  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: estimateCostUsd(model, { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }),
  };

  // Recorded even though the caller may throw on what comes back: the tokens
  // were spent regardless, and a ceiling that only counts successful calls is
  // blind to exactly the failure loop it exists to stop.
  await recordUsage(opts.userId, {
    kind: opts.kind,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd: usage.costUsd,
    sessionId: opts.sessionId ?? null,
  });

  return { toolInput: toolUse.input as T, usage };
}

import Anthropic from '@anthropic-ai/sdk';
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
  kind: UsageKind;
  system: string;
  content: unknown[];
  tool: Anthropic.Tool;
  /** Overrides the per-kind default. Rarely needed. */
  maxTokens?: number;
  effort?: Effort;
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

  const client = new Anthropic();

  // `output_config` is not in the SDK's published request type yet, hence the
  // cast. Confined to this one place instead of every call site.
  const response: any = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? config.maxTokens,
    output_config: { effort: opts.effort ?? config.effort },
    system: opts.system,
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

  return { toolInput: toolUse.input as T, usage };
}

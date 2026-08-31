// Token pricing, per model, in USD per million tokens.
//
// Cache rates follow Anthropic's standard multipliers on the base input rate:
// a 5-minute cache write costs 1.25x input, and a cache read costs 0.1x input.
// Both are derived here rather than hardcoded so a base-rate correction can't
// leave the cache rates silently stale.
//
// Before adding a model, check the current rates at anthropic.com/pricing —
// do not guess. An understated rate makes the daily spend ceiling in
// lib/anthropic.ts fire late, which is exactly when it matters most.

export interface ModelRates {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

const RATES: Record<string, ModelRates> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
};

/** Used when a model has no entry in RATES — see estimateCostUsd. */
const FALLBACK_RATES: ModelRates = RATES['claude-sonnet-4-6'];

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Estimated cost of a single call. Cached tokens are billed at their own rates
 * and are NOT included in inputTokens by the API, so they are added on top.
 *
 * An unknown model falls back to Sonnet rates and warns rather than returning
 * 0 — a silent zero would make the spend ceiling unenforceable for exactly the
 * model someone just added without updating this table.
 */
export function estimateCostUsd(model: string, tokens: TokenCounts): number {
  const rates = RATES[model];
  if (!rates) {
    console.warn(`[Resumi] No pricing entry for model "${model}" — falling back to Sonnet rates. Add it to lib/pricing.ts.`);
  }
  const { input, output } = rates ?? FALLBACK_RATES;

  const perMillion = (count: number, rate: number) => (count / 1_000_000) * rate;

  return (
    perMillion(tokens.inputTokens, input) +
    perMillion(tokens.outputTokens, output) +
    perMillion(tokens.cacheReadTokens ?? 0, input * CACHE_READ_MULTIPLIER) +
    perMillion(tokens.cacheWriteTokens ?? 0, input * CACHE_WRITE_MULTIPLIER)
  );
}

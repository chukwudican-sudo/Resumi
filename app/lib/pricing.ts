// Pricing for claude-sonnet-4-6 (per the Resumi PRD's chosen model).
const INPUT_COST_PER_MTOK = 3;
const OUTPUT_COST_PER_MTOK = 15;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_COST_PER_MTOK + (outputTokens / 1_000_000) * OUTPUT_COST_PER_MTOK;
}

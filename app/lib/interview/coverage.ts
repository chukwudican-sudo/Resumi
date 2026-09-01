import type { Fact, FactCategory, ProfileEntry } from '../types';
import {
  CATEGORY_WEIGHTS,
  DEEP_ENTRY_LIMIT,
  DEEP_REQUIRED_CATEGORIES,
  SHALLOW_REQUIRED_CATEGORIES,
  SCORED_ENTRY_KINDS,
} from './taxonomy';

/**
 * Works out what the interview still needs to ask about.
 *
 * This is deliberately deterministic and computed server-side rather than left
 * to the model. Asking a model to notice what is missing from a blank slate is
 * unreliable and unrepeatable; ranking the gaps here and handing the model the
 * top few gives it a plan while leaving it free to follow a better thread.
 *
 * Pure — no I/O, no clock, no randomness — so it is unit-testable.
 */

export interface Gap {
  entryId: string | null;
  category: FactCategory;
  /** Higher is more worth asking about next. */
  priority: number;
  /** Plain-English hint the prompt passes to the model. */
  hint: string;
}

export interface EntryCoverage {
  entryId: string;
  label: string;
  /** 0..1 — fraction of required categories present. */
  score: number;
  missing: FactCategory[];
  /** Whether this entry is one of the few that gets the full treatment. */
  deep: boolean;
}

export interface CoverageReport {
  /** 0..1 across all scored entries and the global checks. */
  overall: number;
  perEntry: EntryCoverage[];
  /** Ranked, highest priority first. */
  gaps: Gap[];
  globals: {
    hasName: boolean;
    hasContactEmail: boolean;
    educationCount: number;
    skillCount: number;
    entriesWithNoMetric: string[];
  };
}

/** Recency multiplier — the newest entry is what a reader looks at first. */
function recencyWeight(orderIndex: number): number {
  if (orderIndex === 0) return 3;
  if (orderIndex === 1) return 2;
  return 1;
}

function entryLabel(entry: ProfileEntry): string {
  const parts = [entry.title, entry.org].filter(Boolean);
  return parts.length ? parts.join(' at ') : `(untitled ${entry.kind})`;
}

/**
 * A metric fact only counts when it carries a real number. This one rule is
 * most of what makes follow-up questions feel sharp rather than generic: it is
 * what stops "improved performance significantly" from closing the gap that
 * should have produced "cut p95 from 800ms to 240ms".
 */
function satisfies(fact: Fact, category: FactCategory): boolean {
  if (fact.category !== category) return false;
  if (category === 'metric') return fact.hasNumber;
  return true;
}

export function computeCoverage(entries: ProfileEntry[], facts: Fact[]): CoverageReport {
  const active = facts.filter((f) => f.status === 'active');
  const byEntry = new Map<string, Fact[]>();
  for (const fact of active) {
    if (!fact.entryId) continue;
    const list = byEntry.get(fact.entryId);
    if (list) list.push(fact);
    else byEntry.set(fact.entryId, [fact]);
  }

  const scored = entries
    .filter((e) => SCORED_ENTRY_KINDS.includes(e.kind))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // The most recent few of each kind get the full six; the rest need only
  // enough to write an honest line. Without this the interview grows with the
  // length of someone's history rather than with what a resume can carry.
  const seenByKind = new Map<string, number>();
  const deepIds = new Set<string>();
  for (const entry of scored) {
    const seen = seenByKind.get(entry.kind) ?? 0;
    if (seen < (DEEP_ENTRY_LIMIT[entry.kind] ?? 0)) deepIds.add(entry.id);
    seenByKind.set(entry.kind, seen + 1);
  }

  const perEntry: EntryCoverage[] = [];
  const gaps: Gap[] = [];

  for (const entry of scored) {
    const entryFacts = byEntry.get(entry.id) ?? [];
    const deep = deepIds.has(entry.id);
    const required = deep ? DEEP_REQUIRED_CATEGORIES : SHALLOW_REQUIRED_CATEGORIES;
    const missing: FactCategory[] = [];

    for (const category of required) {
      if (!entryFacts.some((f) => satisfies(f, category))) missing.push(category);
    }

    const present = required.length - missing.length;
    perEntry.push({
      entryId: entry.id,
      label: entryLabel(entry),
      score: present / required.length,
      missing,
      deep,
    });

    // An entry we know nothing about is worth more than one more detail on an
    // entry already half covered — breadth before depth.
    const emptyBonus = entryFacts.length === 0 ? 2 : 1;

    for (const category of missing) {
      gaps.push({
        entryId: entry.id,
        category,
        priority: recencyWeight(entry.orderIndex) * CATEGORY_WEIGHTS[category] * emptyBonus,
        hint: `${entryLabel(entry)} has no ${category} yet.`,
      });
    }
  }

  const globalFacts = active.filter((f) => !f.entryId);
  const hasName = globalFacts.some((f) => f.category === 'identity' && /\S/.test(f.text));
  const hasContactEmail = globalFacts.some((f) => f.category === 'identity' && f.text.includes('@'));
  const educationCount = entries.filter((e) => e.kind === 'education').length;
  const skillCount = globalFacts.filter((f) => f.category === 'skill').length;

  // Global gaps are entry-less. They are weighted to sit near the top early on
  // (a resume with no email is broken) but they are few, so they stop competing
  // once satisfied.
  if (!hasContactEmail) {
    gaps.push({
      entryId: null,
      category: 'identity',
      priority: CATEGORY_WEIGHTS.identity * 3,
      hint: 'No contact email captured yet.',
    });
  }
  if (educationCount === 0) {
    gaps.push({
      entryId: null,
      category: 'credential',
      priority: CATEGORY_WEIGHTS.credential * 3,
      hint: 'No education or credential captured yet.',
    });
  }
  if (skillCount < 3) {
    gaps.push({
      entryId: null,
      category: 'skill',
      priority: CATEGORY_WEIGHTS.skill * 2,
      hint: `Only ${skillCount} skill${skillCount === 1 ? '' : 's'} captured; aim for a few more.`,
    });
  }

  gaps.sort((a, b) => b.priority - a.priority);

  // Only the deep entries are held to the metric bar. A shallow entry never
  // needed one, so counting it here would make completion unreachable.
  const entriesWithNoMetric = perEntry
    .filter((e) => e.deep && e.missing.includes('metric'))
    .map((e) => e.entryId);

  // Overall folds the global checks in as one pseudo-entry so a profile with
  // well-covered jobs but no email cannot read as complete.
  const globalChecks = [hasContactEmail, educationCount > 0, skillCount >= 3];
  const globalScore = globalChecks.filter(Boolean).length / globalChecks.length;
  const entryScores = perEntry.map((e) => e.score);
  const overall = entryScores.length
    ? (entryScores.reduce((a, b) => a + b, 0) + globalScore) / (entryScores.length + 1)
    : globalScore;

  return {
    overall,
    perEntry,
    gaps,
    globals: { hasName, hasContactEmail, educationCount, skillCount, entriesWithNoMetric },
  };
}

/**
 * Whether the interview has collected enough to stop.
 *
 * Requiring a real metric on every scored entry — not just a high average — is
 * what stops the interview finishing with a profile full of unquantified
 * bullets, which is the failure mode that makes a generated resume look weak.
 */
export function isCoverageSufficient(report: CoverageReport): boolean {
  return report.overall >= 0.8 && report.globals.entriesWithNoMetric.length === 0;
}

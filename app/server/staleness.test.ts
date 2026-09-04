import assert from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * A guard on the one flag that decides whether polish ever runs.
 *
 * `saveMasterResume` used to hardcode `stale: false`, so saving an entry
 * declared the resume freshly polished. Polish then skipped it — at exactly the
 * moment it was needed — and a typo typed into a bullet went to the PDF while
 * the flag insisted everything was current. It cost a day to find because
 * nothing was broken, only silent.
 *
 * Read as source rather than exercised, because the alternative is a database.
 */
const repository = readFileSync(new URL('./db/repository.ts', import.meta.url), 'utf8');
const polishProfile = readFileSync(new URL('./polishProfile.ts', import.meta.url), 'utf8');
const actions = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');

test('saving the resume does not decide on its own that it is current', () => {
  const signature = repository.slice(
    repository.indexOf('export async function saveMasterResume'),
    repository.indexOf('export async function saveMasterResume') + 260,
  );
  assert.match(signature, /stale = true/, 'the default must be "needs polishing"');
  assert.doesNotMatch(signature, /stale: false/, 'staleness is the caller\'s to state, never hardcoded');
});

test('only the polish pass may mark a resume current', () => {
  assert.match(
    polishProfile,
    /saveMasterResume\([\s\S]{0,80}?,\s*false\)/,
    'polish should record that it has just run',
  );
});

test('rebuilding after an edit leaves the resume needing polish', () => {
  // refreshMasterResume runs on every entry save. If it claimed the resume was
  // current, editing a bullet would permanently switch polish off for it.
  const rebuild = actions.slice(actions.indexOf('async function refreshMasterResume'));
  const call = rebuild.slice(rebuild.indexOf('saveMasterResume('), rebuild.indexOf('saveMasterResume(') + 90);
  assert.doesNotMatch(call, /,\s*false\s*\)/, 'a rebuild must not declare itself polished');
});

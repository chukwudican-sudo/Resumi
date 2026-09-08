import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The version has to reach both the preview and the download by the same route.
 *
 * resolveResume exists so those two "cannot drift" — its own comment says so —
 * and that held only because both were pinned to the latest. Once an older
 * version can be viewed, a preview showing version 2 while the download still
 * hands over version 5 is exactly the drift the file was written to prevent,
 * and silent: the filename gives no hint.
 *
 * The resolver itself needs a database, so what is asserted here is the wiring
 * either side of it — that both call sites read a version and pass it on.
 */

import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('the preview reads a version from the query string and passes it on', () => {
  const route = read('app/api/resume/preview/route.ts');
  assert.match(route, /searchParams\.get\('v'\)/, 'no version is read');
  assert.match(route, /resolveResume\(userId, applicationId, version\)/, 'the version is not passed on');
});

test('the download reads a version from the body and passes it on', () => {
  const route = read('app/api/compile/route.ts');
  assert.match(route, /body\.version/, 'no version is read');
  assert.match(route, /resolveResume\(userId, applicationId, version\)/, 'the version is not passed on');
});

test('the resolver takes a version and uses it to pick a row', () => {
  const source = read('app/server/resolveResume.ts');
  assert.match(source, /version\?: number \| null/, 'the parameter is gone');
  assert.match(source, /getResumeVersion\(userId, applicationId, version\)/, 'the version is not used');
  assert.match(source, /getLatestResume\(userId, applicationId\)/, 'there is no fallback to the latest');
});

test('the screen sends the version it is showing to both of them', () => {
  const view = read('app/components/applications/ApplicationView.tsx');
  assert.match(view, /<PdfPreview[^>]*version=\{resume\.version\}/s, 'the preview is not told');
  assert.match(view, /<DownloadPdf[^>]*version=\{resume\.version\}/s, 'the download is not told');
});

test('the preview puts the version in the URL rather than a header', () => {
  // The browser caches by URL: two versions of one application would otherwise
  // share a cache entry and the wrong bytes would be served.
  const preview = read('app/components/applications/PdfPreview.tsx');
  assert.match(preview, /&v=\$\{version\}/, 'the version is not in the query string');
  assert.match(preview, /\[applicationId, version, reloadKey\]/, 'changing version would not refetch');
});

test('browsing history does not restore', () => {
  const picker = read('app/components/applications/VersionPicker.tsx');
  assert.equal(/restoreResumeVersion/.test(picker), false, 'the picker still restores on click');
  assert.match(picker, /\?v=\$\{v\.version\}/, 'the picker does not navigate to a version');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'tools', 'sheetsmith.html');

test('standalone SheetSmith page and index link exist', () => {
  assert.ok(fs.existsSync(pagePath), 'tools/sheetsmith.html must exist');
  const page = fs.readFileSync(pagePath, 'utf8');
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /href="tools\/sheetsmith\.html"/);
  assert.doesNotMatch(page, /<script[^>]+src=|<link[^>]+rel=["']stylesheet/i, 'runtime must be self-contained');
});

test('page defines exact Letter and card dimensions plus print rules', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.match(page, /@page\s*{[^}]*size:\s*(?:Letter|8\.5in 11in)/s);
  assert.match(page, /--card-width:\s*2\.5in/);
  assert.match(page, /--card-height:\s*3\.5in/);
  assert.match(page, /--card-width:\s*3\.5in/);
  assert.match(page, /--card-height:\s*2in/);
  assert.match(page, /@media\s+print/);
  assert.match(page, /window\.print\(\)/);
});

test('page documents safety, privacy, limits, fit behavior, and parser attribution', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  for (const required of ['100% / Actual Size', 'browser-local', 'textContent', 'MAX_SOURCE_CHARS', 'fit: strict', 'MiniYAML']) {
    assert.ok(page.includes(required), `missing ${required}`);
  }
  assert.doesNotMatch(page, /eval\s*\(|new Function\s*\(/);
});

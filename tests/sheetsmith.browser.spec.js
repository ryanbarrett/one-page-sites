const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = 'http://127.0.0.1:4173/tools/sheetsmith.html';
let browser;

test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });

async function withPage(run, viewport) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  try { await run(page, errors); }
  finally { await page.close(); }
}

test('9-up YAML example renders exact playing cards', () => withPage(async page => {
  await page.selectOption('#example-select', 'playing');
  await page.click('#load-example');
  await page.waitForFunction(() => document.querySelectorAll('.print-sheet .card').length === 9);
  assert.equal(await page.locator('.print-sheet .card').count(), 9);
  assert.match(await page.locator('#status').textContent(), /9 cards/);
  assert.deepEqual(await page.locator('.print-sheet').evaluate(el => ({
    width: getComputedStyle(el).width,
    height: getComputedStyle(el).height,
    cardWidth: getComputedStyle(el.querySelector('.card')).width,
    cardHeight: getComputedStyle(el.querySelector('.card')).height
  })), { width: '816px', height: '1056px', cardWidth: '240px', cardHeight: '336px' });
}));

test('10-up JSON example renders repeated business cards', () => withPage(async page => {
  await page.selectOption('#example-select', 'business');
  await page.click('#load-example');
  await page.waitForFunction(() => document.querySelectorAll('.print-sheet .card').length === 10);
  assert.equal(await page.locator('.print-sheet .card').count(), 10);
  assert.equal(await page.locator('.print-sheet .card h1').count(), 10);
  assert.match(await page.locator('#status').textContent(), /10 cards/);
}));

test('parses edited JSON and reports malformed YAML with a line', () => withPage(async page => {
  const json = JSON.stringify({version:1,layout:'business-10',mode:'repeat',theme:'minimal',fit:'strict',accent:'forest',card:{blocks:[{type:'title',text:'JSON works'}]}});
  await page.fill('#source-editor', json);
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('.print-sheet .card h1')?.textContent === 'JSON works');
  assert.equal(await page.locator('.print-sheet .card h1').first().textContent(), 'JSON works');

  await page.fill('#source-editor', 'version: 1\nlayout: business-10\nmode: [broken');
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
  assert.match(await page.locator('#status').textContent(), /line/i);
  assert.equal(await page.locator('.print-sheet .card h1').first().textContent(), 'JSON works');
}));

test('supports repeat on either layout and rejects scriptable image URLs', () => withPage(async page => {
  await page.fill('#source-editor', `version: 1\nlayout: business-10\nmode: repeat\ntheme: modern\ncard:\n  blocks:\n    - type: image\n      src: "javascript:alert(1)"`);
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
  assert.match(await page.locator('#status').textContent(), /safe HTTPS URL or an image data URL/);

  await page.fill('#source-editor', `version: 1\nlayout: playing-9\nmode: repeat\ntheme: modern\ncard:\n  blocks:\n    - type: title\n      text: Repeat works`);
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('.print-sheet .card h1')?.textContent === 'Repeat works');
  assert.equal(await page.locator('.print-sheet .card h1').count(), 9);
  assert.equal(await page.locator('.print-sheet .card h1').first().textContent(), 'Repeat works');
}));

test('auto fit warns on unresolved overflow and strict remains strict', () => withPage(async page => {
  const huge = 'Long content '.repeat(165);
  await page.fill('#source-editor', JSON.stringify({version:1,layout:'business-10',mode:'repeat',theme:'classic',fit:'auto',accent:'navy',card:{blocks:[{type:'paragraph',text:huge}]}}));
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelectorAll('.card.overflow').length === 10);
  assert.match(await page.locator('#warnings').textContent(), /overflow|minimum/i);
  assert.equal(await page.locator('.card.overflow').count(), 10);

  await page.fill('#source-editor', JSON.stringify({version:1,layout:'business-10',mode:'repeat',theme:'classic',fit:'strict',accent:'navy',card:{blocks:[{type:'paragraph',text:huge}]}}));
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('#warnings').textContent.includes('Strict fit'));
}));

test('image helper creates a browser-local data URL', () => withPage(async page => {
  await page.setInputFiles('#image-file', { name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNk+M/wHwAF/gL+X1J8WQAAAABJRU5ErkJggg==', 'base64') });
  await page.waitForFunction(() => document.querySelector('#image-data').value.startsWith('data:image/png;base64,'));
  assert.match(await page.locator('#image-data').inputValue(), /^data:image\/png;base64,/);
  assert.match(await page.locator('#status').textContent(), /browser-local data URL/);
}));

test('print button calls window.print', () => withPage(async page => {
  await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
  await page.click('#print-sheet');
  assert.equal(await page.evaluate(() => window.__printed), true);
}));

test('responsive layout has no page overflow or console errors', () => withPage(async (page, errors) => {
  await page.selectOption('#example-select', 'playing');
  await page.click('#load-example');
  await page.waitForFunction(() => document.querySelectorAll('.print-sheet .card').length === 9);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(errors, []);
}, { width: 390, height: 844 }));

test('MiniYAML rejects prototype-mutating keys at every map level', () => withPage(async page => {
  const sources = [
    `__proto__: {version: 1, layout: business-10, mode: repeat, theme: modern, fit: strict, card: {blocks: [{type: title, text: inherited}]}}`,
    `version: 1\nlayout: business-10\nmode: repeat\ntheme: modern\ncard:\n  constructor: unsafe\n  blocks:\n    - type: title\n      text: Test`,
    `version: 1\nlayout: business-10\nmode: repeat\ntheme: modern\ncard:\n  blocks:\n    - type: title\n      text: Test\n      prototype: unsafe`
  ];
  for (const source of sources) {
    await page.fill('#source-editor', source);
    await page.click('#update-preview');
    await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
    assert.match(await page.locator('#status').textContent(), /dangerous mapping key/i);
  }
}));

test('MiniYAML rejects duplicate keys in sequence-map continuations', () => withPage(async page => {
  await page.fill('#source-editor', `version: 1\nlayout: business-10\nmode: repeat\ntheme: modern\ncard:\n  blocks:\n    - type: title\n      type: paragraph\n      text: Duplicate must fail`);
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
  assert.match(await page.locator('#status').textContent(), /duplicate key "type"/i);
}));

test('auto-fit applies one card-level heading size to every h1 and h2', () => withPage(async page => {
  const blocks = [
    {type:'title', text:'First title'}, {type:'title', text:'Second title'},
    {type:'subheader', text:'First subtitle'}, {type:'subheader', text:'Second subtitle'},
    {type:'paragraph', text:'Crowded content '.repeat(200)}
  ];
  await page.fill('#source-editor', JSON.stringify({version:1,layout:'business-10',mode:'repeat',theme:'classic',fit:'auto',card:{blocks}}));
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('.card-content')?.style.fontSize);
  const sizes = await page.locator('.card').first().evaluate(card => ({
    h1: [...card.querySelectorAll('h1')].map(el => getComputedStyle(el).fontSize),
    h2: [...card.querySelectorAll('h2')].map(el => getComputedStyle(el).fontSize)
  }));
  assert.equal(new Set(sizes.h1).size, 1, `all h1 sizes should match: ${sizes.h1}`);
  assert.equal(new Set(sizes.h2).size, 1, `all h2 sizes should match: ${sizes.h2}`);
  assert.ok(parseFloat(sizes.h1[0]) < 22, 'headings should actually have been fitted');
}));

test('a stale auto-fit render cannot mutate a newer strict render', () => withPage(async page => {
  const base = {version:1,layout:'business-10',mode:'repeat',theme:'classic',card:{blocks:[{type:'title',text:'Strict stays strict'},{type:'paragraph',text:'Crowded content '.repeat(200)}]}};
  await page.evaluate(({auto, strict}) => {
    const editor = document.querySelector('#source-editor');
    editor.value = auto;
    document.querySelector('#update-preview').click();
    editor.value = strict;
    document.querySelector('#update-preview').click();
  }, {auto: JSON.stringify({...base, fit:'auto'}), strict: JSON.stringify({...base, fit:'strict'})});
  await page.waitForFunction(() => document.querySelector('#warnings').textContent.includes('Strict fit'));
  assert.equal(await page.locator('.card-content').first().evaluate(el => el.style.fontSize), '');
  assert.equal(await page.locator('.card h1').first().evaluate(el => el.style.fontSize), '');
  assert.match(await page.locator('#status').textContent(), /review warnings/);
}));

test('the measurable 1-inch calibration ruler never overlaps cards', () => withPage(async page => {
  for (const example of ['playing', 'business']) {
    await page.selectOption('#example-select', example);
    await page.check('#calibration');
    await page.click('#load-example');
    await page.waitForFunction(() => document.querySelector('.calibration-ruler'));
    const geometry = await page.evaluate(() => {
      const ruler = document.querySelector('.calibration-ruler');
      const rr = ruler.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll('.print-sheet .card')].some(card => {
        const cr = card.getBoundingClientRect();
        return rr.left < cr.right && rr.right > cr.left && rr.top < cr.bottom && rr.bottom > cr.top;
      });
      return {width: getComputedStyle(ruler).width, overlaps};
    });
    assert.equal(geometry.width, '96px');
    assert.equal(geometry.overlaps, false, `${example} calibration ruler must not obscure a card`);
  }
}));

test('literal HTML remains text and hostile SVG data URLs are rejected', () => withPage(async page => {
  const literal = '<img src=x onerror=alert(1)><b>literal</b>';
  await page.fill('#source-editor', JSON.stringify({version:1,layout:'business-10',mode:'repeat',theme:'minimal',fit:'strict',card:{blocks:[{type:'title',text:literal}]}}));
  await page.click('#update-preview');
  await page.waitForFunction(text => document.querySelector('.card h1')?.textContent === text, literal);
  assert.equal(await page.locator('.card h1').first().innerHTML(), '&lt;img src=x onerror=alert(1)&gt;&lt;b&gt;literal&lt;/b&gt;');
  assert.equal(await page.locator('.card h1 img').count(), 0);

  const hostile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  await page.fill('#source-editor', JSON.stringify({version:1,layout:'business-10',mode:'repeat',theme:'minimal',fit:'strict',card:{blocks:[{type:'image',src:`data:image/svg+xml;base64,${hostile}`}]}}));
  await page.click('#update-preview');
  await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
  assert.match(await page.locator('#status').textContent(), /safe HTTPS URL or an image data URL/);
}));

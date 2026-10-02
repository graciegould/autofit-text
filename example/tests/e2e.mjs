import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5173/';
const HEADLESS = process.env.HEADLESS !== '0';

const results = [];
let total = 0;
let passed = 0;

function record(name, ok, detail = '') {
  total += 1;
  if (ok) passed += 1;
  results.push({ name, ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`${tag} — ${name}${detail ? `  (${detail})` : ''}`);
}

async function textMetrics(page) {
  return await page.locator('.frame > * > *').first().evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      fontSizePx: parseFloat(cs.fontSize),
      whiteSpace: cs.whiteSpace,
      transform: el.style.transform,
      text: el.textContent ?? '',
    };
  });
}

async function settle(page, ms = 450) {
  // Editor debounce (250ms) + two rAFs for the scheduled fit, then a tick.
  await page.waitForTimeout(ms);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))))
  );
  await page.waitForTimeout(50);
}

async function run() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', (err) => {
    console.error('PAGE ERROR:', err.message);
    record('no page errors', false, err.message);
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('.sandbox-editor');
  await page.waitForSelector('.frame');
  await settle(page, 300);

  const editor = page.locator('.sandbox-editor');
  const presets = page.locator('.sandbox-presets .preset');

  // 1. Default preset renders fill mode
  {
    const m = await textMetrics(page);
    record('default preset renders AUTOFIT', m.text.trim() === 'AUTOFIT', `text="${m.text.trim()}"`);
    record('default fill mode applies scale()', /scale\(/.test(m.transform), m.transform || '(empty)');
  }

  // 2. Editing the code re-renders
  await editor.fill('<AutofitText mode="fit" maxFontSize={24}>HELLO</AutofitText>');
  await settle(page);
  {
    const m = await textMetrics(page);
    record('edited code renders new text', m.text.trim() === 'HELLO', `text="${m.text.trim()}"`);
    record('edited code applies maxFontSize cap', m.fontSizePx <= 24.6, `fontSize=${m.fontSizePx}`);
    record('fit mode has no scale transform', !/scale\(/.test(m.transform), m.transform || '(empty)');
  }

  // 3. Invalid code shows an error and keeps the last good render
  await editor.fill('<AutofitText mode="fit">BROKEN<');
  await settle(page);
  {
    const errorVisible = await page.locator('.sandbox-error').isVisible().catch(() => false);
    const m = await textMetrics(page);
    record('invalid code surfaces an error', errorVisible);
    record('invalid code keeps last good render', m.text.trim() === 'HELLO', `text="${m.text.trim()}"`);
  }

  // 4. Fixing the code clears the error
  await editor.fill('<AutofitText wrap>FIXED AGAIN</AutofitText>');
  await settle(page);
  {
    const errorVisible = await page.locator('.sandbox-error').isVisible().catch(() => false);
    const m = await textMetrics(page);
    record('valid code clears the error', !errorVisible);
    record('wrap renders with whiteSpace normal', m.whiteSpace === 'normal', m.whiteSpace);
  }

  // 5. Preset chips replace the editor content and render
  await presets.filter({ hasText: 'fill-width' }).click();
  await settle(page);
  {
    const code = await editor.inputValue();
    const m = await textMetrics(page);
    record('preset chip fills the editor', code.includes('mode="fill-width"'), code.split('\n')[0]);
    record('preset renders LOWER THIRD', m.text.trim() === 'LOWER THIRD', `text="${m.text.trim()}"`);
    record('fill-width stretches horizontally', /scale\(/.test(m.transform), m.transform || '(empty)');
  }

  // 5b. wrap still breaks lines when the surrounding CSS says nowrap
  //     (regression: restoring `text-wrap` wiped the `text-wrap-mode` that
  //     `white-space: normal` set, so an inherited nowrap won).
  for (const mode of ['fit', 'fill']) {
    await editor.fill(
      `<AutofitText mode="${mode}" wrap={{ on: 'word' }}>SOFTWARE DEVELOPMENT</AutofitText>`
    );
    const prev = await page.locator('.frame').evaluate((el) => {
      const was = { w: el.style.width, h: el.style.height };
      el.style.whiteSpace = 'nowrap';
      el.style.width = '304px';
      el.style.height = '249px';
      return was;
    });
    await settle(page);
    const lines = await page.locator('.frame > * > *').first().evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      return tops.size;
    });
    record(`${mode} + wrap breaks lines under inherited nowrap`, lines > 1, `lines=${lines}`);
    await page.locator('.frame').evaluate((el, was) => {
      el.style.whiteSpace = '';
      el.style.width = was.w;
      el.style.height = was.h;
    }, prev);
  }

  // 5c. wrap.belowAspect wraps only when the box is narrow for its height,
  //     and on: 'each-word' puts every word on its own line.
  {
    const cases = [
      // [label, jsx, width, height, expect(lines)]
      ['belowAspect: tall box wraps', `wrap={{ belowAspect: 1.3, on: 'word' }}`, 304, 249, (n) => n > 1],
      ['belowAspect: wide box stays on one line', `wrap={{ belowAspect: 1.3, on: 'word' }}`, 600, 100, (n) => n === 1],
      ["each-word: one word per line", `wrap={{ on: 'each-word' }}`, 500, 300, (n) => n === 3],
      ["each-word + fill: one word per line", `mode="fill" wrap={{ on: 'each-word' }}`, 500, 300, (n) => n === 3],
      ["each-word + belowAspect: wide box stays on one line", `wrap={{ belowAspect: 1.3, on: 'each-word' }}`, 600, 100, (n) => n === 1],
    ];
    for (const [label, props, w, h, ok] of cases) {
      await editor.fill(`<AutofitText ${props}>BUILD GOOD SOFTWARE</AutofitText>`);
      const prev = await page.locator('.frame').evaluate((el, [w, h]) => {
        const was = { w: el.style.width, h: el.style.height };
        el.style.whiteSpace = 'nowrap';
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        return was;
      }, [w, h]);
      await settle(page);
      const { lines, inside } = await page.locator('.frame > * > *').first().evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        const a = el.getBoundingClientRect();
        const c = el.closest('.frame').getBoundingClientRect();
        const inside =
          a.left >= c.left - 1 && a.right <= c.right + 1 && a.top >= c.top - 1 && a.bottom <= c.bottom + 1;
        return { lines: tops.size, inside };
      });
      record(label, ok(lines) && inside, `lines=${lines} inside=${inside}`);
      await page.locator('.frame').evaluate((el, was) => {
        el.style.whiteSpace = '';
        el.style.width = was.w;
        el.style.height = was.h;
      }, prev);
    }
  }

  // 6. Resizing the box refits the text
  await presets.filter({ hasText: /^fill$/ }).click();
  await settle(page);
  {
    const before = await textMetrics(page);
    await page.locator('.frame').evaluate((el) => {
      el.style.width = '300px';
      el.style.height = '120px';
    });
    await settle(page);
    const after = await textMetrics(page);
    record(
      'resizing the box refits the text',
      after.fontSizePx !== before.fontSizePx || after.transform !== before.transform,
      `fontSize ${before.fontSizePx} → ${after.fontSizePx}`
    );
  }

  // 7. Edge-case demos render
  {
    const count = await page.locator('.edge-cases .demo').count();
    record('edge-case demos render', count === 6, `found=${count}`);
    const inset = await page
      .locator('.box--padded')
      .evaluate((el) => el.textContent?.trim() ?? '');
    record('padded edge case renders INSET', inset === 'INSET', `text="${inset}"`);
  }

  console.log('');
  console.log(`Summary: ${passed}/${total} passed`);

  await browser.close();

  if (passed !== total) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});

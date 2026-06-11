import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  alignOffset,
  captureInlineStyles,
  fitFontSize,
  getModeWarnings,
  resolveDimension,
  resolveWrap,
  restoreInlineStyles,
} from './internals';

describe('resolveDimension', () => {
  it('returns undefined for undefined / null / empty / NaN', () => {
    expect(resolveDimension(undefined)).toBeUndefined();
    expect(resolveDimension(null)).toBeUndefined();
    expect(resolveDimension('')).toBeUndefined();
    expect(resolveDimension('   ')).toBeUndefined();
    expect(resolveDimension(NaN)).toBeUndefined();
  });

  it('clamps numbers to >= 0', () => {
    expect(resolveDimension(120)).toBe(120);
    expect(resolveDimension(0)).toBe(0);
    expect(resolveDimension(-10)).toBe(0);
  });

  it('parses unitless and px strings', () => {
    expect(resolveDimension('200')).toBe(200);
    expect(resolveDimension('200px')).toBe(200);
    expect(resolveDimension('  48px  ')).toBe(48);
  });

  it('resolves percent against the provided reference', () => {
    expect(resolveDimension('50%', { reference: 400 })).toBe(200);
    expect(resolveDimension('100%', { reference: 600 })).toBe(600);
    expect(resolveDimension('25%', { reference: 80 })).toBe(20);
  });

  it('returns undefined for percent without a reference', () => {
    expect(resolveDimension('50%')).toBeUndefined();
  });

  it('resolves vw / vh / vmin / vmax against window size', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });

    expect(resolveDimension('10vw')).toBe(100);
    expect(resolveDimension('20vh')).toBe(100);
    expect(resolveDimension('10vmin')).toBe(50);
    expect(resolveDimension('10vmax')).toBe(100);
  });

  it('resolves rem against the document root font-size', () => {
    document.documentElement.style.fontSize = '20px';
    expect(resolveDimension('2rem')).toBe(40);
  });

  it('resolves em against the supplied element font-size', () => {
    const el = document.createElement('div');
    el.style.fontSize = '32px';
    document.body.appendChild(el);
    expect(resolveDimension('1.5em', { element: el })).toBe(48);
    el.remove();
  });

  it('prefers an explicit emBasePx over the element computed font-size', () => {
    const el = document.createElement('div');
    el.style.fontSize = '100px'; // simulates a font-size mutated by a previous fit pass
    document.body.appendChild(el);
    expect(resolveDimension('2em', { element: el, emBasePx: 16 })).toBe(32);
    el.remove();
  });

  it('returns undefined for unsupported units instead of treating them as px', () => {
    expect(resolveDimension('10pt')).toBeUndefined();
    expect(resolveDimension('2cm')).toBeUndefined();
    expect(resolveDimension('3ch')).toBeUndefined();
  });

  it('falls back gracefully on garbage input', () => {
    expect(resolveDimension('definitely not a length')).toBeUndefined();
    expect(resolveDimension('px')).toBeUndefined();
  });
});

describe('resolveWrap', () => {
  it('false / undefined → never wrap', () => {
    expect(resolveWrap(false, 600, 400)).toEqual({ breakWord: false, on: 'char' });
    expect(resolveWrap(undefined, 600, 400)).toEqual({ breakWord: false, on: 'char' });
  });

  it('true → always wrap with default char strategy', () => {
    expect(resolveWrap(true, 600, 400)).toEqual({ breakWord: true, on: 'char' });
  });

  it('object with no thresholds → always wrap, respects `on`', () => {
    expect(resolveWrap({ on: 'word' }, 600, 400)).toEqual({ breakWord: true, on: 'word' });
    expect(resolveWrap({}, 600, 400)).toEqual({ breakWord: true, on: 'char' });
  });

  it('belowWidth triggers when parent width is at or below threshold', () => {
    expect(resolveWrap({ belowWidth: 500 }, 400, undefined).breakWord).toBe(true);
    expect(resolveWrap({ belowWidth: 500 }, 500, undefined).breakWord).toBe(true);
    expect(resolveWrap({ belowWidth: 500 }, 501, undefined).breakWord).toBe(false);
  });

  it('belowHeight triggers when parent height is at or below threshold', () => {
    expect(resolveWrap({ belowHeight: 300 }, 800, 200).breakWord).toBe(true);
    expect(resolveWrap({ belowHeight: 300 }, 800, 300).breakWord).toBe(true);
    expect(resolveWrap({ belowHeight: 300 }, 800, 301).breakWord).toBe(false);
  });

  it('belowHeight without a parent height does not trigger', () => {
    expect(resolveWrap({ belowHeight: 300 }, 800, undefined).breakWord).toBe(false);
  });

  it('threshold form passes the chosen `on` through', () => {
    expect(resolveWrap({ belowWidth: 1000, on: 'word' }, 400, 400)).toEqual({
      breakWord: true,
      on: 'word',
    });
    expect(resolveWrap({ belowWidth: 1000, on: 'char' }, 400, 400)).toEqual({
      breakWord: true,
      on: 'char',
    });
  });

  it('either threshold hitting is enough', () => {
    expect(
      resolveWrap({ belowWidth: 500, belowHeight: 500 }, 800, 400).breakWord
    ).toBe(true);
    expect(
      resolveWrap({ belowWidth: 500, belowHeight: 500 }, 400, 800).breakWord
    ).toBe(true);
    expect(
      resolveWrap({ belowWidth: 500, belowHeight: 500 }, 800, 800).breakWord
    ).toBe(false);
  });
});

describe('window state isolation', () => {
  let originalW: number;
  let originalH: number;
  beforeEach(() => {
    originalW = window.innerWidth;
    originalH = window.innerHeight;
  });
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalW });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalH });
  });

  it('viewport units recompute when window changes', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    expect(resolveDimension('50vw')).toBe(400);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    expect(resolveDimension('50vw')).toBe(800);
  });
});

describe('alignOffset', () => {
  it('start alignments return 0', () => {
    expect(alignOffset(100, 'left')).toBe(0);
    expect(alignOffset(100, 'top')).toBe(0);
  });

  it('end alignments return the full free space', () => {
    expect(alignOffset(100, 'right')).toBe(100);
    expect(alignOffset(100, 'bottom')).toBe(100);
  });

  it('center (and undefined) splits the free space', () => {
    expect(alignOffset(100, 'center')).toBe(50);
    expect(alignOffset(100, undefined)).toBe(50);
  });
});

describe('getModeWarnings', () => {
  it('returns nothing for legal combos', () => {
    expect(getModeWarnings({ stretchX: false, stretchY: false, maxWidth: '50%' })).toEqual([]);
    expect(getModeWarnings({ stretchX: true, stretchY: true })).toEqual([]);
    expect(
      getModeWarnings({ stretchX: true, stretchY: false, maxHeight: 100, alignY: 'bottom' })
    ).toEqual([]);
  });

  it('warns when fill gets constraints or alignment', () => {
    const warnings = getModeWarnings({
      stretchX: true,
      stretchY: true,
      maxWidth: '50%',
      alignX: 'left',
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("mode 'fill'");
  });

  it('warns per-axis for partial stretch modes', () => {
    expect(
      getModeWarnings({ stretchX: true, stretchY: false, maxWidth: 100 })[0]
    ).toContain('fill-width');
    expect(
      getModeWarnings({ stretchX: false, stretchY: true, alignY: 'top' })[0]
    ).toContain('fill-height');
  });
});

describe('inline style snapshot / restore', () => {
  it('round-trips the styles the fit mutates', () => {
    const el = document.createElement('div');
    el.style.fontSize = '18px';
    el.style.letterSpacing = '0.1em';
    document.body.appendChild(el);

    const snapshot = captureInlineStyles(el);

    el.style.fontSize = '99px';
    el.style.whiteSpace = 'nowrap';
    el.style.position = 'absolute';
    el.style.top = '12px';
    el.style.textAlign = 'right';

    restoreInlineStyles(el, snapshot);

    expect(el.style.fontSize).toBe('18px');
    expect(el.style.letterSpacing).toBe('0.1em');
    expect(el.style.whiteSpace).toBe('');
    expect(el.style.position).toBe('');
    expect(el.style.top).toBe('');
    expect(el.style.textAlign).toBe('');
    el.remove();
  });
});

describe('fitFontSize', () => {
  const makeElement = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };

  it('returns the ceiling when it already fits', () => {
    const el = makeElement();
    const result = fitFontSize(el, 0.1, 48, () => true);
    expect(result).toEqual({ fits: true, fontSize: 48 });
    expect(el.style.fontSize).toBe('48px');
    el.remove();
  });

  it('converges on the largest size that fits', () => {
    const el = makeElement();
    const fits = () => parseFloat(el.style.fontSize) <= 30;
    const result = fitFontSize(el, 0.1, 100, fits);
    expect(result.fits).toBe(true);
    expect(result.fontSize).toBeGreaterThan(29);
    expect(result.fontSize).toBeLessThanOrEqual(30);
    el.remove();
  });

  it('treats the floor as soft: searches below it when even the floor overflows', () => {
    const el = makeElement();
    const fits = () => parseFloat(el.style.fontSize) <= 10;
    const result = fitFontSize(el, 20, 100, fits);
    expect(result.fits).toBe(true);
    expect(result.fontSize).toBeLessThanOrEqual(10);
    el.remove();
  });
});

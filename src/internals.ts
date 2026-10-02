import type { AlignX, AlignY, AutofitDimension, WrapOn, WrapOption } from './types';

/** Hard ceiling for the font-size search when no `maxFontSize` is given. */
export const MAX_FONT_SIZE_DEFAULT = 16384;
/** Hard floor for the font-size search. */
export const MIN_FONT_SIZE = 0.1;
/** Iterations of the binary search; 12 gives sub-pixel precision over the full range. */
export const BINARY_SEARCH_STEPS = 12;
/** Tolerance (px) when comparing measured size against a constraint. */
export const EPSILON = 0.5;

const LENGTH_PATTERN = /^-?\d*\.?\d+(?:[eE][+-]?\d+)?([a-z%]*)$/i;

/* ------------------------------------------------------------------ */
/* Dimension resolution                                                */
/* ------------------------------------------------------------------ */

export interface DimensionContext {
  /** Reference length (px) that `%` values resolve against. */
  reference?: number;
  /** Element whose computed font-size backs `em` resolution. */
  element?: HTMLElement | null;
  /**
   * Explicit base (in px) for resolving `em` values. Takes precedence over
   * reading the element's computed font-size, which the fit pass mutates.
   */
  emBasePx?: number;
}

/** Read an element's computed font-size in px, or `undefined` if unavailable. */
export function getFontSizePx(element: HTMLElement | null): number | undefined {
  if (!element) return undefined;
  const size = parseFloat(window.getComputedStyle(element).fontSize);
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

/**
 * Express the element's computed letter-spacing in `em` so it scales with the
 * fitted font-size. Returns `null` when letter-spacing is `normal` or unreadable.
 */
export function computeRelativeLetterSpacing(textElement: HTMLElement): string | null {
  const computed = window.getComputedStyle(textElement);
  if (computed.letterSpacing === 'normal') return null;
  const spacing = parseFloat(computed.letterSpacing);
  const fontSize = parseFloat(computed.fontSize);
  if (!Number.isFinite(spacing) || !Number.isFinite(fontSize) || fontSize <= 0) return null;
  return `${spacing / fontSize}em`;
}

/**
 * Resolve a user-supplied dimension (`120`, `'50%'`, `'2em'`, `'10vw'`, …) to
 * px. Returns `undefined` for missing values, unresolvable contexts (e.g. `%`
 * with no reference), and unsupported units — never a silently wrong number.
 */
export function resolveDimension(
  value: AutofitDimension,
  context: DimensionContext = {}
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && !Number.isNaN(value)) return Math.max(value, 0);
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.endsWith('%')) {
    if (context.reference === undefined) return undefined;
    const percent = parseFloat(trimmed.slice(0, -1));
    if (Number.isNaN(percent)) return undefined;
    return Math.max(context.reference * (percent / 100), 0);
  }

  const match = trimmed.match(LENGTH_PATTERN);
  if (!match) return undefined;

  const numeric = parseFloat(trimmed);
  if (!Number.isFinite(numeric)) return undefined;

  const unit = match[1]?.toLowerCase() ?? 'px';
  switch (unit) {
    case '':
    case 'px':
      return Math.max(numeric, 0);
    case 'vw':
      return Math.max((window.innerWidth * numeric) / 100, 0);
    case 'vh':
      return Math.max((window.innerHeight * numeric) / 100, 0);
    case 'vmin':
      return Math.max((Math.min(window.innerWidth, window.innerHeight) * numeric) / 100, 0);
    case 'vmax':
      return Math.max((Math.max(window.innerWidth, window.innerHeight) * numeric) / 100, 0);
    case 'rem': {
      const base = getFontSizePx(window.document?.documentElement ?? null);
      return base ? Math.max(base * numeric, 0) : undefined;
    }
    case 'em': {
      const base =
        context.emBasePx ??
        getFontSizePx(context.element ?? null) ??
        getFontSizePx(context.element?.parentElement ?? window.document?.documentElement ?? null);
      return base ? Math.max(base * numeric, 0) : undefined;
    }
    default:
      // Unsupported unit (pt, cm, ch, …): ignore the option rather than
      // silently treating the number as px.
      return undefined;
  }
}

/**
 * Measure the content box of `element` along one axis — the space actually
 * available to the text. Prefers client dimensions (unaffected by ancestor
 * transforms) minus padding; falls back to the bounding rect minus borders
 * and padding for elements without client dimensions.
 */
export function getParentDimension(
  element: HTMLElement,
  axis: 'width' | 'height'
): number | undefined {
  const computed = window.getComputedStyle(element);
  const padStart = parseFloat(axis === 'width' ? computed.paddingLeft : computed.paddingTop) || 0;
  const padEnd = parseFloat(axis === 'width' ? computed.paddingRight : computed.paddingBottom) || 0;

  const client = axis === 'width' ? element.clientWidth : element.clientHeight;
  if (client > 0) {
    const content = client - padStart - padEnd;
    return content > 0 ? content : undefined;
  }

  const rect = element.getBoundingClientRect();
  const rectValue = axis === 'width' ? rect.width : rect.height;
  if (rectValue > 0) {
    const borderStart =
      parseFloat(axis === 'width' ? computed.borderLeftWidth : computed.borderTopWidth) || 0;
    const borderEnd =
      parseFloat(axis === 'width' ? computed.borderRightWidth : computed.borderBottomWidth) || 0;
    const content = rectValue - borderStart - borderEnd - padStart - padEnd;
    return content > 0 ? content : undefined;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Wrapping                                                            */
/* ------------------------------------------------------------------ */

/** Decide whether wrapping is active for the current parent size, and on what boundary. */
export function resolveWrap(
  wrap: WrapOption | undefined,
  parentWidth: number,
  parentHeight: number | undefined
): { breakWord: boolean; on: WrapOn } {
  if (wrap === undefined || wrap === false) return { breakWord: false, on: 'char' };
  if (wrap === true) return { breakWord: true, on: 'char' };
  const { belowWidth, belowHeight, belowAspect, on = 'char' } = wrap;
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const hasHeight = typeof parentHeight === 'number' && parentHeight > 0;
  if (!isNum(belowWidth) && !isNum(belowHeight) && !isNum(belowAspect)) {
    return { breakWord: true, on };
  }
  const wHit = isNum(belowWidth) && parentWidth <= belowWidth;
  const hHit = isNum(belowHeight) && hasHeight && (parentHeight as number) <= belowHeight;
  const aHit =
    isNum(belowAspect) && hasHeight && parentWidth / (parentHeight as number) <= belowAspect;
  return { breakWord: wHit || hHit || aHit, on };
}

/**
 * Apply the line-breaking styles for the resolved wrap state. With `on: 'word'`
 * overflow-wrap stays `normal` rather than `break-word`: a mid-word break would
 * read as "fits" to the search, which would then keep the font too large and
 * split the word — an overflowing scrollWidth shrinks it instead.
 */
export function applyWrapStyles(
  element: HTMLElement,
  breakWord: boolean,
  on: WrapOn,
  initial: StyleSnapshot
): void {
  element.style.whiteSpace = breakWord ? 'normal' : 'nowrap';
  if (breakWord) {
    if (on === 'word' || on === 'each-word') {
      element.style.wordBreak = 'keep-all';
      element.style.overflowWrap = 'normal';
    } else {
      element.style.wordBreak = 'normal';
      element.style.overflowWrap = 'anywhere';
    }
    restoreInlineStyle(element, initial, 'display');
    // Inline boxes report scrollWidth/scrollHeight as 0, which would collapse
    // the fit — promote them to block while measuring.
    if (window.getComputedStyle(element).display === 'inline') {
      element.style.display = 'block';
    }
    restoreInlineStyle(element, initial, 'width');
    restoreInlineStyle(element, initial, 'hyphens');
    restoreInlineStyle(element, initial, 'text-wrap');
    // `white-space` and `text-wrap` are both shorthands for `text-wrap-mode`,
    // so restoring `text-wrap` above wipes the `wrap` that `white-space:
    // normal` just set — letting an inherited or class `white-space: nowrap`
    // win and silently disabling wrap. Pin the longhand last.
    element.style.setProperty('text-wrap-mode', 'wrap');
    // One word per line: shrink-wrap the box to its widest word, so every
    // space becomes a break. Words stay whole (keep-all / overflow-wrap
    // normal above), so a long word shrinks the font rather than splitting.
    if (on === 'each-word') element.style.width = 'min-content';
  } else {
    element.style.wordBreak = 'keep-all';
    element.style.overflowWrap = 'normal';
    element.style.display = 'inline-block';
    element.style.width = 'auto';
    element.style.hyphens = 'manual';
    element.style.setProperty('text-wrap', 'nowrap');
  }
}

/* ------------------------------------------------------------------ */
/* Inline style snapshot / restore                                     */
/* ------------------------------------------------------------------ */

/** Every inline style property the hook may write during a fit. */
const MANAGED_STYLE_PROPS = [
  'font-size',
  'letter-spacing',
  'line-height',
  'transform',
  'transform-origin',
  'white-space',
  'word-break',
  'overflow-wrap',
  'hyphens',
  'text-wrap',
  'text-wrap-mode',
  'text-box-trim',
  'text-box-edge',
  'text-align',
  'display',
  'width',
  'min-width',
  'position',
  'top',
  'left',
] as const;

export type StyleSnapshot = Partial<Record<(typeof MANAGED_STYLE_PROPS)[number], string>>;

/* ------------------------------------------------------------------ */
/* Justified word lines                                                */
/* ------------------------------------------------------------------ */

/** Attribute marking the per-word elements that `wrap.justify` scales. */
export const WORD_ATTRIBUTE = 'data-autofit-word';

/** The text element's direct children marked as words, in order. */
export function getWordElements(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute(WORD_ATTRIBUTE)
  );
}

/** Undo the per-line layout/scale applied for `wrap.justify`. */
export function resetWordElements(words: HTMLElement[]): void {
  for (const word of words) {
    for (const prop of ['display', 'width', 'transform', 'transform-origin', 'text-box']) {
      word.style.removeProperty(prop);
    }
  }
}

/** Snapshot the element's own inline values for every property the fit may touch. */
export function captureInlineStyles(element: HTMLElement): StyleSnapshot {
  const snapshot: StyleSnapshot = {};
  for (const prop of MANAGED_STYLE_PROPS) {
    snapshot[prop] = element.style.getPropertyValue(prop);
  }
  return snapshot;
}

/** Restore a single property from the snapshot (removing it if it was unset). */
export function restoreInlineStyle(
  element: HTMLElement,
  snapshot: StyleSnapshot,
  property: keyof StyleSnapshot
): void {
  const value = snapshot[property];
  if (value) element.style.setProperty(property, value);
  else element.style.removeProperty(property);
}

/** Restore every managed property to its snapshotted inline value. */
export function restoreInlineStyles(element: HTMLElement, snapshot: StyleSnapshot): void {
  for (const prop of MANAGED_STYLE_PROPS) {
    restoreInlineStyle(element, snapshot, prop);
  }
}

/* ------------------------------------------------------------------ */
/* Font-size search                                                    */
/* ------------------------------------------------------------------ */

export interface FitSearchResult {
  /** The chosen font-size in px (already applied to the element). */
  fontSize: number;
  /** Whether the text fits the constraints at that size. */
  fits: boolean;
}

/**
 * Binary-search the largest font-size in `[minFontSize, maxFontSize]` for
 * which `fits()` reports true, writing candidate sizes to the element as it
 * goes. `minFontSize` is a soft floor: when even the floor overflows, the
 * search drops below it rather than let the text spill out of the box.
 */
export function fitFontSize(
  element: HTMLElement,
  minFontSize: number,
  maxFontSize: number,
  fits: () => boolean
): FitSearchResult {
  const run = (minBound: number): FitSearchResult => {
    let low = Math.max(MIN_FONT_SIZE, minBound);
    let high = Math.max(maxFontSize, MIN_FONT_SIZE);
    if (high < low) [low, high] = [high, low];

    // The search converges toward `high` from below but never reaches it, so
    // text that fits exactly at maxFontSize would land just under. Probe the
    // ceiling first; if it fits, the search is unnecessary.
    element.style.fontSize = `${high}px`;
    if (fits()) return { fits: true, fontSize: high };

    for (let i = 0; i < BINARY_SEARCH_STEPS; i += 1) {
      const mid = (low + high) / 2;
      element.style.fontSize = `${mid}px`;
      if (fits()) low = mid;
      else high = mid;
    }

    const finalFontSize = Math.max(low, MIN_FONT_SIZE);
    element.style.fontSize = `${finalFontSize}px`;
    return { fits: fits(), fontSize: finalFontSize };
  };

  const primary = run(minFontSize);
  if (primary.fits || minFontSize <= MIN_FONT_SIZE + EPSILON) return primary;
  return run(MIN_FONT_SIZE);
}

/* ------------------------------------------------------------------ */
/* Alignment                                                           */
/* ------------------------------------------------------------------ */

/** Offset of the fitted text within `freeSpace` for the given alignment (default center). */
export function alignOffset(freeSpace: number, align: AlignX | AlignY | undefined): number {
  if (align === 'left' || align === 'top') return 0;
  if (align === 'right' || align === 'bottom') return freeSpace;
  return freeSpace / 2;
}

/* ------------------------------------------------------------------ */
/* Mode validation                                                     */
/* ------------------------------------------------------------------ */

export interface ModeWarningInput {
  stretchX: boolean;
  stretchY: boolean;
  alignX?: AlignX;
  alignY?: AlignY;
  maxWidth?: AutofitDimension;
  maxHeight?: AutofitDimension;
  minFontSize?: AutofitDimension;
  maxFontSize?: AutofitDimension;
}

/**
 * A stretched axis always reaches the full box, so constraints and alignment
 * on it are contradictory. Returns the warnings to log (the offending options
 * are ignored by the caller).
 */
export function getModeWarnings({
  stretchX,
  stretchY,
  alignX,
  alignY,
  maxWidth,
  maxHeight,
  minFontSize,
  maxFontSize,
}: ModeWarningInput): string[] {
  const warnings: string[] = [];
  if (stretchX && stretchY) {
    if (minFontSize != null || maxFontSize != null || maxWidth != null || maxHeight != null) {
      warnings.push(
        "[autofit-text] mode 'fill' stretches to the full box: minFontSize, maxFontSize, maxWidth and maxHeight are ignored. Use 'fill-width' or 'fill-height' to keep constraints on the other axis."
      );
    }
    if (alignX != null || alignY != null) {
      warnings.push(
        "[autofit-text] mode 'fill' stretches both axes: alignX and alignY are ignored."
      );
    }
    return warnings;
  }
  if (stretchX && maxWidth != null) {
    warnings.push(
      "[autofit-text] mode 'fill-width' always stretches to the full width: maxWidth is ignored."
    );
  }
  if (stretchX && alignX != null) {
    warnings.push(
      "[autofit-text] mode 'fill-width' stretches the width edge-to-edge: alignX is ignored."
    );
  }
  if (stretchY && maxHeight != null) {
    warnings.push(
      "[autofit-text] mode 'fill-height' always stretches to the full height: maxHeight is ignored."
    );
  }
  if (stretchY && alignY != null) {
    warnings.push(
      "[autofit-text] mode 'fill-height' stretches the height edge-to-edge: alignY is ignored."
    );
  }
  return warnings;
}

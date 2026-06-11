import type { CSSProperties, JSX, ReactNode } from 'react';

/**
 * A length the fit accepts: a number (px) or a CSS-like string with `px`, `%`,
 * `em`, `rem`, `vw`, `vh`, `vmin`, or `vmax`. `null`/`undefined` mean unset.
 */
export type AutofitDimension = number | string | null | undefined;

/**
 * How the fitted text fills its box. `'fit'` scales uniformly; the `fill`
 * variants stretch one or both axes edge-to-edge.
 */
export type FitMode = 'fit' | 'fill' | 'fill-width' | 'fill-height';

/** Horizontal placement of the fitted text within its box. */
export type AlignX = 'left' | 'center' | 'right';

/** Vertical placement of the fitted text within its box. */
export type AlignY = 'top' | 'center' | 'bottom';

/** Wrapping behavior: never (`false`), always (`true`), or below a size threshold. */
export type WrapOption =
  | boolean
  | {
      /** Wrap when the parent's width is ≤ this many px */
      belowWidth?: number;
      /** Wrap when the parent's height is ≤ this many px */
      belowHeight?: number;
      /** Where breaks may occur once wrapping kicks in (default 'char') */
      on?: 'word' | 'char';
    };

export interface AutofitInfo {
  /** The final font-size in px after the fit completed. */
  fontSize: number;
  /** Horizontal scale applied when the width is stretched (`'fill'` / `'fill-width'`); 1 otherwise. */
  scaleX: number;
  /** Vertical scale applied when the height is stretched (`'fill'` / `'fill-height'`); 1 otherwise. */
  scaleY: number;
  /** Whether the text actually fit within the constraints. */
  fits: boolean;
}

export interface UseAutofitTextOptions {
  /**
   * Wrapping behavior.
   * - `false` (default): never wrap
   * - `true`: always wrap (break anywhere)
   * - `{ belowWidth, belowHeight, on }`: wrap when the parent is small enough
   *   (or always, if no thresholds are given), breaking on the chosen boundary.
   */
  wrap?: WrapOption;
  /**
   * How the fitted text fills the box. A stretched axis always reaches the
   * full box, so constraints on that axis are ignored (with a console
   * warning); the other axis keeps `fit` semantics and its constraints.
   * - `'fit'` (default): scale uniformly to fit; all constraints apply
   * - `'fill-width'`: always stretch to the full width; height is fitted
   *   (respects `maxHeight`, `minFontSize`, `maxFontSize`)
   * - `'fill-height'`: always stretch to the full height; width is fitted
   *   (respects `maxWidth`, `minFontSize`, `maxFontSize`)
   * - `'fill'`: stretch both axes edge-to-edge; `maxWidth`, `maxHeight`,
   *   `minFontSize` and `maxFontSize` are all ignored
   */
  mode?: FitMode;
  /**
   * Horizontal alignment of the fitted text within the box (`'center'` by
   * default). Only meaningful when the width is NOT stretched — i.e. `'fit'`
   * and `'fill-height'`; ignored (with a warning) in `'fill'`/`'fill-width'`.
   * In `'fit'`, passing it opts the text into hook-controlled positioning;
   * omit both align props to keep it in normal flow and align via your own CSS.
   */
  alignX?: AlignX;
  /**
   * Vertical alignment of the fitted text within the box (`'center'` by
   * default). Only meaningful when the height is NOT stretched — i.e. `'fit'`
   * and `'fill-width'`; ignored (with a warning) in `'fill'`/`'fill-height'`.
   */
  alignY?: AlignY;
  /** Cap the fitted width — accepts px, %, vw/vh, em, rem, or a unitless number (px). Ignored when the width is stretched. */
  maxWidth?: AutofitDimension;
  /** Cap the fitted height — accepts px, %, vw/vh, em, rem, or a unitless number (px). Ignored when the height is stretched. */
  maxHeight?: AutofitDimension;
  /**
   * Soft lower bound for the fitted font-size: it wins while the floor still
   * fits, but the text shrinks past it rather than overflow the box.
   * Ignored in `mode: 'fill'`.
   */
  minFontSize?: AutofitDimension;
  /** Upper bound for the fitted font-size. Ignored in `mode: 'fill'`. */
  maxFontSize?: AutofitDimension;
  /** Called after each fit pass with the resulting font-size and scale. */
  onFit?: (info: AutofitInfo) => void;
  /**
   * When `false`, suspend fitting and detach observers. Existing inline
   * styles are restored. Defaults to `true`.
   */
  enabled?: boolean;
}

export interface AutofitTextHandle {
  /**
   * Force a refit (scheduled on the next animation frame).
   * No-op before the elements mount or while `enabled` is `false`.
   */
  refit: () => void;
}

export interface AutofitTextProps extends UseAutofitTextOptions {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Element type for the inner text node. Defaults to 'div'. */
  as?: keyof JSX.IntrinsicElements;
}

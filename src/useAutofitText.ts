import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type DependencyList,
  type RefObject,
} from 'react';
import type { AutofitTextHandle, UseAutofitTextOptions, WrapOption } from './types';
import {
  MAX_FONT_SIZE_DEFAULT,
  MIN_FONT_SIZE,
  EPSILON,
  alignOffset,
  applyWrapStyles,
  captureInlineStyles,
  computeRelativeLetterSpacing,
  fitFontSize,
  getFontSizePx,
  getModeWarnings,
  getParentDimension,
  resolveDimension,
  resolveWrap,
  restoreInlineStyle,
  restoreInlineStyles,
} from './internals';

/** `useLayoutEffect` on the client, `useEffect` during SSR (avoids the React warning). */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Fit the text inside `textRef` to its container.
 *
 * The container is `parentRef` when given, otherwise the text element's
 * parent. Refits automatically on container resize, content change, and web
 * font load; all inline styles it writes are restored on cleanup.
 */
export function useAutofitText(
  textRef: RefObject<HTMLElement | null>,
  parentRef?: RefObject<HTMLElement | null> | null,
  {
    wrap = false,
    mode = 'fit',
    alignX,
    alignY,
    maxWidth,
    maxHeight,
    minFontSize,
    maxFontSize,
    onFit,
    enabled = true,
  }: UseAutofitTextOptions = {},
  deps: DependencyList = []
): AutofitTextHandle {
  const stretchX = mode === 'fill' || mode === 'fill-width';
  const stretchY = mode === 'fill' || mode === 'fill-height';
  const stretched = stretchX || stretchY;
  // Alignment requires the hook to own the text's position. Stretch modes
  // already do; plain 'fit' stays in normal flow (user CSS aligns it) unless
  // an alignment prop opts in.
  const positioned = stretched || alignX != null || alignY != null;

  // Destructure wrap into primitives so a fresh object literal per render
  // doesn't churn the effect; same values → same deps.
  const wrapBool = typeof wrap === 'boolean' ? wrap : null;
  const wrapBelowWidth = wrap && typeof wrap === 'object' ? wrap.belowWidth : undefined;
  const wrapBelowHeight = wrap && typeof wrap === 'object' ? wrap.belowHeight : undefined;
  const wrapOn = wrap && typeof wrap === 'object' ? wrap.on : undefined;

  // Hold the latest scheduleFit so the imperative handle can call it
  // even after the effect has re-run.
  const scheduleRef = useRef<(() => void) | null>(null);

  // Read onFit through a ref so an inline callback prop doesn't re-run the
  // whole effect (observer teardown + style restore) on every render.
  const onFitRef = useRef(onFit);
  useIsoLayoutEffect(() => {
    onFitRef.current = onFit;
  });

  // One warning per offending option combo, not one per effect re-run.
  const warnedComboRef = useRef<string | null>(null);

  const refit = useCallback(() => {
    scheduleRef.current?.();
  }, []);

  useIsoLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return;

    const textElement = textRef.current;
    const parentElement = parentRef?.current ?? textElement?.parentElement ?? null;
    if (!textElement || !parentElement) return;

    const warnings = getModeWarnings({
      stretchX,
      stretchY,
      alignX,
      alignY,
      maxWidth,
      maxHeight,
      minFontSize,
      maxFontSize,
    });
    const warnSignature = warnings.join('\n');
    if (warnSignature && warnedComboRef.current !== warnSignature) {
      warnedComboRef.current = warnSignature;
      warnings.forEach((warning) => console.warn(warning));
    } else if (!warnSignature) {
      warnedComboRef.current = null;
    }

    // Options that contradict the mode (the ones warned about) are dropped.
    const effMaxWidth = stretchX ? undefined : maxWidth;
    const effMaxHeight = stretchY ? undefined : maxHeight;
    const effMinFontSize = stretchX && stretchY ? undefined : minFontSize;
    const effMaxFontSize = stretchX && stretchY ? undefined : maxFontSize;
    const effAlignX = stretchX ? undefined : (alignX ?? 'center');
    const effAlignY = stretchY ? undefined : (alignY ?? 'center');

    const initialStyles = captureInlineStyles(textElement);
    const initialParentPosition = parentElement.style.position;
    // Em base for min/maxFontSize, captured before any fit pass mutates the
    // element's font-size — resolving against the live computed value would
    // drift on every refit.
    const preFitFontSizePx = getFontSizePx(textElement);

    let animationFrame: number | null = null;
    const cleanupFns: Array<() => void> = [];

    const scheduleFit = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;

        /* ----- 1. Measure the container and resolve constraints ----- */

        const parentWidth = getParentDimension(parentElement, 'width');
        if (!parentWidth || parentWidth <= 0) return;
        const parentHeight = getParentDimension(parentElement, 'height') ?? undefined;

        const widthConstraint = Math.max(
          resolveDimension(effMaxWidth, { reference: parentWidth, element: parentElement }) ??
            parentWidth,
          1
        );
        const heightLimit =
          resolveDimension(effMaxHeight, { reference: parentHeight, element: parentElement }) ??
          parentHeight ??
          Number.POSITIVE_INFINITY;
        const hasFiniteHeight = Number.isFinite(heightLimit);
        const heightConstraint = hasFiniteHeight ? Math.max(heightLimit, 1) : heightLimit;

        /* ----- 2. Apply wrapping and layout styles ----- */

        const wrapInput: WrapOption =
          wrapBool !== null
            ? wrapBool
            : { belowWidth: wrapBelowWidth, belowHeight: wrapBelowHeight, on: wrapOn };
        const { breakWord, on } = resolveWrap(wrapInput, parentWidth, parentHeight);
        applyWrapStyles(textElement, breakWord, on, initialStyles);

        let padTop = 0;
        let padLeft = 0;
        if (positioned) {
          // Pin the text to the parent's content box so the post-fit pass can
          // place it (alignment) or scale it edge-to-edge (stretch). Absolute
          // offsets resolve against the padding box, so offset by the padding.
          const parentComputed = window.getComputedStyle(parentElement);
          if (parentComputed.position === 'static') {
            parentElement.style.position = 'relative';
          }
          padTop = parseFloat(parentComputed.paddingTop) || 0;
          padLeft = parseFloat(parentComputed.paddingLeft) || 0;
          textElement.style.position = 'absolute';
          textElement.style.top = `${padTop}px`;
          textElement.style.left = `${padLeft}px`;
          textElement.style.removeProperty('min-width');
          // Wrapped lines should follow the horizontal alignment too.
          if (effAlignX) textElement.style.textAlign = effAlignX;
        } else {
          textElement.style.minWidth = '50%';
        }

        if (stretched) {
          // "Edge-to-edge" should mean the glyph ink, not the line box.
          // Inherited letter-spacing and leading would stretch as empty bands,
          // so neutralize both and trim the remaining ascent/descent where
          // text-box-trim is supported.
          textElement.style.letterSpacing = '0px';
          textElement.style.lineHeight = '1';
          textElement.style.setProperty('text-box-trim', 'trim-both');
          textElement.style.setProperty('text-box-edge', 'cap alphabetic');
        } else {
          const relativeSpacing = computeRelativeLetterSpacing(textElement);
          if (relativeSpacing) textElement.style.letterSpacing = relativeSpacing;
          else restoreInlineStyle(textElement, initialStyles, 'letter-spacing');
          restoreInlineStyle(textElement, initialStyles, 'line-height');
          restoreInlineStyle(textElement, initialStyles, 'text-box-trim');
          restoreInlineStyle(textElement, initialStyles, 'text-box-edge');
          restoreInlineStyle(textElement, initialStyles, 'transform');
          restoreInlineStyle(textElement, initialStyles, 'transform-origin');
        }

        /* ----- 3. Search for the font size ----- */

        const minFont =
          resolveDimension(effMinFontSize, { element: textElement, emBasePx: preFitFontSizePx }) ??
          MIN_FONT_SIZE;
        const maxFont =
          resolveDimension(effMaxFontSize, { element: textElement, emBasePx: preFitFontSizePx }) ??
          MAX_FONT_SIZE_DEFAULT;

        // A stretched axis is mapped by the final scale, so the search frees
        // it — unless both axes stretch (the scale needs a fit-sized start)
        // or the fitted axis is unbounded (nothing else limits the font).
        const enforceWidth = !stretchX || stretchY || !hasFiniteHeight;
        const enforceHeight = hasFiniteHeight && (!stretchY || stretchX);
        const fits = () => {
          const widthFits =
            !enforceWidth || textElement.scrollWidth <= widthConstraint + EPSILON;
          const heightFits =
            !enforceHeight || textElement.scrollHeight <= heightConstraint + EPSILON;
          return widthFits && heightFits;
        };
        const result = fitFontSize(textElement, minFont, maxFont, fits);

        /* ----- 4. Place and scale ----- */

        let scaleX = 1;
        let scaleY = 1;
        if (positioned) {
          const currentWidth = Math.max(textElement.scrollWidth, 1);
          // offsetHeight, not scrollHeight: only the former reflects
          // text-box-trim, and the scale must map the trimmed box.
          const currentHeight = Math.max(textElement.offsetHeight, 1);
          scaleX = stretchX ? widthConstraint / currentWidth : 1;
          scaleY = stretchY && hasFiniteHeight ? heightConstraint / currentHeight : 1;
          // Non-stretched axes align within the parent's content box — the
          // full box, not the max* constraint.
          if (!stretchX) {
            const freeX = Math.max(parentWidth - currentWidth * scaleX, 0);
            textElement.style.left = `${padLeft + alignOffset(freeX, effAlignX)}px`;
          }
          if (!stretchY && parentHeight !== undefined) {
            const freeY = Math.max(parentHeight - currentHeight * scaleY, 0);
            textElement.style.top = `${padTop + alignOffset(freeY, effAlignY)}px`;
          }
          if (stretched) {
            textElement.style.transformOrigin = '0 0';
            textElement.style.transform = `scale(${scaleX}, ${scaleY})`;
          }
        }

        onFitRef.current?.({ fontSize: result.fontSize, scaleX, scaleY, fits: result.fits });
      });
    };

    scheduleRef.current = scheduleFit;

    /* ----- Observers: refit on resize, content change, and font load ----- */

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(parentElement);
      cleanupFns.push(() => resizeObserver.disconnect());
    } else {
      window.addEventListener('resize', scheduleFit);
      cleanupFns.push(() => window.removeEventListener('resize', scheduleFit));
    }

    const mutationObserver = new MutationObserver(scheduleFit);
    mutationObserver.observe(textElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    cleanupFns.push(() => mutationObserver.disconnect());

    // Web fonts change text metrics after the initial fit — refit when they
    // land. `loadingdone` catches later loads; `ready` catches fonts already
    // in flight at mount (guarded, since the promise can outlive the effect).
    let disposed = false;
    cleanupFns.push(() => {
      disposed = true;
    });
    const fonts: FontFaceSet | undefined = window.document?.fonts;
    if (fonts) {
      const onFontsLoaded = () => scheduleFit();
      fonts.addEventListener('loadingdone', onFontsLoaded);
      cleanupFns.push(() => fonts.removeEventListener('loadingdone', onFontsLoaded));
      fonts.ready.then(() => {
        if (!disposed) scheduleFit();
      });
    }

    scheduleFit();

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      cleanupFns.forEach((fn) => fn());
      scheduleRef.current = null;
      restoreInlineStyles(textElement, initialStyles);
      parentElement.style.position = initialParentPosition;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    textRef,
    parentRef,
    wrapBool,
    wrapBelowWidth,
    wrapBelowHeight,
    wrapOn,
    stretchX,
    stretchY,
    alignX,
    alignY,
    maxWidth,
    maxHeight,
    minFontSize,
    maxFontSize,
    enabled,
    ...deps,
  ]);

  return { refit };
}

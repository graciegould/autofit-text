import {
  Fragment,
  forwardRef,
  useCallback,
  useRef,
  type CSSProperties,
  type ElementType,
  type MutableRefObject,
} from 'react';
import { WORD_ATTRIBUTE } from './internals';
import type { AutofitTextProps } from './types';
import { useAutofitText } from './useAutofitText';

/**
 * The box that text auto-fits to.
 *
 * Size it directly via `style`/`className`, or let its default
 * `width/height: 100%` fill an already-sized parent. The forwarded ref points
 * at the container element. For full control over markup, use
 * {@link useAutofitText} instead.
 */
export const AutofitText = forwardRef<HTMLDivElement, AutofitTextProps>(function AutofitText(
  {
    children,
    className,
    style,
    wrap,
    mode,
    alignX,
    alignY,
    maxWidth,
    maxHeight,
    minFontSize,
    maxFontSize,
    onFit,
    enabled,
    as = 'div',
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLElement | null>(null);

  useAutofitText(textRef, containerRef, {
    wrap,
    mode,
    alignX,
    alignY,
    maxWidth,
    maxHeight,
    minFontSize,
    maxFontSize,
    onFit,
    enabled,
  });

  const Tag = as as ElementType;

  // wrap.justify scales each word's line separately, so plain-string
  // children are split into marked per-word spans (spaces kept between them
  // so the text still reads as one line when it isn't wrapping).
  const justify = typeof wrap === 'object' && wrap !== null && wrap.justify === true;
  const content =
    justify && typeof children === 'string'
      ? children
          .trim()
          .split(/\s+/)
          .map((word, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              <span {...{ [WORD_ATTRIBUTE]: '' }}>{word}</span>
            </Fragment>
          ))
      : children;

  const containerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    ...style,
  };

  // Stable identity so React doesn't detach/reattach the forwarded ref
  // (calling it with null, then the node) on every render.
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref]
  );

  return (
    <div ref={setRefs} style={containerStyle} className={className}>
      <Tag ref={textRef}>{content}</Tag>
    </div>
  );
});

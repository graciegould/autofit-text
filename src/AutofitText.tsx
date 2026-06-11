import {
  forwardRef,
  useCallback,
  useRef,
  type CSSProperties,
  type ElementType,
  type MutableRefObject,
} from 'react';
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
      <Tag ref={textRef}>{children}</Tag>
    </div>
  );
});

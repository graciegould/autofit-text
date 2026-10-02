# autofit-text

Auto-fit text to any container. A small React component and hook that scales — or stretches — text to its box, and keeps it fitted through resizes, content changes, and web font loads.

- Binary-search fitting with sub-pixel precision, no overflow
- Per-axis stretch modes for edge-to-edge display type
- Wrapping, alignment, and min/max bounds
- Zero dependencies, SSR-safe, restores every style it touches

## Install

```bash
npm install autofit-text
```

React 17+ is a peer dependency.

## Quick start

The rule is one sentence: **you give the box a size, the text fits to it.** `<AutofitText>` *is* the box — size it directly, or let its default `width/height: 100%` fill a parent you've already sized.

```tsx
import { AutofitText } from 'autofit-text';

<AutofitText style={{ width: 320, height: 120 }}>HELLO WORLD</AutofitText>;

// or fill an already-sized parent
<div style={{ width: 600, height: 200 }}>
  <AutofitText mode="fill">HELLO WORLD</AutofitText>
</div>;
```

The box must have a definite height — an auto-height parent gives the text nothing to fit vertically.

## Modes

Stretch is per-axis. A stretched axis always reaches the full box; the other axis keeps `fit` semantics and its constraints.

| Mode | Width | Height |
| --- | --- | --- |
| `fit` (default) | fitted | fitted |
| `fill-width` | stretched | fitted |
| `fill-height` | fitted | stretched |
| `fill` | stretched | stretched |

Options that constrain or align a stretched axis are contradictory, so they're ignored with a console warning: `fill-width` ignores `maxWidth` and `alignX`, `fill-height` ignores `maxHeight` and `alignY`, and `fill` ignores all sizing and alignment options.

Stretching maps the glyph ink — not the line box — edge-to-edge: the hook neutralizes letter-spacing and leading and applies `text-box-trim` where supported.

## Alignment

`alignX` (`'left' | 'center' | 'right'`) and `alignY` (`'top' | 'center' | 'bottom'`) place the fitted text within the box along any axis that isn't stretched. Both default to `'center'`.

```tsx
// photo-credit corner
<AutofitText maxFontSize={28} alignX="right" alignY="bottom">CREDIT</AutofitText>

// full-width lower third, pinned to the bottom
<AutofitText mode="fill-width" maxFontSize={32} alignY="bottom">BREAKING</AutofitText>
```

In `fit` mode the hook normally leaves positioning to your CSS; passing either align prop opts that element into hook-controlled positioning.

## Wrapping

```tsx
<AutofitText wrap>BREAK ANYWHERE</AutofitText>
<AutofitText wrap={{ on: 'word' }}>ONLY AT SPACES</AutofitText>
<AutofitText wrap={{ belowWidth: 400, on: 'word' }}>WRAP ONLY WHEN NARROW</AutofitText>
<AutofitText mode="fill" wrap={{ belowAspect: 1.3, on: 'each-word' }}>GRACIE GOULD</AutofitText>
```

- `false` (default) — single line, fitted
- `true` — always wrap, breaking anywhere
- `{ belowWidth?, belowHeight?, belowAspect?, on? }` — wrap once the container is at or below any threshold: `belowWidth` / `belowHeight` in px, `belowAspect` as width ÷ height (e.g. `1.3` wraps once the box is less than 1.3× as wide as tall; needs a definite height). Omit all thresholds to always wrap.
  - `on: 'char'` (default) breaks anywhere.
  - `on: 'word'` keeps words whole — an unbreakable word shrinks the font rather than splitting.
  - `on: 'each-word'` puts every word on its own line.

## Sizing constraints

`maxWidth`, `maxHeight`, `minFontSize`, and `maxFontSize` accept a number (px) or a string with `px`, `%`, `em`, `rem`, `vw`, `vh`, `vmin`, or `vmax`. Percentages resolve against the container's content box; `em` resolves against the element's font-size *before* fitting, so bounds stay stable across refits. Unsupported units are ignored rather than misread.

`minFontSize` is a soft floor: it wins while the floor still fits, but if even the floor overflows, the text shrinks past it rather than spill out of the box.

## Component props

| Prop | Type | Default |
| --- | --- | --- |
| `mode` | `'fit' \| 'fill' \| 'fill-width' \| 'fill-height'` | `'fit'` |
| `alignX` | `'left' \| 'center' \| 'right'` | `'center'` |
| `alignY` | `'top' \| 'center' \| 'bottom'` | `'center'` |
| `wrap` | `boolean \| { belowWidth?, belowHeight?, belowAspect?, on? }` | `false` |
| `maxWidth` / `maxHeight` | `number \| string` | — |
| `minFontSize` / `maxFontSize` | `number \| string` | — |
| `onFit` | `(info: AutofitInfo) => void` | — |
| `enabled` | `boolean` | `true` |
| `as` | `keyof JSX.IntrinsicElements` | `'div'` |
| `className`, `style` | applied to the container | — |

`onFit` fires after every fit pass with `{ fontSize, scaleX, scaleY, fits }`. `enabled: false` suspends fitting, detaches observers, and restores the element's original inline styles. The forwarded `ref` points at the container element.

## Hook

`useAutofitText` is the no-DOM escape hatch: your markup, zero injected elements.

```tsx
import { useRef } from 'react';
import { useAutofitText } from 'autofit-text';

function Banner() {
  const textRef = useRef<HTMLSpanElement>(null);
  const { refit } = useAutofitText(textRef, undefined, { mode: 'fill' });

  return (
    <div style={{ width: 600, height: 200 }}>
      <span ref={textRef}>HELLO WORLD</span>
    </div>
  );
}
```

```ts
function useAutofitText(
  textRef: RefObject<HTMLElement | null>,
  parentRef?: RefObject<HTMLElement | null> | null,
  options?: UseAutofitTextOptions, // same options as the component
  deps?: DependencyList,
): { refit: () => void };
```

- `parentRef` defaults to the text element's DOM parent; pass it explicitly to fit against a different ancestor.
- `deps` — extra values that should force a refit when they change.
- `refit()` schedules a fit on the next animation frame. No-op before mount or while `enabled` is `false`.

## How it works

1. The container's **content box** is measured (padding is never written over), and a binary search finds the largest font-size whose `scrollWidth`/`scrollHeight` fits the active constraints.
2. Stretch modes then pin the text to the content box and apply a non-uniform `scale()` so the stretched axes touch the edges exactly; fitted axes are aligned per `alignX`/`alignY`.
3. Refits run on container resize (`ResizeObserver`), content change (`MutationObserver`), and web font load (`document.fonts`).

## Development

```bash
npm test          # unit tests (vitest)
npm run example   # demo app with a live JSX sandbox
npm run build     # bundle (tsup)
```

## License

MIT

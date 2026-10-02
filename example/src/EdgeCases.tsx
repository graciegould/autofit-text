import { useRef, type ReactNode } from 'react';
import { AutofitText, useAutofitText } from 'autofit-text';

function HookStack() {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  useAutofitText(text, box, { mode: 'fill', wrap: { on: 'each-word', justify: true } });
  return (
    <div ref={box} className="box" style={{ width: 200, height: 160 }}>
      <div ref={text}>
        <span data-autofit-word>HOOK</span> <span data-autofit-word>STACKED</span>
      </div>
    </div>
  );
}

function Demo({
  label,
  note,
  snippet,
  children,
}: {
  label: string;
  note?: ReactNode;
  snippet?: string;
  children: ReactNode;
}) {
  return (
    <figure className="demo">
      <figcaption className="demo-label">{label}</figcaption>
      <div className="demo-stage">{children}</div>
      {note ? <p className="demo-note">{note}</p> : null}
      {snippet ? (
        <pre className="snippet">
          <code>{snippet.trim()}</code>
        </pre>
      ) : null}
    </figure>
  );
}

export function EdgeCases() {
  return (
    <section className="edge-cases">
      <h2>Edge cases</h2>
      <p className="edge-cases-lede">
        The corners where auto-fitting usually falls apart. Everything is measured against the
        content box — padding is never written over.
      </p>
      <div className="demo-grid">
        <Demo
          label="padded box"
          note="The ring is the parent's 24px padding. The fit respects it, in both fit and fill modes."
          snippet={`<div style={{ width: 300, height: 140, padding: 24 }}>
  <AutofitText mode="fill">INSET</AutofitText>
</div>`}
        >
          <div className="box box--padded" style={{ width: 300, height: 140 }}>
            <AutofitText mode="fill">INSET</AutofitText>
          </div>
        </Demo>

        <Demo
          label="unbreakable word + wrap"
          note="on: 'word' keeps the word whole, so the fit shrinks instead of splitting it."
          snippet={`<AutofitText wrap={{ on: 'word' }}>
  INCOMPREHENSIBILITIES
</AutofitText>`}
        >
          <div className="box" style={{ width: 220, height: 130 }}>
            <AutofitText wrap={{ on: 'word' }} className="fit-center">
              INCOMPREHENSIBILITIES
            </AutofitText>
          </div>
        </Demo>

        <Demo
          label="wrap inside a nowrap parent"
          note="An inherited white-space: nowrap no longer cancels wrap — the fit sets its own white-space."
          snippet={`<div style={{ whiteSpace: 'nowrap' }}>
  <AutofitText wrap={{ on: 'word' }}>STILL WRAPS HERE</AutofitText>
</div>`}
        >
          <div className="box" style={{ width: 200, height: 130, whiteSpace: 'nowrap' }}>
            <AutofitText wrap={{ on: 'word' }} className="fit-center">
              STILL WRAPS HERE
            </AutofitText>
          </div>
        </Demo>

        <Demo
          label="each-word + justify in a tall box"
          note="Every word gets its own line and spans the full width; in fill mode the lines split the height evenly."
          snippet={`<AutofitText mode="fill" wrap={{ on: 'each-word', justify: true }}>
  SOFTWARE DEVELOPMENT
</AutofitText>`}
        >
          <div className="box" style={{ width: 200, height: 160 }}>
            <AutofitText mode="fill" wrap={{ on: 'each-word', justify: true }}>
              SOFTWARE DEVELOPMENT
            </AutofitText>
          </div>
        </Demo>

        <Demo
          label="hook + data-autofit-word"
          note="With useAutofitText, mark each word's element with data-autofit-word for each-word / justify."
          snippet={`useAutofitText(textRef, boxRef, {
  mode: 'fill',
  wrap: { on: 'each-word', justify: true },
});
<div ref={textRef}>
  <span data-autofit-word>HOOK</span> <span data-autofit-word>STACKED</span>
</div>`}
        >
          <HookStack />
        </Demo>

        <Demo
          label="tiny box · 84 × 36"
          note="The search floor is 0.1px — it never gives up, never overflows."
          snippet={`<AutofitText>STILL FITS</AutofitText>`}
        >
          <div className="box" style={{ width: 84, height: 36 }}>
            <AutofitText className="fit-center">STILL FITS</AutofitText>
          </div>
        </Demo>

        <Demo
          label='as="span" · inline element'
          note="Inline boxes can't be measured, so the hook promotes them to block while fitting."
          snippet={`<AutofitText as="span" wrap>
  AN INLINE SPAN
</AutofitText>`}
        >
          <div className="box" style={{ width: 240, height: 130 }}>
            <AutofitText as="span" wrap className="fit-center">
              AN INLINE SPAN
            </AutofitText>
          </div>
        </Demo>

        <Demo
          label="rich children"
          note="Children are arbitrary React nodes; edits anywhere in the subtree refit automatically."
          snippet={`<AutofitText>
  MIXED <em>NODES</em> WORK
</AutofitText>`}
        >
          <div className="box" style={{ width: 300, height: 130 }}>
            <AutofitText className="fit-center">
              MIXED <em>NODES</em> WORK
            </AutofitText>
          </div>
        </Demo>

        <Demo
          label="a box with no height"
          note={
            <>
              <strong>Don't do this.</strong> An auto-height parent gives the text nothing to fit
              vertically — the box collapses to the text's own height. Always give the box a
              definite height.
            </>
          }
          snippet={`// height is auto — nothing to fit to
<div style={{ width: 260 }}>
  <AutofitText>NO HEIGHT</AutofitText>
</div>`}
        >
          <div className="box box--bad" style={{ width: 260 }}>
            <AutofitText className="fit-center">NO HEIGHT</AutofitText>
          </div>
        </Demo>
      </div>
    </section>
  );
}

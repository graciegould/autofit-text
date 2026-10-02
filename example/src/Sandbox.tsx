import {
  Component,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as React from 'react';
import { transform } from 'sucrase';
import { AutofitText, useAutofitText } from 'autofit-text';

/* ---------- compile a JSX expression with the library in scope ---------- */

function compile(source: string): ReactNode {
  const { code } = transform(`return (\n${source}\n);`, {
    transforms: ['jsx', 'typescript'],
    production: true,
  });
  const factory = new Function('React', 'AutofitText', 'useAutofitText', code);
  return factory(React, AutofitText, useAutofitText) as ReactNode;
}

/* ---------- error boundary: runtime errors keep the page alive ---------- */

class Boundary extends Component<
  { resetKey: string; onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* ---------- presets ---------- */

const PRESETS: Array<{ name: string; code: string }> = [
  {
    name: 'fill',
    code: `<AutofitText mode="fill">
  AUTOFIT
</AutofitText>`,
  },
  {
    name: 'fit + align',
    code: `<AutofitText alignX="right" alignY="bottom" maxFontSize={40}>
  BOTTOM RIGHT
</AutofitText>`,
  },
  {
    name: 'wrap',
    code: `<AutofitText wrap={{ on: 'word' }}>
  WRAP ON WORD BOUNDARIES
</AutofitText>`,
  },
  {
    name: 'wrap when narrow',
    code: `// drag the box narrower than 400px to wrap
<AutofitText wrap={{ belowWidth: 400, on: 'word' }}>
  WRAP ONLY WHEN NARROW
</AutofitText>`,
  },
  {
    name: 'stack each word',
    code: `// drag the box taller than it is wide-ish (< 1.3 : 1)
<AutofitText mode="fill" wrap={{ belowAspect: 1.3, on: 'each-word' }}>
  GRACIE GOULD
</AutofitText>`,
  },
  {
    name: 'stack + justify',
    code: `// every word spans the full width; the stack fills the height
<AutofitText
  mode="fill"
  wrap={{ belowAspect: 1.3, on: 'each-word', justify: true }}
>
  SOFTWARE DEVELOPMENT
</AutofitText>`,
  },
  {
    name: 'fill-width',
    code: `<AutofitText mode="fill-width" maxFontSize={48} alignY="bottom">
  LOWER THIRD
</AutofitText>`,
  },
  {
    name: 'onFit',
    code: `<AutofitText
  mode="fit"
  maxFontSize={120}
  onFit={(info) => console.log('fit:', info)}
>
  CHECK THE CONSOLE
</AutofitText>`,
  },
];

/* ---------- sandbox ---------- */

export function Sandbox() {
  const [code, setCode] = useState(PRESETS[0].code);
  const [rendered, setRendered] = useState<{ node: ReactNode; key: string }>(() => ({
    node: compile(PRESETS[0].code),
    key: PRESETS[0].code,
  }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const node = compile(code);
        setRendered({ node, key: code });
        setError(null);
      } catch (e) {
        // Keep the last good render on parse errors; just surface the message.
        setError((e as Error).message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [code]);

  const onEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart, selectionEnd, value } = el;
      setCode(value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd));
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2;
      });
    }
  };

  return (
    <section className="sandbox">
      <div className="sandbox-editor-pane">
        <div className="sandbox-presets" role="group" aria-label="presets">
          {PRESETS.map((p) => (
            <button key={p.name} className="preset" onClick={() => setCode(p.code)}>
              {p.name}
            </button>
          ))}
        </div>
        <textarea
          className="sandbox-editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onEditorKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="JSX editor"
        />
        {error ? <p className="sandbox-error">{error}</p> : null}
        <p className="sandbox-hint">
          In scope: <code>{'<AutofitText>'}</code>, <code>useAutofitText</code>, <code>React</code>.
          Props: <code>mode</code> (<code>fit · fill · fill-width · fill-height</code>),{' '}
          <code>wrap</code> (<code>true</code> or{' '}
          <code>{'{ belowWidth, belowHeight, belowAspect, on, justify }'}</code>, <code>on</code>:{' '}
          <code>char · word · each-word</code>), <code>alignX</code>/<code>alignY</code>, <code>minFontSize</code>/
          <code>maxFontSize</code>, <code>maxWidth</code>/<code>maxHeight</code>, <code>onFit</code>,{' '}
          <code>enabled</code>, <code>as</code>.
        </p>
      </div>

      <div className="sandbox-stage-pane">
        <div className="frame" style={{ width: 560, height: 220 }}>
          <Boundary resetKey={rendered.key} onError={setError}>
            {rendered.node}
          </Boundary>
        </div>
        <p className="sandbox-stage-hint">
          the box — drag the corner <span className="drag-hint">⤡</span>
        </p>
      </div>
    </section>
  );
}

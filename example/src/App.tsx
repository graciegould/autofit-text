import { Sandbox } from './Sandbox';
import { EdgeCases } from './EdgeCases';

export function App() {
  return (
    <main className="page">
      <header className="masthead">
        <h1>autofit-text</h1>
        <span className="masthead-tag">edit the code, the text fits the box</span>
        <code className="masthead-install">npm i autofit-text</code>
      </header>

      <Sandbox />

      <EdgeCases />

      <footer className="colophon">
        <span>autofit-text · MIT</span>
      </footer>
    </main>
  );
}

import { Link, NavLink } from 'react-router-dom';
import type { PropsWithChildren } from 'react';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-senate-gold/20 text-senate-gold'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
  }`;

export default function App({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🏛️</span>
            <span className="font-display text-xl font-bold text-senate-gold tracking-wider">
              SENATUM
            </span>
          </Link>
          <nav className="flex items-center gap-1 ml-6">
            <NavLink to="/decisions" className={navClass}>Decisions</NavLink>
            <NavLink to="/requests/new" className={navClass}>New request</NavLink>
            <NavLink to="/configuration" className={navClass}>Configuration</NavLink>
          </nav>
          <span className="ml-auto text-xs text-zinc-500">
            Princeps Senatus is watching.
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
        Senatum — open-source multi-LLM deliberation platform.
      </footer>
    </div>
  );
}

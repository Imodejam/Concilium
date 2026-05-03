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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-2 bg-stone-100 rounded-md px-2 py-1">
              <img src="/logo-wordmark.png" alt="Concilium" className="h-7 sm:h-8 w-auto" />
            </Link>
            <span className="hidden md:inline text-xs text-zinc-500 sm:ml-auto sm:order-3">
              Praeses Concilii is watching.
            </span>
          </div>
          <nav className="-mx-4 sm:mx-0 px-4 sm:px-0 flex items-center gap-1 overflow-x-auto sm:overflow-visible sm:ml-2 scrollbar-thin">
            <NavLink to="/decisions" className={navClass}>Decisions</NavLink>
            <NavLink to="/requests/new" className={navClass}>New request</NavLink>
            <NavLink to="/configuration" className={navClass}>Configuration</NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-600">
        Concilium — open-source multi-LLM deliberation platform.
      </footer>
    </div>
  );
}

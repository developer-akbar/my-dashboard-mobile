import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { FiGrid, FiZap } from 'react-icons/fi';
import { ElectricityDashboard } from '../features/electricity/ElectricityDashboard.jsx';

const NAV = [
  { id: 'electricity', label: 'Electricity', icon: <FiZap size={18} /> },
  // Future dashboards go here
];

export function App() {
  const [activePage, setActivePage] = useState('electricity');

  return (
    <div className="shell">
      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <FiGrid size={20} />
          <span>My Dashboard</span>
        </div>

        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`sidebar__item ${activePage === item.id ? 'sidebar__item--active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__version">v1.0.0</span>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────── */}
      <main className="main">
        {activePage === 'electricity' && <ElectricityDashboard />}
      </main>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '500',
          },
        }}
      />
    </div>
  );
}

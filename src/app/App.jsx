import { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { FiZap, FiGrid, FiSettings } from 'react-icons/fi';
import { ElectricityDashboard } from '../features/electricity/ElectricityDashboard.jsx';

const NAV = [
  { id: 'electricity', label: 'Electricity', icon: FiZap },
  { id: 'home',        label: 'Overview',    icon: FiGrid },
  { id: 'settings',   label: 'Settings',    icon: FiSettings },
];

export function App() {
  const [activePage, setActivePage] = useState('electricity');

  return (
    <div className="shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><FiGrid size={16} /></div>
          <span>MyDashboard</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar__item ${activePage === id ? 'sidebar__item--active' : ''}`}
              onClick={() => setActivePage(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">v1.0.0</div>
      </aside>

      {/* Main */}
      <main className="main">
        {activePage === 'electricity' && <ElectricityDashboard />}
        {activePage === 'home' && (
          <div className="page coming-soon">
            <h2>Overview</h2><p>Coming soon</p>
          </div>
        )}
        {activePage === 'settings' && (
          <div className="page coming-soon">
            <h2>Settings</h2><p>Coming soon</p>
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`bottom-nav__item ${activePage === id ? 'bottom-nav__item--active' : ''}`}
            onClick={() => setActivePage(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '500',
            fontFamily: 'var(--font)',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
      />
    </div>
  );
}
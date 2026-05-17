import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { FiZap, FiGrid, FiSettings } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';
import { ElectricityDashboard } from '../features/electricity/ElectricityDashboard.jsx';

const NAV = [
  { id: 'electricity', icon: FiZap },
  { id: 'home',        icon: FiGrid },
  { id: 'settings',    icon: FiSettings },
];

export function App() {
  const [activePage, setActivePage] = useState('electricity');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── Back Button Handling ───────────────────────────────────────────────────
  useEffect(() => {
    const onBack = async () => {
      // 1. Give priority to child components (like clearing selection)
      const backEvent = new CustomEvent('app-back-button', { detail: { handled: false }, cancelable: true });
      window.dispatchEvent(backEvent);
      
      if (backEvent.detail.handled) return;

      // 2. If on a sub-page, go back to dashboard
      if (activePage !== 'electricity') {
        setActivePage('electricity');
        return;
      }

      // 3. Otherwise exit app (on Android)
      CapApp.exitApp();
    };

    // Capacitor listener
    const capHandler = CapApp.addListener('backButton', onBack);

    // Browser listener (popstate)
    const popHandler = () => {
       onBack();
    };
    window.addEventListener('popstate', popHandler);

    // Push initial state to history so back button has something to pop in browser
    if (window.history.state !== 'root') {
      window.history.replaceState('root', '');
      window.history.pushState('nav', '');
    }

    return () => {
      capHandler.then(h => h.remove());
      window.removeEventListener('popstate', popHandler);
    };
  }, [activePage]);

  // Sync browser history with tab changes so browser back works
  useEffect(() => {
    if (window.history.state !== 'nav') {
       window.history.pushState('nav', '');
    }
  }, [activePage]);

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="shell">
      {/* Desktop sidebar */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo"><FiGrid size={16} /></div>
          <span>MyDashboard</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={`sidebar__item ${activePage === id ? 'sidebar__item--active' : ''}`}
              onClick={() => setActivePage(id)}
            >
              <Icon size={17} />
              {t(id)}
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
            <h2>{t('home')}</h2><p>Coming soon</p>
          </div>
        )}
        {activePage === 'settings' && (
          <div className="page">
            <div className="page__header">
              <div>
                <h2 className="page__title">{t('settings')}</h2>
                <p>Application preferences</p>
              </div>
            </div>
            
            <div className="scard" style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '15px' }}>{t('appearance')}</h3>
              <div className="field">
                <label className="field__label">{t('theme')}</label>
                <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                  <button 
                    className={`seg__btn ${theme === 'dark' ? 'seg__btn--active' : ''}`}
                    onClick={() => setTheme('dark')}
                    style={{ padding: '0 16px' }}
                  >
                    {t('dark')}
                  </button>
                  <button 
                    className={`seg__btn ${theme === 'light' ? 'seg__btn--active' : ''}`}
                    onClick={() => setTheme('light')}
                    style={{ padding: '0 16px' }}
                  >
                    {t('light')}
                  </button>
                </div>
              </div>
              
              <h3 style={{ marginTop: '24px', marginBottom: '16px', fontSize: '15px' }}>{t('language')}</h3>
              <div className="field">
                <label className="field__label">{t('app_language')}</label>
                <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                  <button 
                    className={`seg__btn ${i18n.language === 'en' ? 'seg__btn--active' : ''}`}
                    onClick={() => changeLanguage('en')}
                    style={{ padding: '0 16px' }}
                  >
                    English
                  </button>
                  <button 
                    className={`seg__btn ${i18n.language === 'te' ? 'seg__btn--active' : ''}`}
                    onClick={() => changeLanguage('te')}
                    style={{ padding: '0 16px' }}
                  >
                    తెలుగు
                  </button>
                </div>
              </div>
            </div>

            <footer className="dev-footer">
              <div className="dev-footer__line" />
              <p className="dev-footer__name">Developed by Akbar</p>
              <span className="dev-footer__tag">v1.0.0</span>
            </footer>
          </div>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {NAV.map(({ id, icon: Icon }) => (
          <button
            key={id}
            className={`bottom-nav__item ${activePage === id ? 'bottom-nav__item--active' : ''}`}
            onClick={() => setActivePage(id)}
          >
            <Icon size={20} />
            <span>{t(id)}</span>
          </button>
        ))}
      </nav>

      <Toaster
        position="bottom-center"
        containerClassName="toast-container"
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

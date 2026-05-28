import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { FiZap, FiGrid, FiSettings } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { App as CapApp } from '@capacitor/app';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import posthog from 'posthog-js';
import { PostHogProvider, usePostHog } from '@posthog/react';
import { ElectricityDashboard } from '../features/electricity/ElectricityDashboard.jsx';
import { CalculationSettings } from '../features/electricity/components/CalculationSettings.jsx';

// ── PostHog Initialization ──────────────────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, 
    autocapture: false, // Disable automatic click tracking
  });
}

const NAV = [
  { id: 'electricity', icon: FiZap },
  { id: 'home',        icon: FiGrid },
  { id: 'settings',    icon: FiSettings },
];

function AppContent() {
  const [activePage, setActivePage] = useState('electricity');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const { t, i18n } = useTranslation();
  const ph = usePostHog();

  // ── PWA Install Banner State ──────────────────────────────────────────────
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // 1. Listen for the install prompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 2. Timer to show banner after 1 minute
    const timer = setTimeout(() => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isCapacitor = window.Capacitor?.getPlatform() !== 'web';
      const isDismissed = localStorage.getItem('pwa_banner_dismissed') === 'true';

      if (!isStandalone && !isCapacitor && !isDismissed) {
        setShowInstallBanner(true);
      }
    }, 60000); // 60 seconds

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    setShowInstallBanner(false);
    if (!deferredPrompt) {
      // If prompt event isn't supported (e.g. iOS), just show info or dismiss
      toast.success('To add to home screen, use your browser\'s Share > Add to Home Screen menu.');
      localStorage.setItem('pwa_banner_dismissed', 'true');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      if (ph) ph.capture('pwa_installed');
    }
    setDeferredPrompt(null);
    localStorage.setItem('pwa_banner_dismissed', 'true');
  };

  const handleDismissBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa_banner_dismissed', 'true');
    if (ph) ph.capture('pwa_banner_dismissed');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── Analytics: Track Page View ─────────────────────────────────────────────
  useEffect(() => {
    if (ph) {
      ph.capture('$pageview', { page: activePage });
    }
  }, [activePage, ph]);

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
    if (ph) ph.capture('language_changed', { language: lng });
  };

  return (
    <div className="shell">
      {showInstallBanner && (
        <div className="install-banner">
          <span className="install-banner__text">Add MyDashboard to your home screen for quick access?</span>
          <div className="install-banner__actions">
            <button className="btn btn--white" onClick={handleInstallClick}>Yes</button>
            <button className="btn btn--outline-white" onClick={handleDismissBanner}>Not now</button>
          </div>
        </div>
      )}
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
        {activePage === 'electricity' && <ElectricityDashboard onOpenCalcSettings={() => setActivePage('calculation-settings')} />}
        {activePage === 'calculation-settings' && <CalculationSettings onBack={() => setActivePage('electricity')} />}
        {activePage === 'home' && (
          <div className="page coming-soon">
            <h2>{t('home')}</h2><p>Coming soon</p>
          </div>
        )}
        {activePage === 'settings' && (
          <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            <div className="page__header">
              <div>
                <h2 className="page__title">{t('settings')}</h2>
                <p>Application preferences</p>
              </div>
            </div>
            
            <div style={{ flex: 1 }}>
              <div className="scard" style={{ padding: '20px' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '15px' }}>{t('appearance')}</h3>
                <div className="field">
                  <label className="field__label">{t('theme')}</label>
                  <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                    <button 
                      className={`seg__btn ${theme === 'dark' ? 'seg__btn--active' : ''}`}
                      onClick={() => {
                        setTheme('dark');
                        if (ph) ph.capture('theme_changed', { theme: 'dark' });
                      }}
                      style={{ padding: '0 16px' }}
                    >
                      {t('dark')}
                    </button>
                    <button 
                      className={`seg__btn ${theme === 'light' ? 'seg__btn--active' : ''}`}
                      onClick={() => {
                        setTheme('light');
                        if (ph) ph.capture('theme_changed', { theme: 'light' });
                      }}
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

              <div className="scard" style={{ padding: '20px', marginTop: '20px' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '15px' }}>{t('feedback_support')}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.5' }}>
                  {t('feedback_desc')}
                </p>
                <a 
                  href="mailto:mail.akbarmulla@gmail.com?subject=My Dashboard App Feedback"
                  className="btn btn--ghost"
                  style={{ marginTop: '16px', width: '100%', justifyContent: 'center', color: 'var(--primary)' }}
                >
                  {t('contact_developer')}
                </a>
              </div>
            </div>

            <footer className="dev-footer" style={{ marginTop: '40px', paddingBottom: '20px' }}>
              <div className="dev-footer__line" />
              <p className="dev-footer__name">{t('developed_by')} Akbar</p>
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
      
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export function App() {
  return (
    <PostHogProvider client={posthog}>
      <AppContent />
    </PostHogProvider>
  );
}

import { FiArrowLeft } from 'react-icons/fi';

export function PrivacyPolicy({ onBack }) {
  return (
    <div className="page page--scrolled" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <header className="page__header page__header--sticky">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="icon-btn" onClick={onBack}>
            <FiArrowLeft size={20} style={{ color: 'var(--text-1)' }} />
          </button>
          <h1 className="page__title" style={{ margin: 0 }}>Privacy Policy</h1>
        </div>
      </header>
      
      <div style={{ flex: 1, paddingBottom: '40px' }}>
        <div className="scard" style={{ padding: '24px', lineHeight: '1.7', color: 'var(--text-2)' }}>
          <p className="meta" style={{ color: 'var(--text-3)', fontSize: '13px', marginBottom: '24px' }}>
            <strong>Last updated:</strong> June 2025 • <strong>App:</strong> My Dashboard (com.akbar.mydashboard)
          </p>

          <div style={{ background: 'var(--surface-3)', borderLeft: '4px solid var(--primary)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
            <strong style={{ color: 'var(--primary)' }}>Summary:</strong> My Dashboard does not collect, store, or share any personal data on external servers. All your primary data stays on your device.
          </div>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>1. What Data We Collect</h2>
          <p>My Dashboard does <strong>not</strong> collect any personally identifiable information. The app stores the following data <strong>locally on your device only</strong>:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li>APSPDCL service numbers you add (stored in local database).</li>
            <li>Bill history and payment records fetched from public APIs.</li>
            <li>App preferences (theme, language).</li>
            <li>Temporary session tokens (stored in memory only).</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>2. Third-Party Services</h2>
          <p>The app communicates with the following services to provide functionality:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li><strong>APSPDCL:</strong> To fetch electricity bill and payment history.</li>
            <li><strong>BillDesk:</strong> To fetch current bill demand via captcha.</li>
            <li><strong>Vercel:</strong> Our processing proxy. It makes requests on your behalf and <strong>does not store</strong> user data.</li>
            <li><strong>PostHog (Web only):</strong> Provides anonymous usage analytics (page views).</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>3. Push Notifications</h2>
          <p>If you grant permission, we use <strong>Firebase Cloud Messaging (FCM)</strong> to send bill reminders. To enable this, your service numbers are synced with our secure backend to check for bill updates. This data is used <strong>exclusively</strong> for triggering notifications and is never shared or used for marketing.</p>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>4. Data Deletion & Rights</h2>
          <p>All data is stored locally. You can delete it at any time by:</p>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li>Removing services via the <strong>Trash</strong> feature.</li>
            <li>Uninstalling the app (clears all local data).</li>
            <li>Clearing App Storage in your Android device settings.</li>
          </ul>

          <h2 style={{ fontSize: '18px', marginTop: '32px', color: 'var(--text-1)' }}>5. Contact Us</h2>
          <p>For any privacy-related questions, contact: <a href="mailto:mail.akbarmulla@gmail.com" style={{ color: 'var(--primary)' }}>mail.akbarmulla@gmail.com</a></p>

          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic' }}>
            <p><strong>Disclaimer:</strong> My Dashboard is an independent, unofficial application. It is not affiliated with, authorized by, or endorsed by APSPDCL, BillDesk, or any government entity. All product and company names are trademarks™ or registered® trademarks of their respective holders.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

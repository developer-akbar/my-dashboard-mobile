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
        <div className="scard" style={{ padding: '20px', lineHeight: '1.6', color: 'var(--text-2)' }}>
          <p><strong>Effective Date:</strong> May 28, 2026</p>
          
          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>1. Introduction</h3>
          <p>Welcome to My Dashboard. This Privacy Policy explains how we collect, use, and protect your information when you use our mobile application and web services.</p>
          
          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>2. Information We Collect</h3>
          <p><strong>Service Numbers:</strong> We collect and store APSPDCL service numbers that you add to the app to fetch and display electricity bill details.</p>
          <p><strong>Device Information:</strong> We collect device push notification tokens to send you timely bill reminders and overdue alerts.</p>
          <p><strong>Usage Data:</strong> We may collect anonymous usage data and crash reports to improve app performance and user experience.</p>

          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>3. How We Use Your Information</h3>
          <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li style={{ marginBottom: '4px' }}>To provide, maintain, and improve the app's core functionality.</li>
            <li style={{ marginBottom: '4px' }}>To fetch verified bill data from external providers (APSPDCL).</li>
            <li style={{ marginBottom: '4px' }}>To send targeted push notifications regarding your bill statuses.</li>
          </ul>

          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>4. Data Storage and Security</h3>
          <p>Your service numbers are primarily stored locally on your device. When synced for push notifications, they are securely transmitted to our backend using encrypted HTTPS connections. We employ industry-standard security measures to protect your data from unauthorized access.</p>

          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>5. Third-Party Services</h3>
          <p>The app connects to APSPDCL and BillDesk exclusively for bill fetching and payments. We are not responsible for the privacy practices of these third-party platforms once you are redirected. We also use PostHog for anonymous usage analytics.</p>

          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>6. Your Rights</h3>
          <p>You can delete your service numbers from the app at any time, which will immediately stop future tracking and notifications for those numbers. You may also disable push notifications completely via your device's operating system settings.</p>

          <h3 style={{ marginTop: '20px', marginBottom: '8px', color: 'var(--text-1)' }}>7. Contact Us</h3>
          <p>If you have any questions or concerns about this Privacy Policy, please contact us at: <strong>mail.akbarmulla@gmail.com</strong></p>
        </div>
      </div>
    </div>
  );
}

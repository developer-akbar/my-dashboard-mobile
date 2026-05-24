import { useEffect } from 'react';
import { FiX, FiExternalLink } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';

export function QRCodeDialog({ open, service, onClose }) {
  const { t } = useTranslation();

  // Handle Esc and Back button
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape' && open) onClose(); };
    const handleBack = (e) => {
      if (open && !e.detail?.handled) {
        onClose();
        if (e.detail) e.detail.handled = true;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('app-back-button', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('app-back-button', handleBack);
    };
  }, [open, onClose]);

  if (!open || !service) return null;

  const upiString = generateAPSPDCLUpiString(service);
  
  // Extract time for display
  const dateObj = service.lastBillDate ? new Date(service.lastBillDate) : null;
  const timeStr = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : null;
  const hasTime = dateObj && (dateObj.getUTCHours() !== 0 || dateObj.getUTCMinutes() !== 0);

  return (
    <div className="overlay overlay--center" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '340px' }}>
        <div className="sheet__header" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <p className="sheet__eyebrow">{service.label || t('electricity')}</p>
            <h3 className="sheet__title">Pay Bill</h3>
          </div>
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <div className="dialog__body" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          
          <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: '16px' }}>
            <QRCodeSVG 
              value={upiString} 
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>

          <div style={{ width: '100%', marginBottom: '24px', padding: '10px', background: 'var(--surface-3)', borderRadius: '8px', border: '1px solid var(--border)' }}>
             <p style={{ fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase', textAlign: 'left', fontWeight: 'bold' }}>Internal segments (Validation):</p>
             <code style={{ display: 'block', fontSize: '9px', wordBreak: 'break-all', textAlign: 'left', color: 'var(--text-2)', fontFamily: 'var(--mono)', lineHeight: '1.4' }}>
               {upiString}
             </code>
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-1)', marginBottom: '4px' }}>
            ₹{Number(service.publicBillAmount || service.lastAmountDue).toLocaleString('en-IN')}
          </h2>
          {hasTime && (
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '12px' }}>
              Bill Generated at {timeStr}
            </p>
          )}
          
          <p style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '20px', lineHeight: '1.4' }}>
            Scan this dynamic QR with any UPI app to pay securely to <b>APSPDCL</b>.
          </p>

          <div style={{ padding: '12px', background: 'var(--red-dim)', borderRadius: '8px', border: '1px solid var(--red-glow)', marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', color: 'var(--red)', fontWeight: '600', lineHeight: '1.4' }}>
              ⚠️ FEATURE IN PROGRESS
            </p>
            <p style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '4px', lineHeight: '1.4' }}>
              QR generation is experimental. Do not use this for actual payments. Use the <b>Pay Now</b> button on the service card to pay via official APSPDCL website. Use at your own risk.
            </p>
          </div>

          <a 
            href={upiString}
            className="btn btn--primary" 
            style={{ width: '100%', justifyContent: 'center', height: '44px', fontSize: '15px' }}
          >
            <FiExternalLink style={{ marginRight: '8px' }} /> Pay via UPI
          </a>
          
          <p style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '16px', fontStyle: 'italic' }}>
            * This QR is generated based on your service number and bill date.
          </p>
        </div>
      </div>
    </div>
  );
}

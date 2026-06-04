import { useEffect, useState, useRef } from 'react';
import { FiX, FiClock, FiCheck, FiInfo, FiCopy, FiSearch, FiRefreshCw } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';
import { apiBase } from '../api/servicesApi.js';
import toast from 'react-hot-toast';

export function QRCodeDialog({ open, service, onClose, onUpdateTime }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  // Discovery State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState({ current: 0, total: 1440 });
  const discoveryAbort = useRef(false);

  const upiString = service ? generateAPSPDCLUpiString(service) : '';

  useEffect(() => {
    if (!open) {
      setIsDiscovering(false);
      discoveryAbort.current = true;
    } else {
      discoveryAbort.current = false;
    }
  }, [open]);

  const handleCopy = () => {
    if (!upiString) return;
    navigator.clipboard.writeText(upiString);
    setCopied(true);
    toast.success(t('copied_clipboard', 'UPI Link copied!'));
    setTimeout(() => setCopied(false), 2000);
  };

  const runDiscovery = async () => {
    if (!service || isDiscovering) return;
    
    setIsDiscovering(true);
    discoveryAbort.current = false;
    setDiscoveryProgress({ current: 0, total: 1440 });

    let offset = 0;
    const batchSize = 20;

    try {
      // Loop until found, aborted, or finished
      while (!discoveryAbort.current) {
        const url = `${apiBase()}/vpa/discover`;
        console.log(`[discovery] Fetching: ${url} (Offset: ${offset})`);
        
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceNumber: service.serviceNumber,
            billDate: service.billDate,
            offset,
            batchSize
          })
        });

        if (!res.ok) throw new Error('Discovery server error');
        const data = await res.json();

        if (data.found) {
          toast.success(`Success! Valid QR discovered.`);
          onUpdateTime?.(service.id, data.billTime);
          setIsDiscovering(false);
          return;
        }

        if (data.nextOffset === null) {
          toast.error('Could not discover a valid payment time for this bill.');
          break;
        }

        offset = data.nextOffset;
        setDiscoveryProgress({ current: data.processedCount, total: data.totalCount });
      }
    } catch (err) {
      console.error('[discovery] Error:', err);
      toast.error(err.message);
    } finally {
      if (!discoveryAbort.current) setIsDiscovering(false);
    }
  };

  if (!open || !service) return null;

  const hasTime = !!service.billTime;

  return (
    <div className="overlay overlay--center" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '420px', maxWidth: '95vw', textAlign: 'center', position: 'relative' }}>
        <header className="dialog__header" style={{ marginBottom: '20px' }}>
          <h2 className="dialog__title">{t('upi_qr_payment', 'UPI QR Payment')}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>{service.label || service.customerName}</p>
          <button className="icon-btn-ghost" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}><FiX size={20} /></button>
        </header>

        <div className="dialog__body">
          {!hasTime && !isDiscovering ? (
            <div className="state-box" style={{ padding: '20px', border: '1px dashed var(--border-hi)', borderRadius: '12px', background: 'var(--surface-2)', minHeight: 'auto' }}>
              <FiClock size={32} style={{ color: 'var(--amber)', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>QR Discovery Required</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '16px' }}>
                APSPDCL requires the exact bill generation time for QR codes. We can scan for it automatically.
              </p>
              <button className="btn btn--primary" onClick={runDiscovery} style={{ width: '100%' }}>
                <FiSearch size={16} style={{ marginRight: '8px' }} /> Start Discovery
              </button>
            </div>
          ) : isDiscovering ? (
            <div className="state-box" style={{ padding: '30px 20px', minHeight: 'auto' }}>
              <FiRefreshCw size={40} className="spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
              <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Scanning Timings...</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '20px' }}>
                Checking prioritized time slots for valid payment link
              </p>
              <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                <div style={{ 
                  height: '100%', 
                  width: `${(discoveryProgress.current / discoveryProgress.total) * 100}%`, 
                  background: 'var(--primary)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-2)' }}>
                {discoveryProgress.current} / {discoveryProgress.total} slots scanned
              </span>
              <button className="btn btn--ghost" onClick={() => setIsDiscovering(false)} style={{ marginTop: '24px', width: '100%' }}>Cancel</button>
            </div>
          ) : (
            <>
              <div style={{ 
                background: '#fff', 
                padding: '24px', 
                borderRadius: '16px', 
                display: 'inline-block',
                boxShadow: 'inset 0 0 0 1px var(--border-hi)',
                marginBottom: '20px'
              }}>
                <QRCodeSVG value={upiString} size={220} level="M" includeMargin={false} />
              </div>

              <div className="scard" style={{ padding: '12px', background: 'var(--surface-2)', marginBottom: '20px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '700', textTransform: 'uppercase' }}>Amount to Pay</span>
                  <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: '700' }}>Verified Merchant</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-1)' }}>
                  ₹{Number(service.lastAmountDue || 0).toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className="btn btn--primary" onClick={handleCopy} style={{ flex: 1 }}>
                  {copied ? <FiCheck size={16} /> : <FiCopy size={16} />}
                  <span style={{ marginLeft: '8px' }}>{copied ? 'Copied' : 'Copy UPI Link'}</span>
                </button>
                <button className="btn btn--ghost" onClick={() => setShowInfo(true)} title="How it works">
                  <FiInfo size={18} />
                </button>
              </div>
            </>
          )}

          <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: '1.4', marginTop: '10px' }}>
            Scan using PhonePe, Google Pay, or any UPI app.<br />
            Payments go directly to <b>APSPDCL</b> account.
          </p>
        </div>

        {showInfo && (
          <div className="overlay overlay--center" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.8)' }}>
            <div className="dialog" style={{ width: '340px' }}>
              <h3 style={{ marginBottom: '12px' }}>How it works</h3>
              <div style={{ textAlign: 'left', fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6' }}>
                <p style={{ marginBottom: '12px' }}>
                  This QR code uses the <b>APSPDCL Direct UPI</b> system. It generates a unique payment address (VPA) for your specific bill.
                </p>
                <ul style={{ paddingLeft: '20px', marginBottom: '16px' }}>
                  <li>Direct settlement to APSPDCL</li>
                  <li>Instant payment confirmation</li>
                  <li>No extra gateway charges</li>
                </ul>
                <button className="btn btn--primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowInfo(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

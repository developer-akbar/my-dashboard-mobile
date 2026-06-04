import { useEffect, useState, useRef } from 'react';
import { FiX, FiExternalLink, FiClock, FiCheck, FiInfo, FiCopy, FiAlertCircle, FiSearch, FiRefreshCw } from 'react-icons/fi';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { generateAPSPDCLUpiString } from '../utils/qrcode.js';
import { apiBase } from '../api/servicesApi.js';
import toast from 'react-hot-toast';

export function QRCodeDialog({ open, service, onClose, onUpdateTime }) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [isTimeInfoHighlighted, setIsTimeInfoHighlighted] = useState(false);

  // Discovery State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState({ current: 0, total: 1440 });
  const discoveryAbort = useRef(false);

  const currentCleanTime = timeInput.replace(/\D/g, '');
  const isTimeMissing = !service?.billTime && currentCleanTime.length !== 4;

  // Extract time from current service data
  const dateObj = service?.lastBillDate ? new Date(service.lastBillDate) : null;
  const displayDate = dateObj ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  useEffect(() => {
    if (open && service) {
      // billTime is stored as HHMM (e.g. 1015)
      const bt = service.billTime || '';
      if (bt.length === 4) {
        setTimeInput(`${bt.substring(0, 2)}:${bt.substring(2)}`);
      } else {
        setTimeInput('');
      }
      setIsEditing(!service.billTime); // Auto-open edit mode if time is missing
      setShowInfo(false);
      setIsTimeInfoHighlighted(false);
      setIsDiscovering(false);
      discoveryAbort.current = false;
    }
  }, [open, service]);

  // Handle Esc and Back button
  useEffect(() => {
    const handleKeyDown = (e) => { 
      if (e.key === 'Escape' && open) {
        if (showInfo) setShowInfo(false);
        else if (isEditing && service?.billTime) setIsEditing(false);
        else onClose();
      }
    };
    const handleBack = (e) => {
      if (open && !e.detail?.handled) {
        if (showInfo) {
          setShowInfo(false);
          if (e.detail) e.detail.handled = true;
        } else if (isEditing && service?.billTime) {
          setIsEditing(false);
          if (e.detail) e.detail.handled = true;
        } else {
          onClose();
          if (e.detail) e.detail.handled = true;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('app-back-button', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('app-back-button', handleBack);
    };
  }, [open, onClose, showInfo, isEditing, service]);

  if (!open || !service) return null;

  // Use live time input for dynamic QR preview
  const upiString = generateAPSPDCLUpiString({ 
    ...service, 
    billTime: currentCleanTime.length === 4 ? currentCleanTime : null 
  });

  const handleSaveTime = () => {
    if (currentCleanTime.length !== 4) return;
    onUpdateTime(service.id, currentCleanTime);
    setIsEditing(false);
  };

  const runDiscovery = async () => {
    if (!service || isDiscovering) return;
    
    setIsDiscovering(true);
    discoveryAbort.current = false;
    setDiscoveryProgress({ current: 0, total: 1440 });

    let offset = 0;
    const batchSize = 25;

    try {
      while (!discoveryAbort.current) {
        const url = `${apiBase()}/vpa/discover`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceNumber: service.serviceNumber,
            billDate: service.billDate || service.lastBillDate,
            offset,
            batchSize
          })
        });

        if (!res.ok) throw new Error('Discovery server error');
        const data = await res.json();

        if (data.found) {
          toast.success(`Success! Valid QR discovered.`);
          const bt = data.billTime;
          setTimeInput(`${bt.substring(0, 2)}:${bt.substring(2)}`);
          onUpdateTime?.(service.id, bt);
          setIsDiscovering(false);
          setIsEditing(false);
          return;
        }

        if (data.nextOffset === null) {
          toast.error('Could not discover a valid payment time.');
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

  const copyUpiString = async () => {
    try {
      await navigator.clipboard.writeText(upiString);
      toast.success('UPI String copied');
    } catch (e) {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="overlay overlay--center" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '85%', maxWidth: '340px', position: 'relative' }}>
        <div className="sheet__header" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)', display: 'block', position: 'relative' }}>
          <h3 className="sheet__title" style={{ textAlign: 'center', width: '100%', marginBottom: '4px', fontSize: '18px' }}>{t('pay_bill', 'Pay Bill')}</h3>
          <p className="sheet__eyebrow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '10px' }}>
            <span style={{ fontWeight: '600' }}>{service.label || t('untitled')}</span>
            <span style={{ color: 'var(--text-3)', fontSize: '8px' }}>•</span>
            <span className="mono">{service.serviceNumber}</span>
            <button 
              onClick={() => setShowInfo(true)}
              className="icon-btn" 
              style={{ width: '18px', height: '18px', padding: 0, marginLeft: '2px', background: 'none', border: 'none' }}
            >
              <FiInfo size={13} style={{ color: 'var(--text-3)' }} />
            </button>
          </p>
          <button className="icon-btn sheet__close" onClick={onClose} style={{ position: 'absolute', right: '-14px', top: '-14px', border: 'none', background: 'none' }}><FiX size={18} /></button>
        </div>

        <div className="dialog__body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxHeight: '70vh', overflowY: 'auto', scrollbarGutter: 'stable' }}>

          {isDiscovering ? (
            <div className="state-box" style={{ padding: '30px 20px', minHeight: 'auto', margin: '20px 0', width: '100%' }}>
              <FiRefreshCw size={40} className="spin" style={{ color: 'var(--primary)', marginBottom: '16px' }} />
              <h3 style={{ fontSize: '16px', marginBottom: '4px', color: 'var(--text-1)' }}>Scanning Timings...</h3>
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
              <button className="btn btn--ghost" onClick={() => { discoveryAbort.current = true; setIsDiscovering(false); }} style={{ marginTop: '24px', width: '100%' }}>Cancel</button>
            </div>
          ) : (
            <div style={{ 
              background: '#fff', 
              padding: '16px', 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
              marginBottom: '16px', 
              flexShrink: 0,
              border: isTimeMissing ? '2px solid var(--red)' : 'none'
            }}>
              <QRCodeSVG
                value={upiString}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>
          )}

          {/* Time Configuration Section */}
          <div style={{ 
            width: '100%', 
            marginBottom: '20px', 
            padding: '12px', 
            background: 'var(--surface-2)', 
            borderRadius: '10px', 
            border: '1px solid var(--border)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: '700' }}>Bill generation info</p>
              {!isEditing && !isDiscovering && (
                <button
                  onClick={() => setIsEditing(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', padding: '2px 6px' }}
                >
                  Edit Time
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Bill Date</p>
                <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)' }}>{displayDate}</p>
              </div>

              <div style={{ flex: 1.2 }}>
                <p style={{ fontSize: '10px', color: 'var(--text-3)' }}>Gen. Time (HH:MM)</p>
                {isEditing && !isDiscovering ? (
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <input
                      type="text"
                      className="field__input"
                      style={{ height: '32px', padding: '0 4px', fontSize: '12px', width: '56px', textAlign: 'center', fontFamily: 'var(--mono)', borderColor: isTimeMissing ? 'var(--red)' : 'var(--border-md)' }}
                      placeholder="10:15"
                      value={timeInput}
                      onChange={e => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val.length > 4) val = val.substring(0, 4);
                        if (val.length > 2) val = val.substring(0, 2) + ':' + val.substring(2);
                        setTimeInput(val);
                      }}
                    />
                    <button
                      onClick={handleSaveTime}
                      disabled={currentCleanTime.length !== 4}
                      style={{ background: 'var(--primary)', border: 'none', borderRadius: '4px', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: currentCleanTime.length === 4 ? 1 : 0.5 }}
                    >
                      <FiCheck size={14} />
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FiClock size={12} style={{ color: isTimeMissing ? 'var(--red)' : 'var(--primary)' }} />
                    {timeInput || '—'}
                  </p>
                )}
              </div>
            </div>

            {/* Discovery Button Row */}
            {isEditing && !isDiscovering && (
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <button 
                  className="btn btn--secondary btn--sm" 
                  onClick={runDiscovery}
                  style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <FiSearch size={14} />
                  <span style={{ fontSize: '11px', fontWeight: '800' }}>Discover Time Automatically</span>
                </button>
              </div>
            )}

            <p style={{ 
              fontSize: '10px', 
              color: isTimeInfoHighlighted ? 'var(--text-1)' : 'var(--text-3)', 
              marginTop: '10px', 
              fontStyle: 'italic', 
              textAlign: 'left', 
              lineHeight: '1.6',
              background: isTimeInfoHighlighted ? 'var(--amber-dim)' : 'transparent',
              padding: isTimeInfoHighlighted ? '6px' : '0',
              borderRadius: '4px',
              transition: 'all 0.3s ease'
            }}>
              * Providing the exact bill generation time (found on your receipt) generates a valid QR code for payments directly to APSPDCL.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-1)' }}>
              ₹{Number(service.publicBillAmount || service.lastAmountDue).toLocaleString('en-IN')}
            </h2>
            {isTimeMissing && !isDiscovering && (
              <button 
                onClick={() => {
                  setIsTimeInfoHighlighted(true);
                  setTimeout(() => setIsTimeInfoHighlighted(false), 3000);
                }}
                style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0 }}
                title="Why is this required?"
              >
                <FiInfo size={16} />
              </button>
            )}
          </div>

          <a
            href={isTimeMissing ? '#' : upiString}
            onClick={e => isTimeMissing && e.preventDefault()}
            className={`btn btn--primary ${isTimeMissing ? 'btn--danger-outline' : ''}`}
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              height: '44px', 
              fontSize: '15px', 
              padding: '6px 12px', 
              textDecoration: 'none',
              ...(isTimeMissing ? { borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent', borderWidth: '2px', pointerEvents: 'none', opacity: 0.7 } : {})
            }}
          >
            {isTimeMissing && <FiAlertCircle size={18} style={{ marginRight: '8px' }} />}
            Pay via UPI
          </a>

          {!isDiscovering && (
            <div style={{ padding: '12px', background: 'var(--red-dim)', borderRadius: '8px', border: '1px solid var(--red-glow)', marginTop: '24px' }}>
              <p style={{ fontSize: '11px', color: 'var(--red)', fontWeight: '600', lineHeight: '1.4' }}>
                ⚠️ EXPERIMENTAL FEATURE
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '4px', lineHeight: '1.6', textAlign: 'left' }}>
                Currently, APSPDCL does not store generation times in public records, so <b>manual entry</b> or <b>auto-discovery</b> is required for valid Direct UPI payment.
                <br /><br />
                For confirmed safety, use the <b>Pay Now</b> button on Service Card.
              </p>
            </div>
          )}
        </div>

        {/* Info Sub-popup */}
        {showInfo && (
          <div
            className="overlay overlay--center"
            style={{ position: 'absolute', zIndex: 100, borderRadius: 'inherit' }}
            onClick={() => setShowInfo(false)}
          >
            <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '90%', margin: '0 20px' }}>
              <div className="sheet__header" style={{ padding: '0 0 12px 0', borderBottom: '1px solid var(--border)' }}>
                <h3 className="sheet__title" style={{ fontSize: '15px' }}>Internal Segments</h3>
                <button className="icon-btn" onClick={() => setShowInfo(false)}><FiX size={16} /></button>
              </div>
              <div className="dialog__body" style={{ padding: '16px 0' }}>
                <div style={{ padding: '12px', background: 'var(--surface-3)', borderRadius: '8px', border: '1px solid var(--border)', position: 'relative' }}>
                  <code style={{ display: 'block', fontSize: '11px', wordBreak: 'break-all', textAlign: 'left', color: 'var(--text-2)', fontFamily: 'var(--mono)', lineHeight: '1.5', paddingRight: '32px' }}>
                    {upiString}
                  </code>
                  <button
                    onClick={copyUpiString}
                    className="icon-btn"
                    style={{ position: 'absolute', right: '8px', top: '8px', color: 'var(--primary)', background: 'none', border: 'none' }}
                    title="Copy UPI String"
                  >
                    <FiCopy size={16} />
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '12px', textAlign: 'left', lineHeight: '1.6' }}>
                  These segments are used to construct the UPI payment URI.
                </p>
              </div>
              <div className="dialog__footer" style={{ marginTop: 0, justifyContent: 'center' }}>
                <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowInfo(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

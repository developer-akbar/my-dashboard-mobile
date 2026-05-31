import { useState, useMemo, useEffect } from 'react';
import { FiX, FiZap, FiInfo, FiTrendingUp, FiTrendingDown, FiClock, FiAlertCircle, FiPlus, FiMinus, FiChevronDown, FiActivity } from 'react-icons/fi';
import { LuCalculator } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG, DEFAULT_COMMERCIAL_CONFIG } from '../utils/billing.js';
import { formatInr } from '../../../shared/utils/index.js';
import { db } from '../../../shared/db/storage.js';

export function BillCalculator({ open, service, onClose }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('progress'); 
  const [units, setUnits] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [manualLastReading, setManualLastReading] = useState('');
  const [load, setLoad] = useState(1);
  const [type, setType] = useState('domestic');

  // Reset state when service changes to ensure individual service isolation
  useEffect(() => {
    if (service && open) {
      setMode('progress');
      // Robust detection of service type
      const cat = (service.category || '').toUpperCase();
      
      // Commercial if it contains CAT-II, LT-II, NON-DOMESTIC, COMMERCIAL, or ends with II or 2
      const isCommercial = cat.includes('LT-II') || 
                          cat.includes('LT II') || 
                          cat.includes('LT-2') ||
                          cat.includes('LT 2') ||
                          cat.includes('CAT-II') || 
                          cat.includes('CAT II') || 
                          cat.includes('CAT-2') ||
                          cat.includes('CAT 2') ||
                          cat.includes('NON-DOMESTIC') || 
                          cat.includes('NON DOMESTIC') || 
                          cat.includes('COMMERCIAL') ||
                          cat.includes(' II') ||
                          cat.endsWith(' 2') ||
                          cat.endsWith('-2');
      
      const isDomestic = cat.includes('LT-I') || 
                        cat.includes('LT I') || 
                        cat.includes('LT-1') ||
                        cat.includes('LT 1') ||
                        cat.includes('CAT-I') || 
                        cat.includes('CAT I') || 
                        cat.includes('CAT-1') ||
                        cat.includes('CAT 1') ||
                        cat.includes('DOMESTIC') || 
                        cat.includes('RESIDENTIAL');

      // If we explicitly find domestic keywords, use domestic.
      // If we find commercial keywords, use commercial.
      // Fallback is based on which one was detected.
      if (isCommercial) {
        setType('commercial');
      } else if (isDomestic) {
        setType('domestic');
      } else {
        // Ultimate fallback
        setType('domestic');
      }

      setLoad(service.ctrLoad || 1);
      setManualLastReading(service.closingRdg || '');
      setUnits('');
      setCurrentReading('');
    }
  }, [service?.id, service?.serviceNumber, service?.category, open]);

  const config = type === 'commercial' ? DEFAULT_COMMERCIAL_CONFIG : DEFAULT_DOMESTIC_CONFIG;

  const progressResult = useMemo(() => {
    // Need current reading and a valid bill date to calculate progress
    const billDateStr = service?.lastBillDate || service?.billDate;
    if (mode !== 'progress' || !currentReading || !billDateStr) return null;

    // Use a robust parser that strips non-numeric characters just in case
    const cleanNum = (val) => {
      if (val === null || val === undefined || val === '') return NaN;
      const numStr = String(val).replace(/[^0-9.]/g, '');
      return parseFloat(numStr);
    };

    const current = cleanNum(currentReading);
    // Prioritize manualLastReading if it exists, otherwise fall back to service.closingRdg
    const lastStr = manualLastReading !== '' ? manualLastReading : service?.closingRdg;
    const last = cleanNum(lastStr);

    if (isNaN(current) || isNaN(last) || current <= last) return null;

    const unitsSoFar = current - last;
    
    // Calculate ACTUAL days passed since last bill date
    const billDate = new Date(billDateStr);
    const now = new Date();
    
    // Difference in milliseconds converted to days
    const msDiff = now.getTime() - billDate.getTime();
    const daysPassed = Math.max(1, Math.floor(msDiff / (1000 * 60 * 60 * 24)));
    const remainingDays = Math.max(0, 30 - daysPassed);
    
    // Current bill so far
    const currentBill = calculateEstimatedBill(unitsSoFar, load, config);
    
    // Extrapolate: (units / daysPassed) * 30 days
    const predictedUnits = Math.round((unitsSoFar / daysPassed) * 30);
    const predictedBill = calculateEstimatedBill(predictedUnits, load, config);

    const prevUnits = service?.lastBilledUnits || service?.billedUnits || 0;
    const diffPct = prevUnits > 0 ? Math.round(((predictedUnits - prevUnits) / prevUnits) * 100) : 0;

    return {
      unitsSoFar,
      daysPassed,
      remainingDays,
      currentBill: currentBill.total,
      predictedUnits,
      predictedBill: predictedBill.total,
      diffPct,
      isHigher: predictedUnits > prevUnits
    };
  }, [mode, currentReading, manualLastReading, service, load, config]);

  const simpleResult = useMemo(() => {
    const u = parseFloat(units);
    if (isNaN(u) || u < 0) return null;
    return calculateEstimatedBill(u, load, config);
  }, [units, load, config]);

  if (!open) return null;

  return (
    <div className="overlay overlay--center" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '500px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <header className="dialog__header" style={{ position: 'relative', paddingBottom: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="sidebar__logo" style={{ width: '32px', height: '32px', background: 'var(--primary-dim)', color: 'var(--primary)' }}>
               <LuCalculator size={18} />
            </div>
            <h2 className="dialog__title" style={{ margin: 0 }}>Bill Predictor</h2>
          </div>
          <button className="icon-btn-ghost" onClick={onClose} style={{ position: 'absolute', top: '0', right: '0' }}><FiX size={20} /></button>
        </header>

        <div className="dialog__body" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
          <div className="seg" style={{ marginBottom: '24px' }}>
            <button 
              className={`seg__btn ${mode === 'progress' ? 'seg__btn--active' : ''}`}
              onClick={() => setMode('progress')}
            >
              Progress Check
            </button>
            <button 
              className={`seg__btn ${mode === 'simple' ? 'seg__btn--active' : ''}`}
              onClick={() => setMode('simple')}
            >
              Custom Units
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <div className="field">
              <label className="field__label">Service Type</label>
              <div className="radio-group">
                <div 
                  className={`radio-item ${type === 'domestic' ? 'radio-item--active' : ''}`}
                  onClick={() => setType('domestic')}
                >
                  <div className="radio-circle" />
                  <div className="radio-label">Domestic (LT-I)</div>
                </div>
                <div 
                  className={`radio-item ${type === 'commercial' ? 'radio-item--active' : ''}`}
                  onClick={() => setType('commercial')}
                >
                  <div className="radio-circle" />
                  <div className="radio-label">Commercial (LT-II)</div>
                </div>
              </div>
            </div>
          </div>

          {mode === 'simple' ? (
            <div className="field">
              <label className="field__label">Total Units to Calculate</label>
              <input 
                type="text" inputMode="numeric" pattern="[0-9]*" className="field__input" placeholder="e.g. 250" autoFocus
                value={units} onChange={e => setUnits(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(!service?.closingRdg && !manualLastReading) && (
                <div className="field">
                  <label className="field__label">Last Month's Final Reading</label>
                  <input 
                    type="text" inputMode="numeric" pattern="[0-9]*" className="field__input" placeholder="Enter last reading from bill"
                    value={manualLastReading} onChange={e => setManualLastReading(e.target.value.replace(/\D/g, ''))}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>
                    Required because history is unavailable.
                  </p>
                </div>
              )}
              
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                   <label className="field__label" style={{ marginBottom: 0 }}>Current Meter Reading</label>
                   {(service?.closingRdg || manualLastReading) && (
                     <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-3)', display: 'block' }}>Last Reading</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary-hi)' }}>{manualLastReading || service.closingRdg}</span>
                     </div>
                   )}
                </div>
                <input 
                  type="text" inputMode="numeric" pattern="[0-9]*" className="field__input" placeholder="Reading currently on your meter" autoFocus
                  value={currentReading} onChange={e => setCurrentReading(e.target.value.replace(/\D/g, ''))}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '8px', marginBottom: '16px' }}>
                   Go to your physical meter and enter the main number displayed.
                </p>
              </div>
            </div>
          )}

          {mode === 'simple' && simpleResult && (
            <div style={{ marginTop: '24px' }}>
              <div className="scard" style={{ padding: '20px', background: 'var(--surface-2)', textAlign: 'center' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '4px' }}>Estimated Total Bill</p>
                <h2 style={{ fontSize: '32px', color: 'var(--primary-hi)' }}>{formatInr(simpleResult.total)}</h2>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Energy Charges</span>
                  <span style={{ fontWeight: '600' }}>{formatInr(simpleResult.ec)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Fixed Charges ({load}kW)</span>
                  <span style={{ fontWeight: '600' }}>{formatInr(simpleResult.fc)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Electricity Duty (6%)</span>
                  <span style={{ fontWeight: '600' }}>{formatInr(simpleResult.ed)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Customer Charges</span>
                  <span style={{ fontWeight: '600' }}>{formatInr(simpleResult.cc)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                  <span style={{ color: 'var(--text-1)', fontWeight: '600' }}>Total Estimation</span>
                  <span style={{ color: 'var(--primary-hi)', fontWeight: '700' }}>{formatInr(simpleResult.total)}</span>
                </div>
              </div>
            </div>
          )}

          {mode === 'progress' && progressResult && (
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="scard" style={{ padding: '16px', background: 'var(--surface-2)', textAlign: 'center' }}>
                   <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase' }}>Bill So Far</p>
                   <h2 style={{ fontSize: '20px', color: 'var(--text-1)' }}>{formatInr(progressResult.currentBill)}</h2>
                </div>
                <div className="scard" style={{ padding: '16px', background: 'var(--primary-dim)', textAlign: 'center', border: '1px solid var(--primary-hi)' }}>
                   <p style={{ fontSize: '11px', color: 'var(--primary-hi)', marginBottom: '4px', textTransform: 'uppercase' }}>Est. 30 Days</p>
                   <h2 style={{ fontSize: '20px', color: 'var(--primary-hi)' }}>{formatInr(progressResult.predictedBill)}</h2>
                </div>
              </div>

              <div className="scard" style={{ padding: '20px', background: 'var(--surface-2)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                   <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '4px' }}>Monthly Units Prediction</p>
                   <h2 style={{ fontSize: '32px', color: 'var(--primary-hi)' }}>{progressResult.predictedUnits} <span style={{ fontSize: '16px', fontWeight: '400' }}>Units</span></h2>
                   <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', marginTop: '8px', background: progressResult.isHigher ? 'var(--red-dim)' : 'var(--green-dim)', color: progressResult.isHigher ? 'var(--red)' : 'var(--green)' }}>
                      {progressResult.isHigher ? <FiTrendingUp size={14} /> : <FiTrendingDown size={14} />}
                      <strong>{Math.abs(progressResult.diffPct)}% {progressResult.isHigher ? 'higher' : 'lower'}</strong> than last month
                   </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                 <div className="scard" style={{ padding: '12px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase' }}>Used So Far</p>
                    <p style={{ fontSize: '16px', fontWeight: '700' }}>{progressResult.unitsSoFar} <span style={{ fontSize: '12px', fontWeight: '400' }}>Units</span></p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-2)', marginTop: '4px' }}>
                       <FiClock size={10} /> {progressResult.daysPassed} days
                    </div>
                 </div>
                 <div className="scard" style={{ padding: '12px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase' }}>Days Remaining</p>
                    <p style={{ fontSize: '16px', fontWeight: '700' }}>{progressResult.remainingDays} <span style={{ fontSize: '12px', fontWeight: '400' }}>Days</span></p>
                    <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '4px' }}>
                       In current cycle
                    </div>
                 </div>
              </div>

              <div style={{ marginTop: '20px', padding: '12px', background: 'var(--surface-3)', borderRadius: '8px', borderLeft: '3px solid var(--amber)' }}>
                 <div style={{ display: 'flex', gap: '8px' }}>
                    <FiInfo size={16} color="var(--amber)" style={{ marginTop: '2px' }} />
                    <div>
                       <h4 style={{ fontSize: '13px', color: 'var(--text-1)', marginBottom: '4px' }}>Smart Insight</h4>
                       <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.5' }}>
                          {progressResult.isHigher 
                            ? `You are consuming units faster than last month. To match last month's bill, try to keep your daily usage below ${Math.round((service?.lastBilledUnits || service?.billedUnits || 100) / 30)} units.`
                            : `Great job! You are on track to save ${formatInr(Math.abs((service?.billAmount || 0) - progressResult.predictedBill))} compared to last month.`}
                       </p>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {mode === 'progress' && !progressResult && currentReading && (
            <div className="state-box" style={{ padding: '20px', marginTop: '20px' }}>
               <FiAlertCircle size={24} color="var(--red)" />
               <p style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '8px' }}>
                  Invalid reading. Must be greater than last month's reading ({manualLastReading || service?.closingRdg || '—'}).
               </p>
            </div>
          )}
        </div>

        <div className="dialog__footer" style={{ marginTop: '24px', flexShrink: 0 }}>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

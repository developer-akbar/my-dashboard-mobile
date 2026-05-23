import { useState, useMemo, useEffect, useRef } from 'react';
import { FiX, FiZap, FiPlus, FiMinus, FiChevronDown } from 'react-icons/fi';
import { LuCalculator } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG, DEFAULT_COMMERCIAL_CONFIG } from '../utils/billing.js';
import { formatInr } from '../../../shared/utils/index.js';
import { db } from '../../../shared/db/storage.js';

export function BillCalculator({ open, service, onClose }) {
  const { t } = useTranslation();
  const [currentRdg, setCurrentRdg] = useState('');
  const [error, setError] = useState('');
  const [serviceType, setServiceType] = useState('domestic');
  const [configs, setConfigs] = useState({ domestic: DEFAULT_DOMESTIC_CONFIG, commercial: DEFAULT_COMMERCIAL_CONFIG });
  const inputRef = useRef(null);

  const lastRdg = service?.closingRdg || 0;
  const load = service?.ctrLoad || 0;

  useEffect(() => {
    async function loadConfigs() {
      const d = await db.getSetting('calc_config_domestic', DEFAULT_DOMESTIC_CONFIG);
      const c = await db.getSetting('calc_config_commercial', DEFAULT_COMMERCIAL_CONFIG);
      setConfigs({ domestic: d, commercial: c });
    }
    if (open) {
      loadConfigs();
      setCurrentRdg('');
      setError('');
      // Try to guess service type from category
      const cat = (service?.category || '').toUpperCase();
      if (cat.includes('COM') || cat.includes('LT-II') || cat.includes('LT2')) {
        setServiceType('commercial');
      } else {
        setServiceType('domestic');
      }
      
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, service]);

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

  const estimation = useMemo(() => {
    const curr = parseFloat(currentRdg);
    if (isNaN(curr)) return null;
    if (curr < lastRdg) {
      setError(t('rdg_less_than_last', { last: lastRdg }));
      return null;
    }
    setError('');
    const config = serviceType === 'domestic' ? configs.domestic : configs.commercial;
    return calculateEstimatedBill(curr - lastRdg, load, config);
  }, [currentRdg, lastRdg, load, serviceType, configs, t]);

  if (!open) return null;

  return (
    <div className="overlay overlay--center" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="sheet__header" style={{ padding: '0 0 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="sheet__icon"><LuCalculator size={18} /></div>
          <div style={{ flex: 1 }}>
            <p className="sheet__eyebrow">{service?.label || t('electricity')}</p>
            <h3 className="sheet__title">{t('calculate_next_bill')}</h3>
          </div>
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <div className="sheet__form" style={{ padding: '20px 0' }}>
          <div className="field">
             <span className="field__label">{t('service_type', 'Service Type')}</span>
             <div className="seg" style={{ display: 'inline-flex', width: 'fit-content' }}>
                <button 
                  type="button"
                  className={`seg__btn ${serviceType === 'domestic' ? 'seg__btn--active' : ''}`}
                  onClick={() => setServiceType('domestic')}
                >
                  {t('domestic', 'Domestic')}
                </button>
                <button 
                  type="button"
                  className={`seg__btn ${serviceType === 'commercial' ? 'seg__btn--active' : ''}`}
                  onClick={() => setServiceType('commercial')}
                >
                  {t('commercial', 'Commercial')}
                </button>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <span className="field__label">{t('last_reading')}</span>
              <div className="field__input field__input--mono" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-3)', border: 'none' }}>
                {lastRdg.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="currentRdg">{t('current_reading')}</label>
              <input
                ref={inputRef}
                id="currentRdg"
                type="number"
                className={`field__input field__input--mono ${error ? 'field__input--error' : ''}`}
                placeholder={t('enter_current_reading')}
                value={currentRdg}
                onChange={e => setCurrentRdg(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
          {error && <span className="field__hint field__hint--error" style={{ marginTop: '-12px', display: 'block', marginBottom: '12px' }}>{error}</span>}

          {estimation && (
            <div className="estimation-results" style={{ marginTop: '8px', padding: '16px', background: 'var(--primary-dim)', borderRadius: 'var(--radius)', border: '1px solid var(--primary-glow)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px dashed var(--primary-hi)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{t('units_consumed')}</span>
                <b style={{ color: 'var(--primary-hi)', fontSize: '16px' }}>{estimation.units.toLocaleString('en-IN')} u</b>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Energy Charges (EC)</span>
                  <span style={{ fontWeight: 500 }}>{formatInr(estimation.ec)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Fixed Charges (FC)</span>
                  <span style={{ fontWeight: 500 }}>{formatInr(estimation.fc)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Electricity Duty (ED)</span>
                  <span style={{ fontWeight: 500 }}>{formatInr(estimation.ed)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-2)' }}>Customer Charges (CC)</span>
                  <span style={{ fontWeight: 500 }}>{formatInr(estimation.cc)}</span>
                </div>
                {estimation.fac > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-2)' }}>Fuel Adjustment (FAC)</span>
                    <span style={{ fontWeight: 500 }}>{formatInr(estimation.fac)}</span>
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--primary-glow)', fontSize: '15px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{t('est_total')}</span>
                  <b style={{ color: 'var(--primary-hi)', fontSize: '18px' }}>{formatInr(estimation.total)}</b>
                </div>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '12px', fontStyle: 'italic' }}>* {t('calculator_note')}</p>
            </div>
          )}
        </div>

        <div className="dialog__footer">
          <button className="btn btn--ghost" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

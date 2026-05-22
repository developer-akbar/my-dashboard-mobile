import { useEffect, useMemo, useState, useRef } from 'react';
import { FiX, FiZap } from 'react-icons/fi';
import { isValidServiceNumber } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';

export function ServiceDialog({ open, service, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const labelRef = useRef(null);
  const bulkRef = useRef(null);

  useEffect(() => {
    if (open) { 
      setLabel(service?.label || ''); 
      setServiceNumber(service?.serviceNumber || ''); 
      setIsBulk(false);
      setBulkInput('');
      
      // Auto-focus Label field with a slightly longer delay for reliability
      const timer = setTimeout(() => {
        if (!service && !isBulk) {
           if (labelRef.current) labelRef.current.focus();
        } else if (service) {
          if (labelRef.current) {
            labelRef.current.focus();
            const len = service.label.length;
            labelRef.current.setSelectionRange(len, len);
          }
        }
      }, 300);
      return () => clearTimeout(timer);
    }
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [service, open, onClose]);

  // Focus bulk textarea when switching to bulk mode
  useEffect(() => {
    if (isBulk) {
      setTimeout(() => {
        if (bulkRef.current) bulkRef.current.focus();
      }, 100);
    }
  }, [isBulk]);

  const numError = useMemo(() => {
    if (isBulk || !serviceNumber) return '';
    return isValidServiceNumber(serviceNumber) ? '' : t('must_be_13_digits');
  }, [serviceNumber, isBulk, t]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (isBulk) {
      // Parse bulk input. Format: "Label:Number" or just "Number"
      // Split by newlines, commas, or semicolons first
      const lines = bulkInput.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
      
      const entries = lines.map(line => {
        let label = '';
        let number = '';
        
        if (line.includes(':')) {
          const parts = line.split(':');
          number = parts.pop().trim();
          label = parts.join(':').trim(); // Handle multiple colons by re-joining
        } else {
          number = line.trim();
        }
        
        // Clean number and check if valid
        number = number.replace(/\D/g, '');
        return { label, number };
      }).filter(entry => entry.number.length === 13);

      if (entries.length === 0) {
        toast.error('No valid 13-digit service numbers found');
        return;
      }
      
      setSaving(true);
      try {
        await onSubmit({ isBulk: true, entries });
        onClose();
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!isValidServiceNumber(serviceNumber)) return;
    setSaving(true);
    try { await onSubmit({ label: label.trim(), serviceNumber }); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet__handle" />

        <div className="sheet__header">
          <div className="sheet__icon"><FiZap size={16} /></div>
          <div style={{ flex: 1 }}>
            <p className="sheet__eyebrow">{service ? t('edit_service') : (isBulk ? t('bulk_add') : t('new_service'))}</p>
            <h2 className="sheet__title">{service ? t('update_details') : (isBulk ? t('add_multiple_services') : t('add_apspdcl_service'))}</h2>
          </div>
          {!service && (
            <button 
              type="button" 
              className={`btn btn--xs ${isBulk ? 'btn--primary' : 'btn--ghost'}`} 
              onClick={() => setIsBulk(!isBulk)}
              style={{ marginRight: '8px' }}
            >
              {isBulk ? t('single_mode') : t('bulk_mode')}
            </button>
          )}
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <form className="sheet__form" onSubmit={handleSubmit}>
          {isBulk ? (
            <label className="field">
              <span className="field__label">{t('service_numbers_comma')}</span>
              <textarea
                ref={bulkRef}
                className="field__input"
                style={{ height: '120px', fontFamily: 'monospace', paddingTop: '10px' }}
                value={bulkInput}
                onChange={e => setBulkInput(e.target.value)}
                placeholder="23233..., 23233..."
                required
              />
              <span className="field__hint">{t('bulk_hint')}</span>
            </label>
          ) : (
            <>
              <label className="field">
                <span className="field__label">{t('label')} <span className="field__optional">{t('optional')}</span></span>
                <input 
                  ref={labelRef}
                  className="field__input" 
                  value={label} 
                  onChange={e => setLabel(e.target.value)} 
                  placeholder={t('label_placeholder')} 
                />
              </label>

              <label className="field">
                <span className="field__label">{t('service_number')}</span>
                <input
                  className={`field__input field__input--mono ${numError ? 'field__input--error' : ''}`}
                  value={serviceNumber}
                  inputMode="numeric"
                  maxLength={13}
                  onChange={e => setServiceNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="0000000000000"
                  required
                />
                {serviceNumber && (
                  <span className={`field__hint ${numError ? 'field__hint--error' : 'field__hint--ok'}`}>
                    {numError || t('valid_format')}
                  </span>
                )}
              </label>
            </>
          )}

          <div className="sheet__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn--primary" disabled={saving || (!isBulk && (!!numError || serviceNumber.length !== 13)) || (isBulk && !bulkInput.trim())}>
              {saving ? t('saving') : (service ? t('save_changes') : t('add_service'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
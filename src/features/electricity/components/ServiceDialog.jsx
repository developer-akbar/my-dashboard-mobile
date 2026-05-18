import { useEffect, useMemo, useState, useRef } from 'react';
import { FiX, FiZap } from 'react-icons/fi';
import { isValidServiceNumber } from '../../../shared/utils/index.js';
import { useTranslation } from 'react-i18next';

export function ServiceDialog({ open, service, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const { t } = useTranslation();
  const labelRef = useRef(null);

  useEffect(() => {
    if (open) { 
      setLabel(service?.label || ''); 
      setServiceNumber(service?.serviceNumber || ''); 
      
      // Auto-focus Label field with a slightly longer delay for reliability
      const timer = setTimeout(() => {
        if (labelRef.current) {
          labelRef.current.focus();
          // Move cursor to end of text if editing
          if (service?.label) {
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

  const numError = useMemo(() => {
    if (!serviceNumber) return '';
    return isValidServiceNumber(serviceNumber) ? '' : t('must_be_13_digits');
  }, [serviceNumber, t]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
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
          <div>
            <p className="sheet__eyebrow">{service ? t('edit_service') : t('new_service')}</p>
            <h2 className="sheet__title">{service ? t('update_details') : t('add_apspdcl_service')}</h2>
          </div>
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <form className="sheet__form" onSubmit={handleSubmit}>
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

          <div className="sheet__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn btn--primary" disabled={saving || !!numError || serviceNumber.length !== 13}>
              {saving ? t('saving') : service ? t('save_changes') : t('add_service')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
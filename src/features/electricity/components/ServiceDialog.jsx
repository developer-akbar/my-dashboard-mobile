import { useEffect, useMemo, useState } from 'react';
import { FiX, FiZap } from 'react-icons/fi';
import { isValidServiceNumber } from '../../../shared/utils/index.js';

export function ServiceDialog({ open, service, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setLabel(service?.label || ''); setServiceNumber(service?.serviceNumber || ''); }
  }, [service, open]);

  const numError = useMemo(() => {
    if (!serviceNumber) return '';
    return isValidServiceNumber(serviceNumber) ? '' : 'Must be a 13-digit number';
  }, [serviceNumber]);

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
            <p className="sheet__eyebrow">{service ? 'Edit service' : 'New service'}</p>
            <h2 className="sheet__title">{service ? 'Update details' : 'Add APSPDCL service'}</h2>
          </div>
          <button className="icon-btn sheet__close" onClick={onClose}><FiX size={18} /></button>
        </div>

        <form className="sheet__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Label <span className="field__optional">optional</span></span>
            <input className="field__input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Home, Office, Shop…" />
          </label>

          <label className="field">
            <span className="field__label">Service number</span>
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
                {numError || '✓ Valid format'}
              </span>
            )}
          </label>

          <div className="sheet__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving || !!numError || serviceNumber.length !== 13}>
              {saving ? 'Saving…' : service ? 'Save changes' : 'Add service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
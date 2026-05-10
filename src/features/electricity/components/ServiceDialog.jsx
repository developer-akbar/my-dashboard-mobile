import { useEffect, useMemo, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { isValidServiceNumber } from '../../../shared/utils/index.js';

export function ServiceDialog({ open, service, onClose, onSubmit }) {
  const [label, setLabel] = useState('');
  const [serviceNumber, setServiceNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(service?.label || '');
      setServiceNumber(service?.serviceNumber || '');
    }
  }, [service, open]);

  const numError = useMemo(() => {
    if (!serviceNumber) return '';
    return isValidServiceNumber(serviceNumber)
      ? ''
      : 'Enter the 13-digit APSPDCL service number';
  }, [serviceNumber]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValidServiceNumber(serviceNumber)) return;
    setSaving(true);
    try {
      await onSubmit({ label: label.trim(), serviceNumber });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog__header">
          <div>
            <p className="dialog__eyebrow">
              {service ? 'Edit service' : 'New service'}
            </p>
            <h2 className="dialog__title">
              {service ? 'Update APSPDCL service' : 'Add APSPDCL service'}
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <FiX size={18} />
          </button>
        </div>

        <form className="dialog__form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Label</span>
            <input
              className="field__input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Office, Shop…"
            />
          </label>

          <label className="field">
            <span className="field__label">Service number</span>
            <input
              className={`field__input ${numError ? 'field__input--error' : ''}`}
              value={serviceNumber}
              inputMode="numeric"
              maxLength={13}
              onChange={(e) =>
                setServiceNumber(e.target.value.replace(/\D/g, ''))
              }
              placeholder="1234567890123"
              required
            />
            {numError && <span className="field__error">{numError}</span>}
          </label>

          <div className="dialog__footer">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={
                saving || !!numError || serviceNumber.length !== 13
              }
            >
              {saving
                ? 'Saving…'
                : service
                ? 'Save changes'
                : 'Add service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

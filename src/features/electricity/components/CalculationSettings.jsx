import { useState, useEffect } from 'react';
import { FiArrowLeft, FiPlus, FiTrash2, FiSave, FiRefreshCw } from 'react-icons/fi';
import { db } from '../../../shared/db/storage.js';
import { DEFAULT_DOMESTIC_CONFIG, DEFAULT_COMMERCIAL_CONFIG } from '../utils/billing.js';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export function CalculationSettings({ onBack }) {
  const { t } = useTranslation();
  const [domestic, setDomestic] = useState(null);
  const [commercial, setCommercial] = useState(null);
  const [editingId, setEditingId] = useState(null); // 'domestic' or 'commercial'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const d = await db.getSetting('calc_config_domestic', DEFAULT_DOMESTIC_CONFIG);
      const c = await db.getSetting('calc_config_commercial', DEFAULT_COMMERCIAL_CONFIG);
      setDomestic(d);
      setCommercial(c);
      setLoading(false);
    }
    load();
  }, []);

  // Handle Esc and Back button
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (editingId) setEditingId(null);
        else onBack();
      }
    };
    const handleBack = (e) => {
      if (e.detail?.handled) return;
      if (editingId) {
        setEditingId(null);
        if (e.detail) e.detail.handled = true;
      } else {
        onBack();
        if (e.detail) e.detail.handled = true;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('app-back-button', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('app-back-button', handleBack);
    };
  }, [editingId, onBack]);

  const handleSave = async (id, config) => {
    try {
      await db.setSetting(`calc_config_${id}`, config);
      toast.success(t('settings_saved', 'Settings saved successfully'));
      setEditingId(null);
      if (id === 'domestic') setDomestic(config);
      else setCommercial(config);
    } catch (e) {
      toast.error(t('save_failed', 'Failed to save settings'));
    }
  };

  const resetToDefault = (id) => {
    const defaultConfig = id === 'domestic' ? DEFAULT_DOMESTIC_CONFIG : DEFAULT_COMMERCIAL_CONFIG;
    if (id === 'domestic') setDomestic({ ...defaultConfig });
    else setCommercial({ ...defaultConfig });
    toast.success(t('reset_to_defaults', 'Reset to defaults'));
  };

  if (loading) return <div className="state-box"><FiRefreshCw className="spin" /></div>;

  return (
    <div className="page">
      <header className="page__header" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '-8px' }}>
        <button className="icon-btn" onClick={onBack} style={{ width: '40px', height: '40px' }}><FiArrowLeft size={20} /></button>
        <div style={{ flex: 1 }}>
          <h1 className="page__title" style={{ fontSize: '20px' }}>{t('calc_settings', 'Calculation Settings')}</h1>
          <p style={{ fontSize: '12px' }}>{t('calc_settings_desc', 'Configure slabs and charges for billing')}</p>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '20px', paddingBottom: '80px', marginTop: '10px' }}>
        <ConfigCard 
          title={t('domestic_slabs', 'Domestic (LT-I)')}
          config={domestic}
          isEditing={editingId === 'domestic'}
          onEdit={() => setEditingId('domestic')}
          onCancel={() => { setEditingId(null); }}
          onSave={(cfg) => handleSave('domestic', cfg)}
          onReset={() => resetToDefault('domestic')}
        />

        <ConfigCard 
          title={t('commercial_slabs', 'Commercial (LT-II)')}
          config={commercial}
          isEditing={editingId === 'commercial'}
          onEdit={() => setEditingId('commercial')}
          onCancel={() => { setEditingId(null); }}
          onSave={(cfg) => handleSave('commercial', cfg)}
          onReset={() => resetToDefault('commercial')}
        />
      </div>

      <HelpFooter t={t} />
    </div>
  );
}

function ConfigCard({ title, config, isEditing, onEdit, onSave, onCancel, onReset }) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(config);

  useEffect(() => {
    setLocal(config);
  }, [config, isEditing]);

  const addSlab = () => {
    const lastSlab = local.slabs[local.slabs.length - 1];
    const newMin = lastSlab ? lastSlab.max + 1 : 0;
    setLocal({
      ...local,
      slabs: [...local.slabs, { min: newMin, max: 999999, rate: 0 }]
    });
  };

  const removeSlab = (index) => {
    const newSlabs = local.slabs.filter((_, i) => i !== index);
    setLocal({ ...local, slabs: newSlabs });
  };

  const updateSlab = (index, field, value) => {
    const newSlabs = [...local.slabs];
    newSlabs[index] = { ...newSlabs[index], [field]: parseFloat(value) || 0 };
    setLocal({ ...local, slabs: newSlabs });
  };

  if (!isEditing) {
    return (
      <div className="scard" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px' }}>{title}</h3>
          <button className="btn btn--ghost btn--xs" onClick={onEdit}>{t('edit_slabs', 'Edit Slabs')}</button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <ReadOnlyField label="Fixed Charges" value={`₹${config.fixedChargesPerKW} / kW`} />
          <ReadOnlyField label="Electricity Duty" value={`${config.electricityDutyPct}%`} />
          <ReadOnlyField label="FAC / Unit" value={`₹${config.facPerUnit}`} />
        </div>

        <h4 style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slab Presets</h4>
        <div style={{ background: 'var(--surface-2)', borderRadius: '8px', overflow: 'hidden' }}>
          {config.slabs.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: i < config.slabs.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span className="mono-sm">{s.min} - {s.max} units</span>
              <b className="mono-sm">₹{s.rate.toFixed(2)} / unit</b>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="scard" style={{ padding: '20px', borderColor: 'var(--primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '16px' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
           <button className="btn btn--ghost btn--xs" onClick={onReset}>{t('reset', 'Reset')}</button>
           <button className="btn btn--ghost btn--xs" onClick={onCancel}>{t('cancel', 'Cancel')}</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <EditableField 
          label="Fixed Charges (₹/kW)" 
          value={local.fixedChargesPerKW} 
          onChange={v => setLocal({...local, fixedChargesPerKW: parseFloat(v) || 0})} 
        />
        <EditableField 
          label="Electricity Duty %" 
          value={local.electricityDutyPct} 
          onChange={v => setLocal({...local, electricityDutyPct: parseFloat(v) || 0})} 
        />
        <EditableField 
          label="FAC per Unit (₹)" 
          value={local.facPerUnit} 
          onChange={v => setLocal({...local, facPerUnit: parseFloat(v) || 0})} 
        />
      </div>

      <h4 style={{ fontSize: '13px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '12px' }}>Slabs</h4>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 4px' }}>Min</th>
              <th style={{ padding: '8px 4px' }}>Max</th>
              <th style={{ padding: '8px 4px' }}>Rate</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {local.slabs.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 4px' }}>
                  <input 
                    type="number" 
                    className="field__input" 
                    style={{ padding: '4px 8px', height: '32px', width: '60px' }} 
                    value={s.min} 
                    onChange={e => updateSlab(i, 'min', e.target.value)}
                  />
                </td>
                <td style={{ padding: '8px 4px' }}>
                  <input 
                    type="number" 
                    className="field__input" 
                    style={{ padding: '4px 8px', height: '32px', width: '80px' }} 
                    value={s.max} 
                    onChange={e => updateSlab(i, 'max', e.target.value)}
                  />
                </td>
                <td style={{ padding: '8px 4px' }}>
                  <input 
                    type="number" 
                    step="0.01"
                    className="field__input" 
                    style={{ padding: '4px 8px', height: '32px', width: '70px' }} 
                    value={s.rate} 
                    onChange={e => updateSlab(i, 'rate', e.target.value)}
                  />
                </td>
                <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                  <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => removeSlab(i)}><FiTrash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button type="button" className="btn btn--ghost btn--xs" onClick={addSlab} style={{ marginTop: '12px', width: '100%', borderStyle: 'dashed' }}>
        <FiPlus /> Add Slab
      </button>

      <button 
        className="btn btn--primary" 
        style={{ width: '100%', marginTop: '24px' }} 
        onClick={() => onSave(local)}
      >
        <FiSave style={{ marginRight: '8px' }} /> {t('save_configuration', 'Save Configuration')}
      </button>
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '2px' }}>{label}</p>
      <b style={{ fontSize: '14px' }}>{value}</b>
    </div>
  );
}

function EditableField({ label, value, onChange }) {
  return (
    <label className="field" style={{ marginBottom: 0 }}>
      <span className="field__label" style={{ fontSize: '11px' }}>{label}</span>
      <input 
        type="number" 
        step="0.01"
        className="field__input" 
        style={{ height: '36px', padding: '0 10px' }}
        value={value} 
        onChange={e => onChange(e.target.value)} 
      />
    </label>
  );
}

export function HelpFooter({ t }) {
  return (
    <div style={{ marginTop: '40px', padding: '20px', background: 'var(--red-dim)', borderRadius: '12px', border: '1px solid var(--red-glow)', textAlign: 'center' }}>
      <h4 style={{ color: 'var(--red)', fontSize: '14px', marginBottom: '8px' }}>Asking for Bribe?</h4>
      <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>Call <b style={{ color: 'var(--text-1)' }}>1064</b> or send a mail to <br/> <a href="mailto:complaints.acb@ap.gov.in" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>complaints.acb@ap.gov.in</a></p>
    </div>
  );
}

import { useState, useMemo, useEffect } from 'react';
import { FiX, FiInfo, FiZap, FiPlus, FiMinus, FiTrash2 } from 'react-icons/fi';
import { calculateEstimatedBill, DEFAULT_DOMESTIC_CONFIG } from '../utils/billing';
import { formatInr } from '../../../shared/utils';
import { db } from '../../../shared/db/storage';

const COMMON_APPLIANCES = [
  { name: '1.5 Ton AC', watts: 1500, icon: '❄️' },
  { name: 'Ceiling Fan', watts: 75, icon: '🌀' },
  { name: 'LED TV (55")', watts: 100, icon: '📺' },
  { name: 'Fridge', watts: 200, icon: '🧊' },
  { name: 'Geyser', watts: 2000, icon: '🚿' },
  { name: 'LED Bulb', watts: 12, icon: '💡' },
  { name: 'Laptop', watts: 60, icon: '💻' },
  { name: 'Washing Machine', watts: 500, icon: '🧺' },
];

const DEFAULT_SELECTION = [
  { id: 1, name: '1.5 Ton AC', watts: 1500, hours: 8, count: 1, icon: '❄️' },
  { id: 2, name: 'Ceiling Fan', watts: 75, hours: 12, count: 3, icon: '🌀' },
];

export function ApplianceCalculator({ open, onClose }) {
  const [selectedAppliances, setSelectedAppliances] = useState(DEFAULT_SELECTION);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved appliances on mount
  useEffect(() => {
    if (open) {
      (async () => {
        const saved = await db.getSetting('saved_appliances');
        if (saved && Array.isArray(saved)) {
          setSelectedAppliances(saved);
        }
        setIsLoaded(true);
      })();
    }
  }, [open]);

  // Save appliances when they change
  useEffect(() => {
    if (isLoaded) {
      db.setSetting('saved_appliances', selectedAppliances);
    }
  }, [selectedAppliances, isLoaded]);

  const addAppliance = (app) => {
    setSelectedAppliances(prev => [
      ...prev,
      { ...app, id: Date.now(), hours: 8, count: 1 }
    ]);
  };

  const removeAppliance = (id) => {
    setSelectedAppliances(prev => prev.filter(a => a.id !== id));
  };

  const updateAppliance = (id, field, value) => {
    setSelectedAppliances(prev => prev.map(a => 
      a.id === id ? { ...a, [field]: value } : a
    ));
  };

  const totals = useMemo(() => {
    const dailyKwh = selectedAppliances.reduce((sum, a) => {
      return sum + (a.watts * a.hours * a.count) / 1000;
    }, 0);
    const monthlyUnits = dailyKwh * 30;
    const bill = calculateEstimatedBill(monthlyUnits, 0, DEFAULT_DOMESTIC_CONFIG);
    
    return {
      dailyKwh: dailyKwh.toFixed(2),
      monthlyUnits: Math.round(monthlyUnits),
      monthlyCost: bill.total
    };
  }, [selectedAppliances]);

  if (!open) return null;

  return (
    <div className="overlay overlay--center" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ width: '600px', maxWidth: '95vw', position: 'relative' }}>
        <header className="dialog__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="sidebar__logo" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', width: '32px', height: '32px' }}>
              <FiZap size={18} />
            </div>
            <h2 className="dialog__title">Appliance Cost Estimator</h2>
          </div>
          <button className="icon-btn-ghost" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px' }}><FiX size={20} /></button>
        </header>

        <div className="dialog__body" style={{ maxHeight: '75vh', overflowY: 'auto', padding: '0 16px 16px' }}>
          
          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-1)', padding: '16px 0' }}>
            <div className="scard" style={{ padding: '20px', background: 'var(--surface-2)', border: '1px solid var(--primary-glow)', boxShadow: 'var(--shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase' }}>Monthly Est. Bill</p>
                  <h3 style={{ fontSize: '28px', color: 'var(--primary-hi)' }}>{formatInr(totals.monthlyCost)}</h3>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase' }}>Consumption</p>
                  <h3 style={{ fontSize: '22px' }}>{totals.monthlyUnits} <span style={{ fontSize: '13px', fontWeight: '400', color: 'var(--text-3)' }}>Units</span></h3>
                </div>
              </div>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', gap: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                    <strong>Daily:</strong> {totals.dailyKwh} kWh
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
                    <strong>Avg Rate:</strong> {formatInr(Math.round(totals.monthlyCost / (totals.monthlyUnits || 1) * 100)/100)} / u
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '8px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--text-1)' }}>Your Appliances</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedAppliances.map(app => (
                <div key={app.id} className="scard" style={{ padding: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>{app.icon || '🔌'}</span>
                      <div>
                        <h4 style={{ fontSize: '14px', margin: 0 }}>{app.name}</h4>
                        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: 0 }}>{app.watts} Watts</p>
                      </div>
                    </div>
                    <button className="icon-btn-ghost" style={{ color: 'var(--red)' }} onClick={() => removeAppliance(app.id)}>
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="field__label" style={{ fontSize: '11px' }}>Qty</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button className="icon-btn-ghost icon-btn--sm" onClick={() => updateAppliance(app.id, 'count', Math.max(1, app.count - 1))}><FiMinus size={12} /></button>
                        <span style={{ fontSize: '14px', minWidth: '20px', textAlign: 'center' }}>{app.count}</span>
                        <button className="icon-btn-ghost icon-btn--sm" onClick={() => updateAppliance(app.id, 'count', app.count + 1)}><FiPlus size={12} /></button>
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="field__label" style={{ fontSize: '11px' }}>Hours/Day</label>
                      <input 
                        type="range" min="1" max="24" step="0.5" value={app.hours} 
                        onChange={(e) => updateAppliance(app.id, 'hours', parseFloat(e.target.value))}
                        style={{ width: '100%', height: '4px' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                         <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{app.hours}h</span>
                         <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: '600' }}>{((app.watts * app.hours * app.count) / 1000).toFixed(1)} u</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--text-1)' }}>Add Appliance</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
              {COMMON_APPLIANCES.map(app => (
                <button 
                  key={app.name} 
                  className="btn btn--ghost" 
                  style={{ justifyContent: 'flex-start', padding: '10px 12px', fontSize: '12px', height: 'auto', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', border: '1px solid var(--border)' }}
                  onClick={() => addAppliance(app)}
                >
                  <span style={{ fontSize: '18px' }}>{app.icon}</span>
                  <span style={{ fontWeight: '500' }}>{app.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="highlight" style={{ marginTop: '30px', background: 'var(--surface-3)', padding: '16px', borderRadius: '8px' }}>
             <div style={{ display: 'flex', gap: '10px', color: 'var(--primary)' }}>
                <FiInfo size={18} style={{ marginTop: '2px' }} />
                <div>
                   <h4 style={{ fontSize: '14px', marginBottom: '4px', fontWeight: '700' }}>Saving Tips</h4>
                   <p style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: '1.6' }}>
                      {totals.monthlyUnits > 200 
                        ? "You've crossed 200 units. Slabs are more expensive now. Reducing AC usage by 1 hour daily could save you ~₹150/month."
                        : "Keeping your consumption below 125 units will keep you in the lower slab rate (₹4.50 instead of ₹6.00)."}
                   </p>
                </div>
             </div>
          </div>
        </div>
        
        <div className="dialog__footer">
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

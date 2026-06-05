import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowRight, FiClock, FiAlertTriangle, FiCheckCircle, FiChevronDown, FiChevronUp, FiRefreshCw } from 'react-icons/fi';
import { migrateServicePrefix, getMigrationHistory } from '../utils/migration.js';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog.jsx';
import toast from 'react-hot-toast';

export function PrefixMigration() {
  const { t } = useTranslation();
  const [oldPrefix, setOldPrefix] = useState('');
  const [newPrefix, setNewPrefix] = useState('');
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await getMigrationHistory();
    setHistory(data);
  };

  const handleMigrateClick = () => {
    if (oldPrefix.length !== 5 || newPrefix.length !== 5) {
      toast.error(t('invalid_prefix'));
      return;
    }
    setConfirmOpen(true);
  };

  const proceedWithMigration = async () => {
    setConfirmOpen(false);
    setIsMigrating(true);
    setStatus({ key: 'finding_services' });

    try {
      const count = await migrateServicePrefix(oldPrefix, newPrefix, (key, params) => {
        setStatus({ key, params });
      });

      if (count > 0) {
        toast.success(t('migration_completed', { count }));
        setOldPrefix('');
        setNewPrefix('');
        loadHistory();
      } else {
        toast.error(t('no_matching_services', { prefix: oldPrefix }));
      }
    } catch (err) {
      console.error('[migration] Error:', err);
      if (err.message.startsWith('validation_failed|')) {
        const number = err.message.split('|')[1];
        toast.error(t('migration_failed_invalid', { number }), { duration: 6000 });
      } else {
        toast.error(err.message || 'Migration failed');
      }
    } finally {
      setIsMigrating(false);
      setStatus(null);
    }
  };

  return (
    <div className="scard" style={{ padding: '20px', marginTop: '20px' }}>
      <h3 style={{ marginBottom: '16px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FiArrowRight size={18} color="var(--primary)" />
        {t('prefix_migration')}
      </h3>

      <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.5', marginBottom: '20px' }}>
        Batch update service numbers if your region's prefix has changed.
      </p>

      {status && (
        <div className="scard" style={{ padding: '12px', background: 'var(--primary-dim)', border: '1px solid var(--primary-hi)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FiRefreshCw size={16} className="spin" color="var(--primary-hi)" />
          <span style={{ fontSize: '12px', color: 'var(--text-1)', fontWeight: '600' }}>
            {t(`status_${status.key}`, status.params)}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="field">
          <label className="field__label">{t('old_prefix')}</label>
          <input 
            type="text" 
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            className="field__input" 
            placeholder="e.g. 12345"
            value={oldPrefix}
            onChange={e => setOldPrefix(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="field">
          <label className="field__label">{t('new_prefix')}</label>
          <input 
            type="text" 
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
            className="field__input" 
            placeholder="e.g. 54321"
            value={newPrefix}
            onChange={e => setNewPrefix(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </div>

      <button 
        className="btn btn--primary" 
        style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}
        onClick={handleMigrateClick}
        disabled={isMigrating || oldPrefix.length < 5 || newPrefix.length < 5}
      >
        {isMigrating ? t('migration_in_progress') : t('migrate_now')}
      </button>

      {history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <button 
            className="btn btn--ghost" 
            style={{ width: '100%', justifyContent: 'space-between', padding: '12px', color: 'var(--text-2)' }}
            onClick={() => setShowHistory(!showHistory)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600' }}>
              <FiClock size={16} /> {t('migration_history')}
            </span>
            {showHistory ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
          </button>

          {showHistory && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map(item => (
                <div key={item.id} className="scard" style={{ padding: '12px', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary)' }}>
                      {t('migration_desc', { old: item.oldPrefix, new: item.newPrefix })}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                      {new Date(item.date).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FiCheckCircle size={12} color="var(--green)" />
                    <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                      {item.count} services updated
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={t('prefix_migration')}
        description={t('migration_warning')}
        confirmText={t('migrate')}
        onConfirm={proceedWithMigration}
        onClose={() => setConfirmOpen(false)}
        isDanger={true}
      />
    </div>
  );
}

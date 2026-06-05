import { useMemo } from 'react';
import { FiGrid, FiZap, FiBarChart2, FiAward, FiShare2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useElectricityServices } from './hooks/useElectricityServices.js';
import { formatInr } from '../../shared/utils/index.js';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { Loader } from '../../shared/components/Loader.jsx';

export function OverviewTab() {
  const { t } = useTranslation();
  const { services, loading } = useElectricityServices();

  const activeServices = useMemo(() => services.filter(s => !s.isDeleted), [services]);

  const overviewData = useMemo(() => {
    if (activeServices.length === 0) return null;

    let totalDue = 0;
    let totalUnitsThisMonth = 0;
    let totalSpentThisYear = 0;
    let totalUnitsThisYear = 0;
    
    const currentYear = new Date().getFullYear();

    const comparisons = activeServices.map(s => {
      const units = s.lastBilledUnits || 0;
      const amt = s.lastAmountDue || s.paidAmount || 0;
      const rate = units > 0 ? amt / units : 0;
      
      totalDue += (s.lastStatus === 'DUE' ? (s.lastAmountDue || 0) : 0);
      totalUnitsThisMonth += units;

      // Calculate year totals
      if (s.paymentHistory) {
        s.paymentHistory.forEach(ph => {
          if (new Date(ph.date).getFullYear() === currentYear) {
            totalSpentThisYear += Number(ph.amount);
          }
        });
      }
      if (s.trendData) {
        s.trendData.forEach(td => {
          if (parseInt(td.month.split('-')[0]) === currentYear) {
            totalUnitsThisYear += Number(td.billedUnits || 0);
          }
        });
      }

      return {
        id: s.id,
        name: s.label || s.customerName || t('untitled'),
        units,
        amount: amt,
        rate
      };
    });

    // Sort comparisons by effective rate
    comparisons.sort((a, b) => a.rate - b.rate);

    return { totalDue, totalUnitsThisMonth, totalSpentThisYear, totalUnitsThisYear, comparisons, currentYear };
  }, [activeServices, t]);

  const handleShareSummary = async () => {
    if (!overviewData) return;
    
    const text = `📊 *MyDashboard Electricity Summary ${overviewData.currentYear}*\n\n` +
                 `*Active Services:* ${activeServices.length}\n` +
                 `*Total Spent this Year:* ${formatInr(overviewData.totalSpentThisYear)}\n` +
                 `*Total Units this Year:* ${overviewData.totalUnitsThisYear.toLocaleString('en-IN')}u\n\n` +
                 `*Efficiency Ranking (₹/unit)*\n` +
                 overviewData.comparisons.map((c, i) => `${i === 0 ? '🏆' : '▪️'} ${c.name}: ₹${c.rate.toFixed(2)}/u`).join('\n') + `\n\n` +
                 `Tracked via My Dashboard app`;

    if (Capacitor.getPlatform() !== 'web') {
      try {
        await Share.share({ title: 'My Electricity Summary', text });
        return;
      } catch (e) { }
    }
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Electricity Summary', text });
        return;
      } catch (e) {}
    }
    
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Summary copied to clipboard!');
    } catch(e) {
      toast.error('Failed to copy');
    }
  };

  if (loading) {
    return <div className="page"><div className="state-box"><Loader size={22} /><p>Loading Overview...</p></div></div>;
  }

  if (activeServices.length === 0) {
    return (
      <div className="page" style={{ padding: '24px' }}>
        <div className="state-box">
          <FiGrid size={28} />
          <h3>No services</h3>
          <p>Add some electricity services to see your overview.</p>
        </div>
      </div>
    );
  }

  const { totalDue, totalUnitsThisMonth, totalSpentThisYear, totalUnitsThisYear, comparisons, currentYear } = overviewData;

  const maxAmount = Math.max(...comparisons.map(c => c.amount), 1);

  return (
    <div className="page">
      <div className="page__header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h2 className="page__title">Overview</h2>
            <p>Your electricity at a glance</p>
          </div>
          <button className="icon-btn-ghost" onClick={handleShareSummary} title="Share Summary">
            <FiShare2 size={20} />
          </button>
        </div>
      </div>

      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
          <div className="scard" style={{ padding: '16px', background: 'var(--primary-dim)', border: '1px solid var(--primary-glow)' }}>
            <p style={{ fontSize: '11px', color: 'var(--primary)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Total Spent ({currentYear})</p>
            <h2 style={{ fontSize: '24px', color: 'var(--text-1)' }}>{formatInr(totalSpentThisYear)}</h2>
          </div>
          <div className="scard" style={{ padding: '16px', background: 'var(--surface-2)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Total Units ({currentYear})</p>
            <h2 style={{ fontSize: '24px', color: 'var(--text-1)' }}>{totalUnitsThisYear.toLocaleString('en-IN')} <span style={{fontSize:'14px', fontWeight:400}}>u</span></h2>
          </div>
        </div>

        <h3 style={{ fontSize: '15px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiBarChart2 color="var(--primary)" /> Compare Services (This Month)
        </h3>

        <div className="scard" style={{ padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {comparisons.map((c, i) => (
              <div key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'flex-end' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {i === 0 && comparisons.length > 1 && <FiAward color="var(--amber)" size={14} title="Most Efficient" />}
                      {c.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{c.units} units • ₹{c.rate.toFixed(2)}/u</span>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>{formatInr(c.amount)}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--surface-3)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(c.amount / maxAmount) * 100}%`, height: '100%', background: i === 0 ? 'var(--green)' : 'var(--primary)', borderRadius: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
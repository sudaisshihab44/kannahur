import React, { useState, useEffect } from 'react';
import { QueueSettings } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props { settings: QueueSettings; onRefreshData: () => Promise<void>; }

export default function QueueSettingsTab({ settings, onRefreshData }: Props) {
  const cfg = settings.config ?? {};

  const [form, setForm] = useState({
    tokenPrefix: '', numberFormat: '001', dailyTokenReset: true, queueStartNumber: 1, maxDailyTokens: 500,
    emergencyTokenPrefix: 'EMR', vipTokenPrefix: 'VIP', walkInTokenPrefix: 'WLK',
    consultationStartTime: '09:00', consultationEndTime: '17:00',
    autoSkipTimeout: 180, maxWaitingTime: 120, minWaitTimeNotificationThreshold: 5, enableWhatsAppUpdates: true,
  });

  useEffect(() => {
    setForm(f => ({
      ...f,
      tokenPrefix: cfg.tokenPrefix ?? '',
      numberFormat: cfg.numberFormat ?? '001',
      dailyTokenReset: cfg.dailyTokenReset ?? true,
      queueStartNumber: cfg.queueStartNumber ?? 1,
      maxDailyTokens: cfg.maxDailyTokens ?? 500,
      emergencyTokenPrefix: cfg.emergencyTokenPrefix ?? 'EMR',
      vipTokenPrefix: cfg.vipTokenPrefix ?? 'VIP',
      walkInTokenPrefix: cfg.walkInTokenPrefix ?? 'WLK',
      consultationStartTime: cfg.consultationStartTime ?? '09:00',
      consultationEndTime: cfg.consultationEndTime ?? '17:00',
      autoSkipTimeout: cfg.autoSkipTimeout ?? 180,
      maxWaitingTime: cfg.maxWaitingTime ?? 120,
      minWaitTimeNotificationThreshold: cfg.minWaitTimeNotificationThreshold ?? 5,
      enableWhatsAppUpdates: cfg.enableWhatsAppUpdates ?? true,
    }));
  }, [settings]);

  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch('/api/admin/settings/queue', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: form }) });
      await onRefreshData();
      setToast('Queue settings saved.');
      setTimeout(() => setToast(''), 3000);
    } finally { setSaving(false); }
  };

  const F = (label: string, key: keyof typeof form, type = 'text', extra?: any) => (
    <div>
      <label className="field-label">{label}</label>
      {type === 'checkbox' ? (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={form[key] as boolean} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: '#6F8F7A', width: '15px', height: '15px' }} />
          <span style={{ fontSize: '0.8125rem', color: '#54575C' }}>Enabled</span>
        </label>
      ) : (
        <input
          type={type}
          value={form[key] as string | number}
          onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value }))}
          className="input"
          {...extra}
        />
      )}
    </div>
  );

  return (
    <div className="max-w-2xl">
      {toast && <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#E5F0EC', border: '1px solid #CCDFD8', borderRadius: '8px', fontSize: '0.8125rem', color: '#29443A', fontWeight: 500 }}>{toast}</div>}

      <form onSubmit={handleSave} className="space-y-8">
        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Token numbering</h3>
          <div className="grid grid-cols-2 gap-4">
            {F('Token prefix', 'tokenPrefix', 'text', { placeholder: 'Optional (e.g. OPD)' })}
            {F('Number format', 'numberFormat', 'text', { placeholder: '001' })}
            {F('Start number', 'queueStartNumber', 'number', { min: 1 })}
            {F('Max daily tokens', 'maxDailyTokens', 'number', { min: 1 })}
          </div>
          <div className="mt-4">{F('Reset daily', 'dailyTokenReset', 'checkbox')}</div>
        </section>

        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Special prefixes</h3>
          <div className="grid grid-cols-3 gap-4">
            {F('Emergency prefix', 'emergencyTokenPrefix')}
            {F('VIP prefix', 'vipTokenPrefix')}
            {F('Walk-in prefix', 'walkInTokenPrefix')}
          </div>
        </section>

        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Schedule</h3>
          <div className="grid grid-cols-2 gap-4">
            {F('Consultation start', 'consultationStartTime', 'time')}
            {F('Consultation end', 'consultationEndTime', 'time')}
            {F('Auto-skip timeout (sec)', 'autoSkipTimeout', 'number', { min: 0 })}
            {F('Max waiting time (min)', 'maxWaitingTime', 'number', { min: 0 })}
          </div>
        </section>

        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Notifications</h3>
          <div className="grid grid-cols-2 gap-4">
            {F('Notification threshold (min)', 'minWaitTimeNotificationThreshold', 'number', { min: 1 })}
          </div>
          <div className="mt-4">{F('WhatsApp updates', 'enableWhatsAppUpdates', 'checkbox')}</div>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>
    </div>
  );
}

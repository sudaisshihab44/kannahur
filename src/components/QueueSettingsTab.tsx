import { authFetch } from '../utils/authFetch';
import React, { useState, useEffect } from 'react';
import { 
  Save, AlertCircle, Sparkles, Sliders, Ticket, RefreshCw, BadgeInfo,
  Clock, CheckCircle2, SlidersHorizontal, Settings, Flame, ShieldAlert, Zap
} from 'lucide-react';
import { QueueSettings } from '../types';

interface QueueSettingsTabProps {
  settings: QueueSettings;
  onRefreshData: () => Promise<void>;
}

export default function QueueSettingsTab({
  settings,
  onRefreshData
}: QueueSettingsTabProps) {
  const [tokenPrefix, setTokenPrefix] = useState('');
  const [numberFormat, setNumberFormat] = useState('001');
  const [dailyReset, setDailyReset] = useState(true);
  const [startNumber, setStartNumber] = useState('1');
  const [maxDailyTokens, setMaxDailyTokens] = useState('500');
  const [emergencyPrefix, setEmergencyPrefix] = useState('EMR');
  const [vipPrefix, setVipPrefix] = useState('VIP');
  const [walkInPrefix, setWalkInPrefix] = useState('WLK');

  const [consultStart, setConsultStart] = useState('09:00');
  const [consultEnd, setConsultEnd] = useState('17:00');
  const [autoSkipTimeout, setAutoSkipTimeout] = useState('180');
  const [maxWaitingTime, setMaxWaitingTime] = useState('120');
  const [minWaitTimeNotificationThreshold, setMinWaitTimeNotificationThreshold] = useState('5');
  const [enableWhatsAppUpdates, setEnableWhatsAppUpdates] = useState(true);

  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Sync state with settings prop
  useEffect(() => {
    if (settings && settings.config) {
      const cfg = settings.config;
      setTokenPrefix(cfg.tokenPrefix || '');
      setNumberFormat(cfg.numberFormat || '001');
      setDailyReset(cfg.dailyTokenReset !== false);
      setStartNumber(String(cfg.queueStartNumber || '1'));
      setMaxDailyTokens(String(cfg.maxDailyTokens || '500'));
      setEmergencyPrefix(cfg.emergencyTokenPrefix || 'EMR');
      setVipPrefix(cfg.vipTokenPrefix || 'VIP');
      setWalkInPrefix(cfg.walkInTokenPrefix || 'WLK');
      setConsultStart(cfg.consultationStartTime || '09:00');
      setConsultEnd(cfg.consultationEndTime || '17:00');
      setAutoSkipTimeout(String(cfg.autoSkipTimeout || '180'));
      setMaxWaitingTime(String(cfg.maxWaitingTime || '120'));
      setMinWaitTimeNotificationThreshold(String(cfg.minWaitTimeNotificationThreshold !== undefined ? cfg.minWaitTimeNotificationThreshold : '5'));
      setEnableWhatsAppUpdates(cfg.enableWhatsAppUpdates !== false);
    }
  }, [settings]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');

    try {
      const res = await authFetch('/api/admin/queue-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenPrefix,
          dailyTokenReset: dailyReset,
          queueStartNumber: parseInt(startNumber) || 1,
          maxQueueSize: parseInt(maxDailyTokens) || 500,
          maxDailyTokens: parseInt(maxDailyTokens) || 500,
          emergencyTokenPrefix: emergencyPrefix,
          vipTokenPrefix: vipPrefix,
          walkInTokenPrefix: walkInPrefix,
          numberFormat,
          consultationStartTime: consultStart,
          consultationEndTime: consultEnd,
          autoSkipTimeout: parseInt(autoSkipTimeout) || 180,
          maxWaitingTime: parseInt(maxWaitingTime) || 120,
          minWaitTimeNotificationThreshold: parseInt(minWaitTimeNotificationThreshold) || 5,
          enableWhatsAppUpdates: enableWhatsAppUpdates
        })
      });

      if (res.ok) {
        showToast('Dynamic queue parameters updated successfully');
        await onRefreshData();
      } else {
        setErrorMsg('Failed to update config settings on backend.');
      }
    } catch (err) {
      setErrorMsg('API connection error.');
    } finally {
      setSaving(false);
    }
  };

  // Format helper for token preview
  const formatPreview = (prefix: string, num: number) => {
    let numStr = String(num);
    if (numberFormat === '001') numStr = numStr.padStart(3, '0');
    else if (numberFormat === '0001') numStr = numStr.padStart(4, '0');
    return `${prefix || 'GEN'}-${numStr}`;
  };

  return (
    <div className="space-y-8 animate-fade-in" id="queue-settings-tab-root">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-12 right-12 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-slate-800" id="toast-success-settings">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}

      {/* 5 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="settings-top-statistics">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Primary Prefix</span>
            <span className="text-2xl font-display font-extrabold text-blue-600 mt-1 block font-mono">{tokenPrefix || 'GEN'}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Default outpatient prefix</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Digit Format</span>
            <span className="text-2xl font-display font-extrabold text-slate-900 mt-1 block">
              {numberFormat === '001' ? '001' : numberFormat === '0001' ? '0001' : '1'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Zero-padding setting</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Daily Reset</span>
            <span className="text-2xl font-display font-extrabold text-emerald-600 mt-1 block">
              {dailyReset ? 'Enabled' : 'Manual'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Auto resets at 12 AM</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Token Capacity</span>
            <span className="text-2xl font-display font-extrabold text-amber-600 mt-1 block">{maxDailyTokens}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Max daily patient bookings</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">OPD Hours</span>
            <span className="text-lg font-display font-extrabold text-slate-800 mt-2.5 block leading-none">
              {consultStart} - {consultEnd}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Queue operational window</span>
        </div>
      </div>

      {/* Header Block */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          <span>Admin Center</span>
          <span>/</span>
          <span className="text-slate-600">Settings</span>
        </div>
        <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Queue Token Configuration</h2>
        <p className="text-xs text-slate-500 mt-1">Configure clinical outpatient division token codes, sequence formatting, VIP priority overrides, and daily reset frequencies.</p>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3.5 rounded-2xl text-xs flex items-center gap-2 animate-fade-in" id="settings-error-alert">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
          <span className="font-medium leading-relaxed">{errorMsg}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSaveConfig} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" id="queue-settings-form">
        
        {/* Left Side: Parameters Cards (Col span 2) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card 1: Token Designation Panel */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5" id="token-designations-card">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Patient Token Formats</h3>
                <p className="text-xs text-slate-400">Configure formatting and priority token prefix classifications</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Primary Prefix (Default)</label>
                <input
                  type="text"
                  placeholder="GEN"
                  value={tokenPrefix}
                  onChange={(e) => setTokenPrefix(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 uppercase font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Number Digit Format</label>
                <select
                  value={numberFormat}
                  onChange={(e) => setNumberFormat(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-2.5 text-xs text-slate-900 font-bold cursor-pointer"
                >
                  <option value="001">Three Digits (001)</option>
                  <option value="0001">Four Digits (0001)</option>
                  <option value="1">Standard (1)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Sequence Start Number</label>
                <input
                  type="number"
                  value={startNumber}
                  onChange={(e) => setStartNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Maximum Daily Tokens</label>
                <input
                  type="number"
                  value={maxDailyTokens}
                  onChange={(e) => setMaxDailyTokens(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Priority Overrides Prefixes</label>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="block text-[9px] font-bold text-rose-500 uppercase tracking-wider mb-1.5">Emergency</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={emergencyPrefix}
                    onChange={(e) => setEmergencyPrefix(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-rose-700 font-mono font-extrabold text-center uppercase"
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="block text-[9px] font-bold text-purple-500 uppercase tracking-wider mb-1.5">VIP / Executive</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={vipPrefix}
                    onChange={(e) => setVipPrefix(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-purple-700 font-mono font-extrabold text-center uppercase"
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="block text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1.5">Walk-In</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={walkInPrefix}
                    onChange={(e) => setWalkInPrefix(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-indigo-700 font-mono font-extrabold text-center uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-t border-slate-100 pt-4">
              <input 
                type="checkbox"
                id="chk-daily-reset"
                checked={dailyReset}
                onChange={(e) => setDailyReset(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 h-4 w-4 cursor-pointer"
              />
              <div>
                <label htmlFor="chk-daily-reset" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Automated daily queue counter reset
                </label>
                <span className="text-[10px] text-slate-400 block leading-tight">Clears all queue tokens and starts sequence back at {startNumber} at midnight daily.</span>
              </div>
            </div>
          </div>

          {/* Card 2: Operational Flow Parameters */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5" id="operational-parameters-card">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Operational Limits & Timers</h3>
                <p className="text-xs text-slate-400">Configure OPD operating timelines and threshold alert triggers</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">OPD Queue Start Time</label>
                <input
                  type="time"
                  value={consultStart}
                  onChange={(e) => setConsultStart(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">OPD Queue Close Time</label>
                <input
                  type="time"
                  value={consultEnd}
                  onChange={(e) => setConsultEnd(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Auto-Skip Timeout (Seconds)</label>
                <input
                  type="number"
                  placeholder="180"
                  value={autoSkipTimeout}
                  onChange={(e) => setAutoSkipTimeout(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Max Wait Warning (Minutes)</label>
                <input
                  type="number"
                  placeholder="120"
                  value={maxWaitingTime}
                  onChange={(e) => setMaxWaitingTime(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 3: WhatsApp Integration Settings */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5" id="whatsapp-integration-card">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                <BadgeInfo className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">WhatsApp Notification Integration</h3>
                <p className="text-xs text-slate-400">Configure real-time mobile notifications and wait updates</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 py-1">
              <input 
                type="checkbox"
                id="chk-enable-whatsapp"
                checked={enableWhatsAppUpdates}
                onChange={(e) => setEnableWhatsAppUpdates(e.target.checked)}
                className="rounded border-slate-300 text-green-600 focus:ring-green-500/30 h-4 w-4 cursor-pointer"
              />
              <div>
                <label htmlFor="chk-enable-whatsapp" className="text-xs font-bold text-slate-800 cursor-pointer">
                  Enable automated WhatsApp updates
                </label>
                <span className="text-[10px] text-slate-400 block leading-tight">Sends welcome, 2-patients-remaining, your-turn and delay alerts automatically.</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Wait Time Update Threshold (Minutes)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={minWaitTimeNotificationThreshold}
                onChange={(e) => setMinWaitTimeNotificationThreshold(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-bold focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Revised waiting times are only sent if the estimation changes by more than this value.</span>
            </div>
          </div>

        </div>

        {/* Right Side: Preview & Saving Actions */}
        <div className="space-y-6">
          
          {/* Token Preview */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4.5 w-4.5 text-blue-600" />
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Live Preview</h3>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Based on your active configuration, generated patient tickets will format and print as shown below:
            </p>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">General Care</span>
                <span className="font-mono font-extrabold text-slate-800 text-xs bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
                  {formatPreview(tokenPrefix, 4)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-rose-50/50 rounded-2xl border border-rose-100/40">
                <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider">Emergency Duty</span>
                <span className="font-mono font-extrabold text-rose-700 text-xs bg-white px-2.5 py-1 rounded-lg border border-rose-200 shadow-xs">
                  {formatPreview(emergencyPrefix, 1)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50/50 rounded-2xl border border-purple-100/40">
                <span className="text-[10px] font-extrabold text-purple-500 uppercase tracking-wider">VIP / Executive</span>
                <span className="font-mono font-extrabold text-purple-700 text-xs bg-white px-2.5 py-1 rounded-lg border border-purple-200 shadow-xs">
                  {formatPreview(vipPrefix, 8)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/40">
                <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider">Walk-In</span>
                <span className="font-mono font-extrabold text-indigo-700 text-xs bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-xs">
                  {formatPreview(walkInPrefix, 12)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Commit Settings</h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Applying changes updates reception ticketing generators and doctor display nodes in real-time. Make sure to double check prefix codes.
            </p>
            
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              id="btn-save-settings"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Applying...' : 'Save Queue Settings'}</span>
            </button>
          </div>

        </div>

      </form>

    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { QueueSettings, ReceptionUser, UserRole } from '../types';
import { authFetch } from '../utils/authFetch';

interface Props { settings: QueueSettings; onRefreshData: () => Promise<void>; currentUser?: ReceptionUser | null; }

export default function HospitalSettingsTab({ settings, onRefreshData, currentUser }: Props) {
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const info    = settings.hospitalInfo;

  const [form, setForm] = useState({ name:'', tagline:'', address:'', phone:'', email:'', website:'', workingHours:'', registrationNumber:'', emergencyContact:'', logoColor:'text-blue-600', logoUrl:'' });
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState('');
  const [logoFile, setLogoFile]   = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (info) setForm({ name: info.name ?? '', tagline: info.tagline ?? '', address: info.address ?? '', phone: info.phone ?? '', email: info.email ?? '', website: info.website ?? '', workingHours: info.workingHours ?? '', registrationNumber: info.registrationNumber ?? '', emergencyContact: info.emergencyContact ?? '', logoColor: info.logoColor ?? 'text-blue-600', logoUrl: info.logoUrl ?? '' });
  }, [settings]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    try {
      let logoUrl = form.logoUrl;
      if (logoFile) {
        const fd = new FormData();
        fd.append('logo', logoFile);
        const res = await authFetch('/api/admin/upload-logo', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok && data.url) logoUrl = data.url;
      }
      await authFetch('/api/admin/settings/hospital', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hospitalInfo: { ...form, logoUrl } }) });
      await onRefreshData();
      setToast('Hospital settings saved.');
      setTimeout(() => setToast(''), 3000);
    } finally { setSaving(false); }
  };

  const F = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} value={form[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input" placeholder={placeholder} disabled={!isAdmin} />
    </div>
  );

  return (
    <div className="max-w-2xl">
      {!isAdmin && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#F7F4EE', border: '1px solid #EDE8DC', borderRadius: '8px', fontSize: '0.8125rem', color: '#6B6E73' }}>
          You need Administrator access to edit hospital settings.
        </div>
      )}
      {toast && <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#E5F0EC', border: '1px solid #CCDFD8', borderRadius: '8px', fontSize: '0.8125rem', color: '#29443A', fontWeight: 500 }}>{toast}</div>}

      <form onSubmit={handleSave} className="space-y-8">
        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Identity</h3>
          <div className="space-y-4">
            {F('Hospital name', 'name', 'text', 'St. Jude Memorial Hospital')}
            {F('Tagline', 'tagline', 'text', 'Compassionate Care, Advanced Medicine')}
            {/* Logo */}
            {isAdmin && (
              <div>
                <label className="field-label">Logo</label>
                <div className="flex items-center gap-3">
                  {(logoPreview || form.logoUrl) && (
                    <img src={logoPreview || form.logoUrl} alt="Logo" style={{ width: '48px', height: '48px', objectFit: 'contain', border: '1px solid #E7E5E4', borderRadius: '8px' }} />
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                    {form.logoUrl ? 'Replace logo' : 'Upload logo'}
                  </button>
                  <input type="file" ref={fileRef} accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Contact</h3>
          <div className="grid grid-cols-2 gap-4">
            {F('Phone', 'phone', 'tel', '+1 (555) 010-9900')}
            {F('Email', 'email', 'email', 'info@hospital.com')}
            {F('Website', 'website', 'url', 'https://hospital.com')}
            {F('Emergency contact', 'emergencyContact', 'tel', '911')}
          </div>
          <div className="mt-4">{F('Address', 'address', 'text', '742 Evergreen Terrace…')}</div>
        </section>

        <section>
          <h3 style={{ fontWeight: 600, fontSize: '0.875rem', color: '#202124', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #E7E5E4' }}>Operations</h3>
          <div className="grid grid-cols-2 gap-4">
            {F('Working hours', 'workingHours', 'text', 'Mon–Sat 08:00–18:00')}
            {F('Registration number', 'registrationNumber', 'text', 'HOS-2024-001')}
          </div>
        </section>

        {isAdmin && (
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        )}
      </form>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, Sparkles, Building, Phone, MapPin, Clock, ShieldCheck, Heart,
  CheckCircle2, AlertCircle, ShieldAlert, Zap, Globe, Mail, Hash,
  FileText, AlertTriangle, Upload, Trash2, Loader2
} from 'lucide-react';
import { QueueSettings, HospitalInfo, ReceptionUser, UserRole } from '../types';

interface HospitalSettingsTabProps {
  settings: QueueSettings;
  onRefreshData: () => Promise<void>;
  currentUser?: ReceptionUser | null;
}

const AVAILABLE_LOGO_COLORS = [
  { class: 'text-blue-600', name: 'Clinical Blue' },
  { class: 'text-indigo-600', name: 'Deep Indigo' },
  { class: 'text-emerald-600', name: 'Premium Emerald' },
  { class: 'text-rose-600', name: 'Teal/Rose Flare' },
  { class: 'text-slate-800', name: 'Minimalist Charcoal' }
];

export default function HospitalSettingsTab({
  settings,
  onRefreshData,
  currentUser
}: HospitalSettingsTabProps) {
  const [originalHospitalData, setOriginalHospitalData] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    tagline: '',
    address: '',
    phone: '',
    logoUrl: '',
    logoColor: 'text-blue-600',
    workingHours: 'Mon - Sat: 08:00 AM - 08:00 PM',
    queueOperatingHours: 'Mon - Sat: 08:00 AM - 05:00 PM',
    registrationNumber: '',
    email: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    website: '',
    description: '',
    emergencyContact: ''
  });
  const [isDirty, setIsDirty] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  useEffect(() => {
    if (settings && settings.hospitalInfo) {
      if (isDirty) return; // Do not fetch data while user is editing
      
      const info = settings.hospitalInfo;
      setOriginalHospitalData(info);
      setFormData({
        name: info.name || '',
        tagline: info.tagline || '',
        address: info.address || '',
        phone: info.phone || '',
        logoUrl: info.logoUrl || '',
        logoColor: info.logoColor || 'text-blue-600',
        workingHours: info.workingHours || 'Mon - Sat: 08:00 AM - 08:00 PM',
        queueOperatingHours: info.queueOperatingHours || 'Mon - Sat: 08:00 AM - 05:00 PM',
        registrationNumber: info.registrationNumber || '',
        email: info.email || '',
        city: info.city || '',
        state: info.state || '',
        country: info.country || '',
        pincode: info.pincode || '',
        website: info.website || '',
        description: info.description || '',
        emergencyContact: info.emergencyContact || ''
      });
      setLogoFile(null);
      setLogoPreviewUrl('');
    }
  }, [settings, isDirty]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSaveHospitalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!formData.name.trim()) {
      setError('Hospital name is a required field.');
      return;
    }
    if (!formData.phone.trim()) {
      setError('Hospital contact phone is a required field.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Hospital street address is a required field.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let finalLogoUrl = formData.logoUrl;

      // Upload logo if a new file is selected
      if (logoFile) {
        const logoFormData = new FormData();
        logoFormData.append('logo', logoFile);
        const res = await fetch('/api/admin/upload-logo', {
          method: 'POST',
          body: logoFormData
        });
        const data = await res.json();
        if (res.ok && data.success) {
          finalLogoUrl = data.logoUrl;
        } else {
          throw new Error(data.message || 'Logo upload failed.');
        }
      }

      const payload = {
        ...formData,
        logoUrl: finalLogoUrl
      };

      const res = await fetch('/api/admin/hospital-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Hospital profile and branding parameters saved');
        setIsDirty(false);
        setLogoFile(null);
        setLogoPreviewUrl('');
        setFormData(prev => ({ ...prev, logoUrl: finalLogoUrl }));
        await onRefreshData();
      } else {
        setError(data.message || 'Failed saving hospital profile details.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed server communication');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUploadClick = () => {
    if (!isAdmin) return;
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds the 5 MB limit.');
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Only PNG, JPG, JPEG, and WEBP image file types are allowed.');
      return;
    }

    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setIsDirty(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

    const handleRemoveLogo = () => {
    if (!isAdmin || !confirm('Are you sure you want to remove the current logo?')) return;
    setFormData(prev => ({ ...prev, logoUrl: '' }));
    setLogoFile(null);
    setLogoPreviewUrl('');
    setIsDirty(true);
  };

  // Get name of current selected logo color
  const currentLogoColorName = AVAILABLE_LOGO_COLORS.find(c => c.class === formData.logoColor)?.name || 'Clinical Blue';

  return (
    <div className="space-y-8 animate-fade-in" id="hospital-settings-tab-root">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-12 right-12 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in border border-slate-800" id="toast-success-hospital">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold font-sans">{toastMessage}</span>
        </div>
      )}

      {/* 5 Top KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="hospital-top-statistics">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hospital Identity</span>
            <span className="text-lg font-display font-extrabold text-slate-900 mt-2 block leading-snug line-clamp-2">{formData.name || 'InclusyQ'}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Primary brand name</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Primary Location</span>
            <span className="text-lg font-display font-extrabold text-slate-900 mt-2 block leading-snug line-clamp-2">
              {formData.city && formData.state ? `${formData.city}, ${formData.state}` : formData.address.split(',')[0] || 'Medical District'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Headquarters location</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Support Hotline</span>
            <span className="text-md font-display font-extrabold text-indigo-600 mt-3 block leading-snug">{formData.phone || 'Hotline'}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Desk contact number</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Palette Accent</span>
            <span className="text-lg font-display font-extrabold text-slate-800 mt-2 block leading-snug">{currentLogoColorName}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Primary brand color</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between col-span-2 lg:col-span-1">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Triage hours</span>
            <span className="text-xs font-display font-extrabold text-slate-800 mt-3 block leading-snug truncate">
              {formData.queueOperatingHours.split(':')[1] ? formData.queueOperatingHours : '08:00 AM - 05:00 PM'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-2 block font-medium">Queue operational period</span>
        </div>
      </div>

      {/* Header Block */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
          <span>Admin Center</span>
          <span>/</span>
          <span className="text-slate-600">Hospital Profile</span>
        </div>
        <h2 className="text-2xl font-display font-extrabold text-slate-900 tracking-tight">Hospital Brand Profile</h2>
        <p className="text-xs text-slate-500 mt-1">Configure clinical identity, logo assets, support hotlines, and public-facing queue schedules.</p>
      </div>

      {/* Access Denied Warning Banner for non-admins */}
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-amber-900">Read-Only Workspace Access</h4>
            <p className="text-[11px] text-amber-700 mt-1 font-medium">
              Only authenticated Administrators can modify hospital information, upload logo assets, or change branding parameters.
            </p>
          </div>
        </div>
      )}

      {/* Error Alert Box */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-bold text-red-900">Operation Error</h4>
            <p className="text-[11px] text-red-700 mt-1 font-semibold leading-relaxed">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-xs font-bold text-red-500 hover:text-red-700 cursor-pointer">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start" id="hospital-settings">
        
        {/* Left Form: Details */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6" id="hospital-profile-card">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Building className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 font-sans">Hospital Brand Identity</h3>
              <p className="text-xs text-slate-400 font-sans">Configure public facing branding parameters, working schedules, and contact details</p>
            </div>
          </div>

          <form onSubmit={handleSaveHospitalInfo} className="space-y-5" id="hospital-info-form">
            
            {/* Logo Upload Section */}
            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hospital Brand Logo</label>
              <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                {/* Logo Preview Container */}
                <div className="w-16 h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 select-none">
                  {(logoPreviewUrl || formData.logoUrl) ? (
                    <img src={logoPreviewUrl || formData.logoUrl} alt="Hospital Logo" loading="lazy" decoding="async" className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-300">
                      <Building className="h-7 w-7" />
                      <span className="text-[8px] font-bold mt-1">NO LOGO</span>
                    </div>
                  )}
                </div>

                {/* Upload Buttons */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleLogoFileChange} 
                      className="hidden" 
                      accept=".png,.jpg,.jpeg,.webp" 
                    />
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={handleLogoUploadClick}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isAdmin
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        <span>{(logoPreviewUrl || formData.logoUrl) ? 'Change Logo' : 'Upload Image'}{logoFile ? ' (pending save)' : ''}</span>
                      </>
                    </button>

                    {(logoPreviewUrl || formData.logoUrl) && (
                      <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={handleRemoveLogo}
                        className={`p-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center cursor-pointer ${
                          isAdmin 
                            ? 'border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300'
                            : 'border-slate-200 text-slate-300 cursor-not-allowed'
                        }`}
                        title="Delete Logo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Supports PNG, JPG, JPEG, and WEBP. Maximum file size limit: 5 MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Core Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Hospital Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="St. Jude Memorial Hospital"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  id="input-hospital-name"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tagline / Motto</label>
                <input
                  type="text"
                  placeholder="Compassionate Care, Advanced Medicine"
                  value={formData.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  id="input-hospital-tagline"
                />
              </div>
            </div>

            {/* Details & Registration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Registration Number
                </label>
                <input
                  type="text"
                  placeholder="REG-99182A-NY"
                  value={formData.registrationNumber}
                  onChange={(e) => handleChange('registrationNumber', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="contact@stjudememorial.org"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Address Group */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="742 Evergreen Terrace, Medical District"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  id="input-hospital-address"
                />
              </div>
            </div>

            {/* City, State, Pincode */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                <input
                  type="text"
                  placeholder="Springfield"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">State</label>
                <input
                  type="text"
                  placeholder="Illinois"
                  value={formData.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Country</label>
                <input
                  type="text"
                  placeholder="United States"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Pincode</label>
                <input
                  type="text"
                  placeholder="62704"
                  value={formData.pincode}
                  onChange={(e) => handleChange('pincode', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Contacts & Website */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Contact Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="+1 (555) 010-9900"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  id="input-hospital-phone"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Emergency Phone
                </label>
                <input
                  type="text"
                  placeholder="+1 (555) 010-9911"
                  value={formData.emergencyContact}
                  onChange={(e) => handleChange('emergencyContact', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Website URL
                </label>
                <input
                  type="text"
                  placeholder="https://stjudememorial.org"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Operating Times */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  OPD Working Hours
                </label>
                <input
                  type="text"
                  placeholder="Mon - Sat: 08:00 AM - 08:00 PM"
                  value={formData.workingHours}
                  onChange={(e) => handleChange('workingHours', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  id="input-hospital-working-hours"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  Queue Operating Hours
                </label>
                <input
                  type="text"
                  placeholder="Mon - Sat: 08:00 AM - 05:00 PM"
                  value={formData.queueOperatingHours}
                  onChange={(e) => handleChange('queueOperatingHours', e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  id="input-hospital-queue-hours"
                />
              </div>
            </div>

            {/* Short Description */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                Hospital Profile Description
              </label>
              <textarea
                placeholder="St. Jude Memorial Hospital provides multi-specialty care and integrated token queue operations."
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                disabled={!isAdmin}
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75 disabled:cursor-not-allowed font-sans resize-none"
              />
            </div>

            {/* Logo Brand Theme */}
            <div className="border-t border-slate-100 pt-5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Hospital Brand Palette Accent</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" id="hospital-brand-color-selection">
                {AVAILABLE_LOGO_COLORS.map(color => {
                  const isSelected = formData.logoColor === color.class;
                  return (
                    <button
                      key={color.class}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => handleChange('logoColor', color.class)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all text-center cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-50/50 border-blue-500 shadow-sm' 
                          : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/50'
                      } ${!isAdmin && 'cursor-not-allowed opacity-75'}`}
                    >
                      <div className={`h-5 w-5 rounded-full bg-current ${color.class}`} />
                      <span className="text-[10px] font-semibold text-slate-600 block">{color.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  id="btn-save-hospital"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Profile...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Hospital Profile</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Visual Identity Preview */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between" id="brand-identity-preview">
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Zap className="h-4.5 w-4.5 text-blue-600" />
              <span>TV Display Mockup</span>
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed">This is how your hospital branding appears on live patient monitors and wall-mounted queues screens:</p>
            
            <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 text-white space-y-4 shadow-xl" id="brand-preview-tv">
              <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center bg-white/10 shrink-0 overflow-hidden`}>
                  {(logoPreviewUrl || formData.logoUrl) ? (
                    <img src={logoPreviewUrl || formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Heart className={`h-5 w-5 fill-current ${formData.logoColor}`} />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-extrabold font-sans leading-none">{formData.name || 'InclusyQ Hospital'}</h4>
                  <span className="text-[10px] text-slate-400 block mt-1">{formData.tagline || 'Compassionate Care'}</span>
                </div>
              </div>

              <div className="space-y-2 text-[10px] text-slate-400 font-mono leading-relaxed">
                <p>📍 {formData.address || 'Sector 4, Medical District'}</p>
                {formData.city && <p>🏙️ City: {formData.city} {formData.pincode ? `(${formData.pincode})` : ''}</p>}
                <p>📞 Phone: {formData.phone || '+1 (555) 010-9900'}</p>
                {formData.emergencyContact && <p>🚨 Emergency: {formData.emergencyContact}</p>}
                <p>🕒 OPD Hours: {formData.workingHours || '08:00 AM - 08:00 PM'}</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-start gap-2.5 text-[10px] text-slate-500 mt-6 leading-relaxed font-sans">
            <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
            <span>Settings synchronize instantly to clinic display nodes, client-facing booking trackers, and physical tickets.</span>
          </div>
        </div>

      </div>

    </div>
  );
}

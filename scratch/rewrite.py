import os
import re

file_path = 'src/components/HospitalSettingsTab.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. State Replacement
state_regex = re.compile(r"const \[name, setName\].*?const \[emergencyContact, setEmergencyContact\] = useState\(''\);", re.DOTALL)
new_state = """  const [originalHospitalData, setOriginalHospitalData] = useState<any>(null);
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
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>('');"""
content = state_regex.sub(new_state, content, count=1)

# 2. useEffect Replacement
use_effect_regex = re.compile(r"useEffect\(\(\) => \{.*?\}, \[settings\]\);", re.DOTALL)
new_use_effect = """  useEffect(() => {
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
  };"""
content = use_effect_regex.sub(new_use_effect, content, count=1)

# 3. handleSaveHospitalInfo Replacement
handle_save_regex = re.compile(r"const handleSaveHospitalInfo = async \(e: React.FormEvent\) => \{.*?finally \{\s*setSaving\(false\);\s*\}\s*\};", re.DOTALL)
new_handle_save = """  const handleSaveHospitalInfo = async (e: React.FormEvent) => {
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
  };"""
content = handle_save_regex.sub(new_handle_save, content, count=1)

# 4. handleLogoFileChange Replacement
handle_logo_change_regex = re.compile(r"const handleLogoFileChange = async \(e: React.ChangeEvent<HTMLInputElement>\) => \{.*?finally \{\s*setUploading\(false\);\s*if \(fileInputRef\.current\) fileInputRef\.current\.value = '';\s*\}\s*\};", re.DOTALL)
new_handle_logo_change = """  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };"""
content = handle_logo_change_regex.sub(new_handle_logo_change, content, count=1)

# 5. handleRemoveLogo Replacement
handle_remove_logo_regex = re.compile(r"const handleRemoveLogo = async \(\) => \{.*?\};", re.DOTALL)
new_handle_remove_logo = """  const handleRemoveLogo = () => {
    if (!isAdmin || !confirm('Are you sure you want to remove the current logo?')) return;
    setFormData(prev => ({ ...prev, logoUrl: '' }));
    setLogoFile(null);
    setLogoPreviewUrl('');
    setIsDirty(true);
  };"""
content = handle_remove_logo_regex.sub(new_handle_remove_logo, content, count=1)

# 6. Replace input fields
inputs = ['name', 'tagline', 'address', 'phone', 'workingHours', 'queueOperatingHours', 'registrationNumber', 'email', 'city', 'state', 'country', 'pincode', 'website', 'description', 'emergencyContact']

for field in inputs:
    content = content.replace(f"value={{{field}}}", f"value={{formData.{field}}}")
    setter = 'set' + field[0].upper() + field[1:]
    content = content.replace(f"onChange={{(e) => {setter}(e.target.value)}}", f"onChange={{(e) => handleChange('{field}', e.target.value)}}")

# 7. Logo Display Fixes
content = content.replace("{logoUrl ?", "{(logoPreviewUrl || formData.logoUrl) ?")
content = content.replace("<img src={logoUrl}", "<img src={logoPreviewUrl || formData.logoUrl}")
content = content.replace("{logoUrl && (", "{(logoPreviewUrl || formData.logoUrl) && (")
content = content.replace("{logoUrl ? 'Change Logo'", "{(logoPreviewUrl || formData.logoUrl) ? 'Change Logo'")

# 8. Logo Color buttons
content = content.replace("const currentLogoColorName = AVAILABLE_LOGO_COLORS.find(c => c.class === logoColor)?.name || 'Clinical Blue';", "const currentLogoColorName = AVAILABLE_LOGO_COLORS.find(c => c.class === formData.logoColor)?.name || 'Clinical Blue';")
content = content.replace("const isSelected = logoColor === color.class;", "const isSelected = formData.logoColor === color.class;")
content = content.replace("onClick={() => setLogoColor(color.class)}", "onClick={() => handleChange('logoColor', color.class)}")

# 9. TV Display Mockup Variables
content = content.replace("{name || 'InclusyQ'}", "{formData.name || 'InclusyQ'}")
content = content.replace("{city && state ? `${city}, ${state}` : address.split(',')[0] || 'Medical District'}", "{formData.city && formData.state ? `${formData.city}, ${formData.state}` : formData.address.split(',')[0] || 'Medical District'}")
content = content.replace("{phone || 'Hotline'}", "{formData.phone || 'Hotline'}")
content = content.replace("{queueOperatingHours.split(':')[1] ? queueOperatingHours : '08:00 AM - 05:00 PM'}", "{formData.queueOperatingHours.split(':')[1] ? formData.queueOperatingHours : '08:00 AM - 05:00 PM'}")

content = content.replace("{name || 'InclusyQ Hospital'}", "{formData.name || 'InclusyQ Hospital'}")
content = content.replace("{tagline || 'Compassionate Care'}", "{formData.tagline || 'Compassionate Care'}")
content = content.replace("{address || 'Sector 4, Medical District'}", "{formData.address || 'Sector 4, Medical District'}")

content = content.replace("{city && <p>🏙️ City: {city} {pincode ? `(${pincode})` : ''}</p>}", "{formData.city && <p>🏙️ City: {formData.city} {formData.pincode ? `(${formData.pincode})` : ''}</p>}")
content = content.replace("{phone || '+1 (555) 010-9900'}", "{formData.phone || '+1 (555) 010-9900'}")
content = content.replace("{emergencyContact && <p>🚨 Emergency: {emergencyContact}</p>}", "{formData.emergencyContact && <p>🚨 Emergency: {formData.emergencyContact}</p>}")
content = content.replace("{workingHours || '08:00 AM - 08:00 PM'}", "{formData.workingHours || '08:00 AM - 08:00 PM'}")

content = content.replace("fill-current ${logoColor}", "fill-current ${formData.logoColor}")

with open('src/components/HospitalSettingsTab.tsx.tmp', 'w', encoding='utf-8') as f:
    f.write(content)
print("Rewritten to src/components/HospitalSettingsTab.tsx.tmp")

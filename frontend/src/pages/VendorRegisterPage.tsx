import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Store, ShieldCheck, CreditCard, FileText, CheckCircle, ArrowRight, Upload, Loader2, LogIn } from 'lucide-react';
import { vendorApi } from '../services';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Client-side validators mirror the backend (VendorCreate) so users get
// immediate, field-level feedback instead of a raw 422 after the final submit.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Normalise an Indian mobile to 10 digits (strips +91 / leading 0 / spaces),
// returning null when it can't reduce to a valid 6-9-leading 10-digit number.
const normalizeMobile = (raw: string): string | null => {
  let cleaned = raw.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = cleaned.slice(2);
  if (cleaned.length === 11 && cleaned.startsWith('0')) cleaned = cleaned.slice(1);
  if (cleaned.length !== 10 || !/^[6-9]/.test(cleaned)) return null;
  return cleaned;
};

const STATES = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '31', name: 'Lakshadweep' },
  { code: '38', name: 'Ladakh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
];

type Step = 'basic' | 'kyc' | 'bank' | 'documents';

export const VendorRegisterPage: React.FC = () => {
  useDocumentTitle('Become a Vendor — LaserHub');
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [step, setStep] = useState<Step>('basic');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    shop_name: '',
    business_email: '',
    mobile_number: '',
    gstin: '',
    pan: '',
    business_address: '',
    state: '',
    state_code: '',
    description: '',
    website: '',
    bank_account_name: '',
    bank_account_number: '',
    bank_ifsc: '',
  });

  const [gstFile, setGstFile] = useState<File | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    // Clear any existing error for the field being edited.
    setErrors(prev => (prev[name] ? { ...prev, [name]: '' } : prev));
    if (name === 'state') {
      const stateObj = STATES.find(s => s.name === value);
      setForm(prev => ({ ...prev, state: value, state_code: stateObj?.code || '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  // Validate only the fields belonging to the given step. Returns a map of
  // field -> error message (empty map == valid).
  const validateStep = (target: Step): Record<string, string> => {
    const e: Record<string, string> = {};
    if (target === 'basic') {
      if (!form.shop_name.trim()) e.shop_name = 'Shop name is required';
      if (!form.business_email.trim()) e.business_email = 'Business email is required';
      else if (!EMAIL_RE.test(form.business_email.trim())) e.business_email = 'Enter a valid email address';
      if (!form.mobile_number.trim()) e.mobile_number = 'Mobile number is required';
      else if (!normalizeMobile(form.mobile_number)) e.mobile_number = 'Enter a valid 10-digit Indian mobile (starts 6-9)';
    } else if (target === 'kyc') {
      if (!form.gstin.trim()) e.gstin = 'GSTIN is required';
      else if (!GSTIN_RE.test(form.gstin.trim().toUpperCase())) e.gstin = 'Invalid GSTIN (e.g. 29ABCDE1234F1Z5)';
      if (form.pan.trim() && !PAN_RE.test(form.pan.trim().toUpperCase())) e.pan = 'Invalid PAN (e.g. ABCDE1234F)';
      if (!form.business_address.trim()) e.business_address = 'Business address is required';
      if (!form.state) e.state = 'Select a state';
    }
    return e;
  };

  const handleNext = () => {
    const stepErrors = validateStep(step);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      toast.error('Please fix the highlighted fields');
      return;
    }
    setErrors({});
    if (step === 'basic') setStep('kyc');
    else if (step === 'kyc') setStep('bank');
    else if (step === 'bank') setStep('documents');
  };

  const redirectToLogin = () => {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    navigate(`/login?returnTo=${returnTo}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Re-validate every required step before submitting — guards against
    // jumping back and clearing a field, or browser autofill quirks.
    const allErrors = { ...validateStep('basic'), ...validateStep('kyc') };
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      // Send the user to the earliest step that has an error.
      const basicErr = validateStep('basic');
      setStep(Object.keys(basicErr).length > 0 ? 'basic' : 'kyc');
      toast.error('Please complete all required fields');
      return;
    }

    // Vendor registration is authenticated (backend derives user_id from the
    // JWT). Prompt login rather than letting the request fail with a raw 401.
    if (!isAuthenticated) {
      toast.error('Please log in to complete vendor registration');
      redirectToLogin();
      return;
    }

    setSubmitting(true);
    try {
      // 1. Register vendor. Backend route is POST /api/vendors/register and
      // derives the user from the bearer token — there is no user id in the path.
      const payload = {
        shop_name: form.shop_name.trim(),
        business_email: form.business_email.trim(),
        mobile_number: normalizeMobile(form.mobile_number) || form.mobile_number.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        pan: form.pan.trim() ? form.pan.trim().toUpperCase() : undefined,
        business_address: form.business_address.trim(),
        state: form.state,
        state_code: form.state_code,
        description: form.description.trim() || undefined,
        website: form.website.trim() || undefined,
      };
      await api.post('/vendors/register', payload);

      // 2. Upload GST certificate if present (best-effort; don't block the
      // success path if the asset upload alone fails).
      if (gstFile) {
        try {
          await vendorApi.uploadAsset(gstFile, 'gst');
        } catch {
          toast.warning('Registered, but the GST certificate upload failed. You can re-upload it from your dashboard.');
        }
      }

      toast.success('Registration submitted! Redirecting to dashboard...');
      setTimeout(() => navigate('/vendor/dashboard'), 1500);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        toast.error('Your session expired. Please log in again.');
        redirectToLogin();
      } else if (status === 400 && typeof detail === 'string') {
        // e.g. "Shop name already taken" / "Already registered as vendor"
        toast.error(detail);
        if (/shop name/i.test(detail)) {
          setErrors({ shop_name: detail });
          setStep('basic');
        } else if (/already registered/i.test(detail)) {
          // Already a vendor — send them to their dashboard instead of a dead end.
          setTimeout(() => navigate('/vendor/dashboard'), 1200);
        }
      } else if (status === 422 && Array.isArray(detail)) {
        // Pydantic validation error — surface the first message.
        const first = detail[0];
        toast.error(first?.msg || 'Some fields are invalid. Please review and retry.');
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="vr-steps">
      <div className={`vr-step ${step === 'basic' ? 'active' : ''} ${['kyc', 'bank', 'documents'].includes(step) ? 'done' : ''}`}>
        <div className="vr-step-icon">{['kyc', 'bank', 'documents'].includes(step) ? <CheckCircle size={16} /> : <Store size={16} />}</div>
        <span>Basic</span>
      </div>
      <div className="vr-step-line" />
      <div className={`vr-step ${step === 'kyc' ? 'active' : ''} ${['bank', 'documents'].includes(step) ? 'done' : ''}`}>
        <div className="vr-step-icon">{['bank', 'documents'].includes(step) ? <CheckCircle size={16} /> : <ShieldCheck size={16} />}</div>
        <span>KYC</span>
      </div>
      <div className="vr-step-line" />
      <div className={`vr-step ${step === 'bank' ? 'active' : ''} ${['documents'].includes(step) ? 'done' : ''}`}>
        <div className="vr-step-icon">{['documents'].includes(step) ? <CheckCircle size={16} /> : <CreditCard size={16} />}</div>
        <span>Bank</span>
      </div>
      <div className="vr-step-line" />
      <div className={`vr-step ${step === 'documents' ? 'active' : ''}`}>
        <div className="vr-step-icon"><FileText size={16} /></div>
        <span>Docs</span>
      </div>
    </div>
  );

  return (
    <div className="vendor-register-page">
      <div className="vr-container">
        <header className="vr-header">
          <Link to="/" className="vr-back"><ArrowLeft size={16} /> Back</Link>
          <h1>Partner with LaserHub</h1>
          <p>Join 200+ fabrication shops growing their business with us.</p>
        </header>

        {renderStepIndicator()}

        {!isAuthenticated && (
          <div className="vr-auth-notice">
            <LogIn size={16} />
            <span>You'll need to be logged in to submit. </span>
            <button type="button" className="vr-auth-link" onClick={redirectToLogin}>Log in or create an account</button>
          </div>
        )}

        <div className="vr-card">
          <form onSubmit={handleSubmit}>
            {step === 'basic' && (
              <div className="vr-section animate-in">
                <h3>Business Information</h3>
                <div className="form-group">
                  <label>Shop Name *</label>
                  <input name="shop_name" value={form.shop_name} onChange={handleChange} placeholder="e.g. Precision Laser Tech" className={errors.shop_name ? 'has-error' : ''} required />
                  {errors.shop_name && <span className="vr-error">{errors.shop_name}</span>}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Business Email *</label>
                    <input name="business_email" type="email" value={form.business_email} onChange={handleChange} placeholder="contact@shop.com" className={errors.business_email ? 'has-error' : ''} required />
                    {errors.business_email && <span className="vr-error">{errors.business_email}</span>}
                  </div>
                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input name="mobile_number" value={form.mobile_number} onChange={handleChange} placeholder="9876543210" className={errors.mobile_number ? 'has-error' : ''} required />
                    {errors.mobile_number && <span className="vr-error">{errors.mobile_number}</span>}
                  </div>
                </div>
                <div className="form-group">
                  <label>Website (Optional)</label>
                  <input name="website" value={form.website} onChange={handleChange} placeholder="https://..." />
                </div>
                <div className="form-group">
                  <label>Business Description</label>
                  <textarea name="description" value={form.description} onChange={handleChange} placeholder="Briefly describe your machines and expertise..." rows={3} />
                </div>
                <button type="button" className="vr-next-btn" onClick={handleNext}>
                  Next: KYC Details <ArrowRight size={16} />
                </button>
              </div>
            )}

            {step === 'kyc' && (
              <div className="vr-section animate-in">
                <h3>KYC & Identity</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>GSTIN *</label>
                    <input name="gstin" value={form.gstin} onChange={handleChange} placeholder="15-digit GST number" className={errors.gstin ? 'has-error' : ''} required />
                    {errors.gstin && <span className="vr-error">{errors.gstin}</span>}
                  </div>
                  <div className="form-group">
                    <label>PAN (Optional)</label>
                    <input name="pan" value={form.pan} onChange={handleChange} placeholder="Business or Personal PAN" className={errors.pan ? 'has-error' : ''} />
                    {errors.pan && <span className="vr-error">{errors.pan}</span>}
                  </div>
                </div>
                <div className="form-group">
                  <label>Business Address *</label>
                  <textarea name="business_address" value={form.business_address} onChange={handleChange} placeholder="Full address as per GST record" className={errors.business_address ? 'has-error' : ''} required rows={2} />
                  {errors.business_address && <span className="vr-error">{errors.business_address}</span>}
                </div>
                <div className="form-group">
                  <label>State *</label>
                  <select name="state" value={form.state} onChange={handleChange} className={errors.state ? 'has-error' : ''} required>
                    <option value="">Select State</option>
                    {STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
                  </select>
                  {errors.state && <span className="vr-error">{errors.state}</span>}
                </div>
                <div className="vr-actions">
                  <button type="button" className="vr-prev-btn" onClick={() => setStep('basic')}>Back</button>
                  <button type="button" className="vr-next-btn" onClick={handleNext}>
                    Next: Payout Details <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {step === 'bank' && (
              <div className="vr-section animate-in">
                <h3>Bank Account for Payouts</h3>
                <p className="vr-hint">Payments for fulfilled orders will be transferred here.</p>
                <div className="form-group">
                  <label>Account Holder Name</label>
                  <input name="bank_account_name" value={form.bank_account_name} onChange={handleChange} placeholder="Name as per bank passbook" />
                </div>
                <div className="form-group">
                  <label>Account Number</label>
                  <input name="bank_account_number" value={form.bank_account_number} onChange={handleChange} placeholder="Your bank account number" />
                </div>
                <div className="form-group">
                  <label>IFSC Code</label>
                  <input name="bank_ifsc" value={form.bank_ifsc} onChange={handleChange} placeholder="11-digit IFSC code" />
                </div>
                <div className="vr-actions">
                  <button type="button" className="vr-prev-btn" onClick={() => setStep('kyc')}>Back</button>
                  <button type="button" className="vr-next-btn" onClick={handleNext}>
                    Next: Documents <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {step === 'documents' && (
              <div className="vr-section animate-in">
                <h3>Documents Upload</h3>
                <div className="vr-upload-box">
                  <div className="vr-upload-icon"><FileText size={32} /></div>
                  <h4>GST Certificate</h4>
                  <p>Upload your GST registration certificate (PDF or Image)</p>
                  <label className="vr-file-input">
                    <Upload size={14} /> {gstFile ? gstFile.name : 'Choose File'}
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => setGstFile(e.target.files?.[0] || null)} hidden />
                  </label>
                </div>
                <div className="vr-actions">
                  <button type="button" className="vr-prev-btn" onClick={() => setStep('bank')}>Back</button>
                  <button type="submit" className="vr-submit-btn" disabled={submitting}>
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : null}
                    {submitting ? 'Submitting...' : 'Complete Registration'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>

      <style>{`
        .vendor-register-page {
          min-height: 100vh;
          background: #0a0a0b;
          color: white;
          padding: 4rem 1rem;
        }
        .vr-container {
          max-width: 600px;
          margin: 0 auto;
        }
        .vr-header {
          text-align: center;
          margin-bottom: 3rem;
        }
        .vr-back {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .vr-header h1 { font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem; }
        .vr-header p { color: #94a3b8; margin: 0; }

        .vr-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2.5rem;
          padding: 0 1rem;
        }
        .vr-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
        }
        .vr-step-icon {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          border: 2px solid transparent;
          transition: all 0.3s;
        }
        .vr-step span { font-size: 0.75rem; font-weight: 700; color: #64748b; }
        .vr-step.active .vr-step-icon { background: #0ea5e9; color: white; border-color: rgba(14, 165, 233, 0.3); }
        .vr-step.active span { color: #0ea5e9; }
        .vr-step.done .vr-step-icon { background: #22c55e; color: white; }
        .vr-step.done span { color: #22c55e; }
        .vr-step-line { flex: 1; height: 2px; background: #1e293b; margin-top: -1.25rem; }

        .vr-card {
          background: #111114;
          border: 1px solid #27272a;
          border-radius: 16px;
          padding: 2.5rem;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }
        .vr-section h3 { margin: 0 0 1.5rem; font-size: 1.25rem; }
        .vr-hint { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
        .form-group { margin-bottom: 1.25rem; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; color: #cbd5e1; }
        input, textarea, select {
          width: 100%;
          background: #0a0a0b;
          border: 1px solid #27272a;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          color: white;
          font-family: inherit;
          transition: border-color 0.2s;
        }
        input:focus, textarea:focus, select:focus { outline: none; border-color: #0ea5e9; }
        input.has-error, textarea.has-error, select.has-error { border-color: #ef4444; }
        .vr-error { display: block; color: #f87171; font-size: 0.75rem; margin-top: 0.375rem; }

        .vr-auth-notice {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.4rem;
          background: rgba(234, 179, 8, 0.08);
          border: 1px solid rgba(234, 179, 8, 0.3);
          color: #fde68a;
          border-radius: 10px;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
        }
        .vr-auth-link {
          background: none;
          border: none;
          color: #38bdf8;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          font-size: 0.875rem;
        }

        .vr-next-btn, .vr-submit-btn {
          width: 100%;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 1rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          cursor: pointer;
          margin-top: 1rem;
          transition: background 0.2s;
        }
        .vr-next-btn:hover { background: #0284c7; }
        .vr-actions { display: grid; grid-template-columns: 100px 1fr; gap: 1rem; margin-top: 1rem; }
        .vr-prev-btn {
          background: #1e293b;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }

        .vr-upload-box {
          border: 2px dashed #27272a;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          margin-bottom: 1.5rem;
        }
        .vr-upload-icon { color: #64748b; margin-bottom: 1rem; }
        .vr-upload-box h4 { margin: 0 0 0.5rem; }
        .vr-upload-box p { font-size: 0.875rem; color: #94a3b8; margin: 0 0 1.5rem; }
        .vr-file-input {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: #1e293b;
          padding: 0.5rem 1.5rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
        }

        @media (max-width: 640px) {
          .form-row { grid-template-columns: 1fr; }
          .vr-card { padding: 1.5rem; }
        }
      `}</style>
    </div>
  );
};

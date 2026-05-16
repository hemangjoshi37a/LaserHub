import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, ShieldCheck, CreditCard, FileText, CheckCircle, ArrowRight, Upload, Loader2 } from 'lucide-react';
import { vendorApi } from '../services';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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
  const [step, setStep] = useState<Step>('basic');
  const [submitting, setSubmitting] = useState(false);
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
    if (name === 'state') {
      const stateObj = STATES.find(s => s.name === value);
      setForm(prev => ({ ...prev, state: value, state_code: stateObj?.code || '' }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleNext = () => {
    if (step === 'basic') {
      if (!form.shop_name || !form.business_email || !form.mobile_number) {
        toast.error('Please fill required fields');
        return;
      }
      setStep('kyc');
    } else if (step === 'kyc') {
      if (!form.gstin || !form.business_address || !form.state) {
        toast.error('Please fill required fields');
        return;
      }
      setStep('bank');
    } else if (step === 'bank') {
      setStep('documents');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // 1. Register vendor
      const vendor = await vendorApi.registerVendor(0, { // ID 0 because service derives from token
        shop_name: form.shop_name,
        business_email: form.business_email,
        mobile_number: form.mobile_number,
        gstin: form.gstin,
        pan: form.pan,
        business_address: form.business_address,
        state: form.state,
        state_code: form.state_code,
        description: form.description,
        website: form.website,
      } as any);

      // 2. Upload GST certificate if present
      if (gstFile) {
        await vendorApi.uploadAsset(gstFile, 'gst');
      }

      toast.success('Registration submitted! Redirecting to dashboard...');
      setTimeout(() => navigate('/vendor/dashboard'), 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Registration failed. Please try again.');
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

        <div className="vr-card">
          <form onSubmit={handleSubmit}>
            {step === 'basic' && (
              <div className="vr-section animate-in">
                <h3>Business Information</h3>
                <div className="form-group">
                  <label>Shop Name *</label>
                  <input name="shop_name" value={form.shop_name} onChange={handleChange} placeholder="e.g. Precision Laser Tech" required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Business Email *</label>
                    <input name="business_email" type="email" value={form.business_email} onChange={handleChange} placeholder="contact@shop.com" required />
                  </div>
                  <div className="form-group">
                    <label>Mobile Number *</label>
                    <input name="mobile_number" value={form.mobile_number} onChange={handleChange} placeholder="9876543210" required />
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
                    <input name="gstin" value={form.gstin} onChange={handleChange} placeholder="15-digit GST number" required />
                  </div>
                  <div className="form-group">
                    <label>PAN (Optional)</label>
                    <input name="pan" value={form.pan} onChange={handleChange} placeholder="Business or Personal PAN" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Business Address *</label>
                  <textarea name="business_address" value={form.business_address} onChange={handleChange} placeholder="Full address as per GST record" required rows={2} />
                </div>
                <div className="form-group">
                  <label>State *</label>
                  <select name="state" value={form.state} onChange={handleChange} required>
                    <option value="">Select State</option>
                    {STATES.map(s => <option key={s.code} value={s.name}>{s.name}</option>)}
                  </select>
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

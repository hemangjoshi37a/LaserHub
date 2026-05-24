import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FileUpload } from '../components/FileUpload';
import { MaterialSelector } from '../components/MaterialSelector';
import { CostDisplay } from '../components/CostDisplay';
import { OrderForm } from '../components/OrderForm';
const DesignPreview3D = React.lazy(() =>
  import('../components/DesignPreview3D').then((m) => ({ default: m.DesignPreview3D }))
);
import { KerfPreview } from '../components/KerfPreview';
import { useAppStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { designApi, marketplaceApi, materialsApi, uploadApi, vendorApi, type DesignItem, type VendorProfile } from '../services';
import { resolveMediaUrl } from '../services/api';
import { PageHeader, Button, Card, Avatar, Badge } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
  Settings,
  Eye,
  ShoppingCart,
  Check,
  Users,
  Star,
  MapPin,
  Building2,
  Zap,
} from 'lucide-react';

type StepDef = {
  num: number;
  label: string;
  short: string;
  icon: React.ComponentType<{ size?: number | string }>;
};

const STEPS: StepDef[] = [
  { num: 1, label: 'Upload', short: 'Upload', icon: Upload },
  { num: 2, label: 'Configure', short: 'Config', icon: Settings },
  { num: 3, label: 'Review', short: 'Review', icon: Eye },
  { num: 4, label: 'Vendor', short: 'Vendor', icon: Users },
  { num: 5, label: 'Order', short: 'Order', icon: ShoppingCart },
];

const STEP_TITLES: Record<number, string> = {
  1: 'Upload — LaserHub',
  2: 'Configure — LaserHub',
  3: 'Review — LaserHub',
  4: 'Select Vendor — LaserHub',
  5: 'Order — LaserHub',
  6: 'Order Placed — LaserHub',
};

export const HomePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const qpStep = searchParams.get('step');
  const [step, setStep] = useState(qpStep ? Number(qpStep) : 1);
  const [designTitle, setDesignTitle] = useState('');
  const [designCategory, setDesignCategory] = useState('art');
  const [isSharing, setIsSharing] = useState(false);
  const [designShared, setDesignShared] = useState(false);
  const [designTitleFromQuery, setDesignTitleFromQuery] = useState<string | null>(null);
  const [vendorNameFromQuery, setVendorNameFromQuery] = useState<string | null>(null);

  const stepLabel = STEP_TITLES[step]?.split(' — ')[0] || 'Quote';
  const displayTitle = designTitleFromQuery
    ? `${designTitleFromQuery} (${stepLabel}) — LaserHub`
    : (STEP_TITLES[step] ?? 'Get a Custom Quote — LaserHub');

  useDocumentTitle(displayTitle);
  const {
    uploadedFile,
    selectedMaterial,
    selectedThickness,
    costEstimate,
    setUploadedFile,
    setFileAnalysis,
    setSelectedMaterial,
    setSelectedThickness,
    setSelectedVendor,
  } = useAppStore();
  const { isAuthenticated } = useAuthStore();

  // Query params from design detail / vendor link
  const qpDesignId = searchParams.get('design_id');
  const qpVendor = searchParams.get('vendor');
  const qpMaterial = searchParams.get('material');
  const qpThickness = searchParams.get('thickness');
  const qpFileIdDirect = searchParams.get('file_id');

  const [skipUploadReady, setSkipUploadReady] = useState(false);

  // Auto-load design file when design_id or file_id is in URL params
  useEffect(() => {
    if (uploadedFile) {
      if (qpDesignId || qpFileIdDirect) setSkipUploadReady(true);
      return;
    }

    // Case A: design_id — fetch design detail to get file_id + title
    if (qpDesignId) {
      (async () => {
        try {
          const detail = await marketplaceApi.getDesignDetail(Number(qpDesignId));
          if (!detail?.file_id) {
            toast.error('This design has no associated file');
            return;
          }
          setDesignTitleFromQuery(detail.title || null);
          const analysis = await uploadApi.getFileAnalysis(detail.file_id);
          setUploadedFile({
            file_id: analysis.file_id,
            filename: detail.title ? `${detail.title}` : `design-${qpDesignId}`,
            file_size: 0,
            file_type: (detail.file_info?.file_format || 'svg').toLowerCase(),
            upload_url: `/api/upload/${detail.file_id}`,
          });
          setFileAnalysis(analysis);
          setSkipUploadReady(true);
          toast.success(`Loaded design: ${detail.title}`);
        } catch {
          toast.error('Could not load the design');
        }
      })();
      return;
    }

    // Case B: raw file_id
    if (qpFileIdDirect) {
      (async () => {
        try {
          const analysis = await uploadApi.getFileAnalysis(qpFileIdDirect);
          setUploadedFile({
            file_id: analysis.file_id,
            filename: `design-${qpFileIdDirect}`,
            file_size: 0,
            file_type: 'svg',
            upload_url: `/api/upload/${qpFileIdDirect}`,
          });
          setFileAnalysis(analysis);
          setSkipUploadReady(true);
          toast.success('Design file loaded');
        } catch {
          toast.error('Could not load the design file');
        }
      })();
    }
  }, [qpDesignId, qpFileIdDirect, uploadedFile, setUploadedFile, setFileAnalysis]);

  // Sync local `step` to the URL's `?step=` param ONLY when the param itself
  // changes (e.g. the user opens a fresh deep link). Crucially we must NOT
  // depend on local `step`: doing so made this effect re-fire after every
  // in-wizard `setStep(...)` and immediately snap `step` back to the (stale,
  // never-updated) query value — silently no-op'ing "Next" for any order that
  // arrived via `?step=2` (the marketplace-design flow). Tracking the last
  // applied param value lets us advance freely once hydrated from the URL.
  const lastAppliedQpStep = React.useRef<string | null>(null);
  useEffect(() => {
    if (qpStep && qpStep !== lastAppliedQpStep.current) {
      lastAppliedQpStep.current = qpStep;
      const s = Number(qpStep);
      if (!isNaN(s)) {
        setStep(s);
      }
    }
  }, [qpStep]);

  // Pre-select material + thickness from query params
  useEffect(() => {
    if (!qpMaterial && !qpThickness) return;
    if (selectedMaterial && selectedThickness) return;
    (async () => {
      try {
        const mats = await materialsApi.listMaterials();
        let mat = selectedMaterial;
        if (qpMaterial && !mat) {
          mat = mats.find(
            (m) => m.name.toLowerCase() === qpMaterial.toLowerCase(),
          ) || null;
          if (mat) setSelectedMaterial(mat);
        }
        if (qpThickness && mat) {
          const t = Number(qpThickness);
          if (!Number.isNaN(t) && mat.available_thicknesses.includes(t)) {
            setSelectedThickness(t);
          }
        }
      } catch {
        /* no-op */
      }
    })();
  }, [qpMaterial, qpThickness, selectedMaterial, selectedThickness, setSelectedMaterial, setSelectedThickness]);

  // Resolve vendor name + select vendor in store
  useEffect(() => {
    if (!qpVendor) return;
    (async () => {
      try {
        const profile = await vendorApi.getVendor(qpVendor);
        if (profile) {
          if (profile.shop_name) setVendorNameFromQuery(profile.shop_name);
          // Pre-select the vendor in the store so Step 4 and Step 5 see it
          setSelectedVendor(profile);
        }
      } catch {
        /* show slug as fallback */
      }
    })();
  }, [qpVendor, setSelectedVendor]);

  // Auto-advance logic: only triggers if we are on the immediate previous step
  // and the user hasn't explicitly requested a different step via URL.
  
  // Auto-advance to Configure step when we arrived from design detail
  useEffect(() => {
    if (skipUploadReady && step === 1 && !qpStep) {
      setStep(2);
    }
  }, [skipUploadReady, step, qpStep]);

  // Auto-advance to Review step when material + thickness are also pre-selected
  useEffect(() => {
    if (skipUploadReady && selectedMaterial && selectedThickness && step === 2 && !qpStep) {
      // Small delay to ensure stores are synced
      const timer = setTimeout(() => setStep(3), 100);
      return () => clearTimeout(timer);
    }
  }, [skipUploadReady, selectedMaterial, selectedThickness, step, qpStep]);

  // Auto-advance to Vendor Selection step when cost is calculated (only if pre-selected from design)
  useEffect(() => {
    if (skipUploadReady && qpMaterial && qpThickness && costEstimate && step === 3 && !qpStep) {
      setStep(4);
    }
  }, [skipUploadReady, qpMaterial, qpThickness, costEstimate, step, qpStep]);

  // Auto-advance to Order step if a vendor was pre-selected in URL
  useEffect(() => {
    if (qpVendor && step === 4 && !qpStep) {
      setStep(5);
    }
  }, [qpVendor, step, qpStep]);

  const handleCalculateComplete = () => {
    // CostDisplay already handles auto-calculation; nothing to do here
    // but we keep the handler so the component contract is preserved.
  };

  const handleOrderSuccess = () => {
    setStep(6);
  };

  const handleShareDesign = async () => {
    if (!uploadedFile || !designTitle.trim()) return;
    setIsSharing(true);
    try {
      await designApi.createDesign({
        file_id: uploadedFile.file_id,
        title: designTitle,
        category: designCategory,
        is_public: true,
      });
      setDesignShared(true);
      toast.success('Design shared with the community!');
    } catch {
      toast.error('Failed to share design');
    } finally {
      setIsSharing(false);
    }
  };

  const canGoTo = (target: number): boolean => {
    // Always allow going back to a step user has already completed
    if (target < step) return true;
    if (target === step) return true;
    // Forward jumps only if prerequisites satisfied
    if (target === 2) return !!uploadedFile;
    if (target === 3) return !!uploadedFile && !!selectedMaterial && !!selectedThickness;
    if (target === 4) return !!costEstimate;
    if (target === 5) return !!costEstimate; // Could add !!selectedVendor check if we want to force it
    return false;
  };

  const jumpTo = (target: number) => {
    if (canGoTo(target)) setStep(target);
  };

  return (
    <div className="upl-page">
      <PageHeader
        title={designTitleFromQuery ? `Ordering: ${designTitleFromQuery}` : "Get a Custom Quote"}
        subtitle={
          vendorNameFromQuery
            ? `Finalizing your order with ${vendorNameFromQuery}`
            : "Upload your design and get instant pricing from multiple vendors."
        }
      />

      {/* Sticky stepper */}
      <div className="upl-stepper-wrap">
        <div className="upl-stepper" role="list">
          {STEPS.map((s, i) => {
            const isDone = s.num < step;
            const isActive = step === s.num;
            const isFuture = s.num > step;
            const Icon = s.icon;
            const inner = (
              <>
                <span className="upl-step-circle">
                  {isDone ? <Check size={16} strokeWidth={3} /> : <Icon size={15} />}
                </span>
                <span className="upl-step-label">{s.label}</span>
                <span className="upl-step-label-sm">{s.short}</span>
              </>
            );
            return (
              <React.Fragment key={s.num}>
                {i > 0 && (
                  <div
                    className={`upl-step-line ${step > s.num ? 'done' : ''}`}
                    aria-hidden="true"
                  />
                )}
                {isDone ? (
                  <button
                    type="button"
                    role="listitem"
                    className="upl-step done clickable step-clickable"
                    onClick={() => jumpTo(s.num)}
                    aria-label={`Go back to step ${s.num}: ${s.label}`}
                  >
                    {inner}
                  </button>
                ) : (
                  <div
                    role="listitem"
                    className={`upl-step ${isActive ? 'active' : ''} ${isFuture ? 'step-future' : ''}`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {inner}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {(designTitleFromQuery || vendorNameFromQuery || qpVendor) && (
        <div className="upl-context-banner" style={{
          margin: '0.75rem auto 1rem',
          maxWidth: 1100,
          padding: '0.85rem 1.1rem',
          // Translucent primary tint over the dark theme, with explicit
          // readable text. (Previously it hardcoded a light background with no
          // text color, so the inherited near-white theme text rendered
          // invisibly on it — appearing as an empty white box.)
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.45)',
          color: 'var(--text-primary, #f1f5f9)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: '0.95rem',
        }}>
          {designTitleFromQuery && (
            <div>
              <strong>You're ordering the "{designTitleFromQuery}" design</strong>
              {skipUploadReady && <> — file is ready to go.</>}
            </div>
          )}
          {(vendorNameFromQuery || qpVendor) && (
            <div style={{ opacity: 0.85 }}>
              Ordering from <strong>{vendorNameFromQuery || qpVendor}</strong>
              {qpMaterial && <> · {qpMaterial}</>}
              {qpThickness && <> · {qpThickness}mm</>}
            </div>
          )}
        </div>
      )}

      <div className="upl-body">
        {step === 1 && (
          <Step1Upload
            isAuthenticated={isAuthenticated}
            canNext={!!uploadedFile}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2Configure
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            canNext={!!selectedMaterial && !!selectedThickness}
          />
        )}

        {step === 3 && (
          <Step3Review
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            canNext={!!costEstimate}
            onCalculateComplete={handleCalculateComplete}
          />
        )}

        {step === 4 && (
          <Step4VendorSelection
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}
        
        {step === 5 && (
          <Step5Order onBack={() => setStep(4)} onSuccess={handleOrderSuccess} />
        )}

        {step === 6 && (
          <div className="upl-success animate-in">
            <Card>
              <CheckCircle size={56} className="upl-success-icon" />
              <h2>Order Placed Successfully!</h2>
              <p>Thank you for your order. We'll contact you soon.</p>

              <div className="upl-share">
                <h3>Share your design with the community?</h3>
                <p>Make your design open-source so others can cut it too.</p>
                <div className="upl-share-form">
                  <input
                    type="text"
                    placeholder="Design title (e.g. 'Custom Dove Wall Art')"
                    value={designTitle}
                    onChange={(e) => setDesignTitle(e.target.value)}
                  />
                  <select
                    value={designCategory}
                    onChange={(e) => setDesignCategory(e.target.value)}
                  >
                    <option value="art">Art & Wall Pieces</option>
                    <option value="signage">Signage & Letters</option>
                    <option value="jewelry">Jewelry & Accessories</option>
                    <option value="home_decor">Home Decor</option>
                    <option value="mechanical">Mechanical Parts</option>
                    <option value="stencils">Stencils & Templates</option>
                    <option value="educational">Educational & Puzzles</option>
                    <option value="other">Other</option>
                  </select>
                  <Button
                    variant="primary"
                    onClick={handleShareDesign}
                    disabled={!designTitle.trim() || isSharing}
                  >
                    {isSharing ? 'Sharing…' : 'Share Design'}
                  </Button>
                </div>
                {designShared && (
                  <p className="upl-share-success">
                    Design shared! Others can now find and order it.
                  </p>
                )}
              </div>

              <Button variant="secondary" onClick={() => window.location.reload()}>
                Start New Order
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Step 1 — Upload
// ───────────────────────────────────────────────────────────────────────────

const Step1Upload: React.FC<{
  isAuthenticated: boolean;
  canNext: boolean;
  onNext: () => void;
}> = ({ isAuthenticated, canNext, onNext }) => {
  const [myDesigns, setMyDesigns] = useState<DesignItem[] | null>(null);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [pickingDesignId, setPickingDesignId] = useState<number | null>(null);
  const [selectedDesignId, setSelectedDesignId] = useState<number | null>(null);
  const { setUploadedFile, setFileAnalysis, uploadedFile } = useAppStore();

  // When the file is cleared (e.g. user hits "Replace file"), drop the
  // selected-design highlight so the tiles reflect the real ready state.
  useEffect(() => {
    if (!uploadedFile) setSelectedDesignId(null);
  }, [uploadedFile]);

  // Pick a saved design: resolve its underlying file_id and seed the same
  // store state a successful upload sets (uploadedFile + fileAnalysis), which
  // is what gates the "Next: Configure" button (canNext = !!uploadedFile).
  const handlePickDesign = async (d: DesignItem) => {
    if (pickingDesignId !== null) return;
    setPickingDesignId(d.id);
    try {
      const detail = await marketplaceApi.getDesignDetail(d.id);
      if (!detail?.file_id) {
        toast.error('This design has no associated file');
        return;
      }
      const analysis = await uploadApi.getFileAnalysis(detail.file_id);
      setUploadedFile({
        file_id: analysis.file_id,
        filename: d.title || `design-${d.id}`,
        file_size: 0,
        file_type: (detail.file_info?.file_format || 'svg').toLowerCase(),
        upload_url: `/api/upload/${detail.file_id}`,
      });
      setFileAnalysis(analysis);
      setSelectedDesignId(d.id);
      toast.success(`Selected design: ${d.title}`);
    } catch {
      toast.error('Could not load this design');
    } finally {
      setPickingDesignId(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoadingDesigns(true);
    designApi
      .getMyDesigns()
      .then((d) => {
        if (!cancelled) setMyDesigns(d);
      })
      .catch(() => {
        if (!cancelled) setMyDesigns([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDesigns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return (
    <div className="upl-step-content animate-in">
      <FileUpload />

      {isAuthenticated && (
        <div className="upl-my-designs">
          <h3>Or pick from your designs</h3>
          {loadingDesigns ? (
            <p className="upl-muted">Loading your designs…</p>
          ) : myDesigns && myDesigns.length > 0 ? (
            <div className="upl-my-designs-grid">
              {myDesigns.slice(0, 8).map((d) => {
                const isSelected = selectedDesignId === d.id;
                const isPicking = pickingDesignId === d.id;
                return (
                  <div
                    key={d.id}
                    className={`upl-design-card${isSelected ? ' selected' : ''}`}
                    title={d.title}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-busy={isPicking}
                    onClick={() => handlePickDesign(d)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePickDesign(d);
                      }
                    }}
                    style={
                      isSelected
                        ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-soft)' }
                        : isPicking
                          ? { opacity: 0.6, pointerEvents: 'none' }
                          : undefined
                    }
                  >
                    <div className="upl-design-thumb">
                      {d.thumbnail_url ? (
                        <img src={resolveMediaUrl(d.thumbnail_url)!} alt={d.title} style={{ background: '#fff', padding: 2, borderRadius: 4 }} />
                      ) : (
                        <span className="upl-design-thumb-ph">{d.title.charAt(0)}</span>
                      )}
                    </div>
                    <span className="upl-design-title">
                      {isSelected ? '✓ ' : ''}{d.title}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="upl-muted">No saved designs yet.</p>
          )}
        </div>
      )}

      <div className="upl-step-actions upl-step-actions-end">
        <Button
          variant="primary"
          disabled={!canNext}
          onClick={onNext}
          iconRight={<ArrowRight size={16} />}
        >
          Next: Configure
        </Button>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Step 2 — Configure (material + thickness + qty) with sticky sidebar summary
// ───────────────────────────────────────────────────────────────────────────

const Step2Configure: React.FC<{
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}> = ({ onBack, onNext, canNext }) => {
  const {
    uploadedFile,
    selectedMaterial,
    selectedThickness,
    quantity,
  } = useAppStore();

  return (
    <div className="upl-step-content upl-two-col animate-in">
      <div className="upl-main-col">
        <MaterialSelector />
      </div>
      <aside className="upl-sidebar">
        <Card className="upl-summary-card">
          <h4>Your selection</h4>
          <dl>
            <dt>File</dt>
            <dd>{uploadedFile?.filename || '—'}</dd>
            <dt>Material</dt>
            <dd>{selectedMaterial?.name || '—'}</dd>
            <dt>Thickness</dt>
            <dd>{selectedThickness ? `${selectedThickness} mm` : '—'}</dd>
            <dt>Quantity</dt>
            <dd>{quantity}</dd>
          </dl>
        </Card>
      </aside>

      <div className="upl-step-actions">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!canNext}
          iconRight={<ArrowRight size={16} />}
        >
          Next: Review
        </Button>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Step 3 — Review (3D preview + cost breakdown side-by-side)
// ───────────────────────────────────────────────────────────────────────────

const Step3Review: React.FC<{
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
  onCalculateComplete: () => void;
}> = ({ onBack, onNext, canNext, onCalculateComplete }) => {
  return (
    <div className="upl-step-content animate-in">
      <div className="upl-review-grid">
        <div className="upl-review-preview">
          <React.Suspense fallback={<div className="preview-panel preview-empty">Loading 3D Engine…</div>}>
            <DesignPreview3D />
          </React.Suspense>
          <KerfPreview />
        </div>
        <div className="upl-review-cost">
          <CostDisplay onCalculateComplete={onCalculateComplete} />
        </div>
      </div>

      <div className="upl-step-actions">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={!canNext}
          iconRight={<ArrowRight size={16} />}
        >
          Next: Order
        </Button>
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Step 4 — Vendor Selection (Admin vs Vendor list)
// ───────────────────────────────────────────────────────────────────────────

const Step4VendorSelection: React.FC<{
  onBack: () => void;
  onNext: () => void;
}> = ({ onBack, onNext }) => {
  const { selectedVendor, setSelectedVendor } = useAppStore();
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await vendorApi.listVendors();
        setVendors(list);
      } catch (err) {
        toast.error('Could not load vendor list');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = (v: VendorProfile | null) => {
    setSelectedVendor(v);
    onNext();
  };

  return (
    <div className="upl-step-content animate-in">
      <div className="vendor-selection-grid">
        {/* Admin Option */}
        <div 
          className={`vendor-sel-card admin-card ${selectedVendor === null ? 'active' : ''}`}
          onClick={() => handleSelect(null)}
        >
          <div className="vendor-sel-icon">
            <Building2 size={24} />
          </div>
          <div className="vendor-sel-info">
            <h4>LaserHub Official</h4>
            <p>Direct fulfillment. We pick the best local shop for your order.</p>
            <div className="vendor-sel-badges">
              <Badge variant="success"><Zap size={10} /> Fast Track</Badge>
              <Badge variant="info">Official</Badge>
            </div>
          </div>
          <div className="vendor-sel-action">
            <Button
              variant={selectedVendor === null ? 'primary' : 'ghost'}
              size="sm"
              iconRight={selectedVendor === null ? <ArrowRight size={14} /> : undefined}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
              }}
            >
              {selectedVendor === null ? 'Continue' : 'Select'}
            </Button>
          </div>
        </div>

        <div className="vendor-divider">
          <span>Or choose a specific shop</span>
        </div>

        {loading ? (
          <div className="vendor-sel-loading">Loading vendors...</div>
        ) : (
          <div className="vendor-sel-list">
            {vendors.map((v) => (
              <div 
                key={v.id} 
                className={`vendor-sel-card ${selectedVendor?.id === v.id ? 'active' : ''}`}
                onClick={() => handleSelect(v)}
              >
                <Avatar src={resolveMediaUrl(v.logo_url)} name={v.shop_name} size={48} />
                <div className="vendor-sel-info">
                  <h4>{v.shop_name}</h4>
                  <div className="vendor-sel-meta">
                    <span className="rating"><Star size={12} fill="currentColor" /> {v.rating.toFixed(1)}</span>
                    <span className="location"><MapPin size={12} /> {v.location || 'India'}</span>
                  </div>
                  <p className="vendor-sel-desc">{v.description || 'Verified LaserHub manufacturing partner.'}</p>
                </div>
                <div className="vendor-sel-action">
                  <Button
                    variant={selectedVendor?.id === v.id ? 'primary' : 'ghost'}
                    size="sm"
                    iconRight={selectedVendor?.id === v.id ? <ArrowRight size={14} /> : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(v);
                    }}
                  >
                    {selectedVendor?.id === v.id ? 'Continue' : 'Select'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="upl-step-actions">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
      </div>
    </div>
  );
};

const Step5Order: React.FC<{ onBack: () => void; onSuccess: () => void }> = ({
  onBack,
  onSuccess,
}) => {
  const {
    uploadedFile,
    selectedMaterial,
    selectedThickness,
    quantity,
    costEstimate,
  } = useAppStore();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);

  return (
    <div className="upl-step-content upl-two-col animate-in">
      <div className="upl-main-col">
        <OrderForm onSuccess={onSuccess} />
      </div>
      <aside className="upl-sidebar">
        <Card className="upl-summary-card">
          <h4>Order summary</h4>
          <dl>
            <dt>File</dt>
            <dd>{uploadedFile?.filename || '—'}</dd>
            <dt>Material</dt>
            <dd>{selectedMaterial?.name || '—'}</dd>
            <dt>Thickness</dt>
            <dd>{selectedThickness ? `${selectedThickness} mm` : '—'}</dd>
            <dt>Quantity</dt>
            <dd>{quantity}</dd>
          </dl>
          {costEstimate && (
            <div className="upl-summary-totals">
              <div className="upl-summary-row">
                <span>Subtotal</span>
                <span>{fp(costEstimate.breakdown.subtotal)}</span>
              </div>
              <div className="upl-summary-row">
                <span>Tax</span>
                <span>{fp(costEstimate.breakdown.tax)}</span>
              </div>
              <div className="upl-summary-row upl-summary-total">
                <span>Total</span>
                <span>{fp(costEstimate.breakdown.total)}</span>
              </div>
            </div>
          )}
        </Card>
      </aside>

      <div className="upl-step-actions">
        <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={16} />}>
          Back
        </Button>
      </div>
    </div>
  );
};

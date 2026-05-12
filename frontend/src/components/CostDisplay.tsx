import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Clock, Scissors, ShieldCheck, AlertTriangle, XCircle, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import { useAppStore } from '../store';
import { calculateApi, uploadApi, optimizationApi } from '../services';
import type { ValidationResult, FileAnalysis } from '../services';
import { api } from '../services/api';
import { toast } from 'sonner';
import { Skeleton } from './Skeleton';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { QuoteComparison, type VendorQuoteDTO } from './QuoteComparison';

export const CostDisplay: React.FC<{ onCalculateComplete: () => void }> = ({ onCalculateComplete }) => {
  const {
    uploadedFile,
    fileAnalysis,
    selectedMaterial,
    selectedThickness,
    quantity,
    costEstimate,
    setCostEstimate,
    setIsCalculating,
    isCalculating,
    setUploadedFile,
    setFileAnalysis,
  } = useAppStore();

  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);

  const [vendorQuotes, setVendorQuotes] = useState<VendorQuoteDTO[]>([]);
  const [_loadingQuotes, setLoadingQuotes] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!uploadedFile) { setValidation(null); return; }
    let cancelled = false;
    uploadApi.validateFile(uploadedFile.file_id)
      .then((res) => { if (!cancelled) setValidation(res); })
      .catch(() => { if (!cancelled) setValidation(null); });
    return () => { cancelled = true; };
  }, [uploadedFile?.file_id]);

  const handleAutoFix = async () => {
    if (!uploadedFile) return;
    
    setIsCalculating(true);
    const toastId = toast.loading('Optimizing design...');
    
    try {
      const optimized = await optimizationApi.optimizeFile(uploadedFile.file_id);
      
      // Update global store with the new "optimized" file version
      setFileAnalysis(optimized);
      setUploadedFile({
        file_id: optimized.file_id,
        filename: `optimized_${uploadedFile.filename}`,
        file_size: uploadedFile.file_size, // Approximation
        file_type: uploadedFile.file_type,
        upload_url: `/api/upload/${optimized.file_id}`
      });
      
      toast.success('Design Optimized!', {
        id: toastId,
        description: 'Duplicates removed and paths closed.',
      });
    } catch (error: any) {
      toast.error('Optimization failed', {
        id: toastId,
        description: error.response?.data?.detail || 'Please try again',
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleCalculate = async () => {
    if (!uploadedFile || !selectedMaterial || !selectedThickness) {
      toast.error('Please upload a file and select material');
      return;
    }

    setIsCalculating(true);

    try {
      const estimate = await calculateApi.calculateCost(
        uploadedFile.file_id,
        selectedMaterial.id,
        selectedThickness,
        quantity
      );
      setCostEstimate(estimate);
      onCalculateComplete();
      
      toast.success('Cost calculated successfully!');
    } catch (error: any) {
      toast.error('Calculation failed', {
        description: error.response?.data?.detail || 'Please try again',
      });
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (costEstimate && uploadedFile && selectedMaterial && selectedThickness) {
      loadVendorQuotes();
    }
  }, [costEstimate]);

  const loadVendorQuotes = async () => {
    if (!uploadedFile || !selectedMaterial || !selectedThickness) return;
    setLoadingQuotes(true);
    try {
      const { data } = await api.post('/marketplace/compare', null, {
        params: {
          file_id: uploadedFile.file_id,
          material_id: selectedMaterial.id,
          thickness_mm: selectedThickness,
          quantity: quantity,
        },
      });
      setVendorQuotes(data.quotes || []);
    } catch {
      // No vendors available yet - that's fine
      setVendorQuotes([]);
    } finally {
      setLoadingQuotes(false);
    }
  };

  // Auto-calculate when selections change
  useEffect(() => {
    if (uploadedFile && selectedMaterial && selectedThickness) {
      const timer = setTimeout(async () => {
        setIsCalculating(true);
        try {
          const estimate = await calculateApi.calculateCost(
            uploadedFile.file_id,
            selectedMaterial.id,
            selectedThickness,
            quantity
          );
          setCostEstimate(estimate);
        } catch (error: any) {
          toast.error('Calculation failed', {
            description: error.response?.data?.detail || 'Please try again',
          });
        } finally {
          setIsCalculating(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [uploadedFile?.file_id, selectedMaterial?.id, selectedThickness, quantity]);

  if (!fileAnalysis) return null;

  return (
    <div className="cost-display cost-display-compact">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3>Analysis & Cost</h3>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          {currency.code} · {currency.country}
        </span>
      </div>

      {validation && (() => {
        const score = validation.score;
        const tone = score >= 85 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
        const Icon = score >= 85 ? ShieldCheck : score >= 60 ? AlertTriangle : XCircle;
        const label = score >= 85 ? 'Laser-ready' : score >= 60 ? 'Needs review' : 'Fix before cutting';
        return (
          <div
            style={{
              margin: '0.5rem 0 0.75rem',
              padding: '0.55rem 0.75rem',
              border: `1px solid ${tone}`,
              borderRadius: 8,
              background: `${tone}14`,
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: validation.issues.length ? 'pointer' : 'default' }}
              onClick={() => validation.issues.length && setValidationOpen((o) => !o)}
            >
              <Icon size={16} color={tone} />
              <strong style={{ color: tone }}>{label}</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Score {score}/100 · {validation.summary}
              </span>
              {validation.issues.length > 0 && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {validationOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              )}
            </div>
            {validationOpen && validation.issues.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}>
                <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                  {validation.issues.map((issue, idx) => (
                    <li key={idx} style={{ color: issue.severity === 'error' ? '#ef4444' : issue.severity === 'warning' ? '#f59e0b' : 'var(--text-secondary)' }}>
                      <strong style={{ textTransform: 'uppercase', fontSize: '0.68rem' }}>{issue.severity}</strong>
                      {issue.count > 1 && <span> ×{issue.count}</span>} — {issue.message}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleAutoFix}
                  className="calculate-btn"
                  style={{ marginTop: '0.5rem', fontSize: '0.78rem', padding: '0.4rem 0.8rem', background: 'var(--accent-color)', color: 'white', border: 'none' }}
                  type="button"
                  disabled={isCalculating}
                >
                  <Wand2 size={12} style={{ marginRight: 4 }} /> 
                  {isCalculating ? 'Processing...' : '✨ Auto-Optimize Design'}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      <table className="analysis-table">
        <tbody>
          <tr>
            <td className="analysis-label"><Scissors size={14} /> Dimensions</td>
            <td className="analysis-value">{fileAnalysis.width_mm.toFixed(1)} x {fileAnalysis.height_mm.toFixed(1)} mm</td>
            <td className="analysis-label"><Calculator size={14} /> Area</td>
            <td className="analysis-value">{fileAnalysis.area_cm2.toFixed(2)} cm²</td>
          </tr>
          <tr>
            <td className="analysis-label"><Scissors size={14} /> Cut Length</td>
            <td className="analysis-value">{(fileAnalysis.cut_length_mm / 1000).toFixed(2)} m</td>
            <td className="analysis-label"><Clock size={14} /> Cut Time</td>
            <td className="analysis-value">{fileAnalysis.estimated_cut_time_minutes.toFixed(1)} min</td>
          </tr>
        </tbody>
      </table>

      {isCalculating ? (
        <div className="cost-breakdown cost-breakdown-compact">
          <h4>Calculating...</h4>
          {[1, 2, 3].map((i) => (
            <div key={i} className="cost-item">
              <Skeleton width="40%" height="1rem" />
              <Skeleton width="20%" height="1rem" />
            </div>
          ))}
        </div>
      ) : costEstimate && (
        <div className="cost-breakdown cost-breakdown-compact">
          <h4>Cost Breakdown</h4>

          <div className="cost-item">
            <span className="cost-item-label">Material</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.material_cost)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Laser Time</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.laser_time_cost)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Energy</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.energy_cost)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Setup</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.setup_fee)}</span>
          </div>
          <div className="cost-divider"></div>
          <div className="cost-item subtotal">
            <span className="cost-item-label">Subtotal</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.subtotal)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Tax</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.tax)}</span>
          </div>
          <div className="cost-divider"></div>
          <div className="cost-item total">
            <span className="cost-item-label">Total</span>
            <span className="cost-item-value">{fp(costEstimate.breakdown.total)}</span>
          </div>
          {costEstimate.estimated_production_time_hours > 0 && (
            <div className="production-time">
              <Clock size={14} />
              <span>Production: {costEstimate.estimated_production_time_hours.toFixed(1)} hrs</span>
            </div>
          )}
        </div>
      )}

      {/* Smart Quote Comparison */}
      {vendorQuotes.length > 0 && selectedMaterial && selectedThickness && (
        <QuoteComparison
          quotes={vendorQuotes}
          material={selectedMaterial.name}
          materialId={selectedMaterial.id}
          thickness={selectedThickness}
          quantity={quantity}
          fileId={uploadedFile?.file_id}
          onSelect={(q) => {
            toast.success(`Selected ${q.vendor_name}`);
            if (q.vendor_slug) {
              navigate(
                `/upload?file_id=${uploadedFile?.file_id}&vendor=${q.vendor_slug}&material=${encodeURIComponent(
                  selectedMaterial.name,
                )}&thickness=${selectedThickness}`,
              );
            }
          }}
        />
      )}

      <button
        className="calculate-btn calculate-btn-compact"
        onClick={handleCalculate}
        disabled={isCalculating || !selectedMaterial || !selectedThickness}
      >
        {isCalculating ? 'Calculating...' : 'Recalculate'}
      </button>
    </div>
  );
};

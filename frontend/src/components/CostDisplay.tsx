import React, { useEffect } from 'react';
import { Calculator, Clock, Scissors } from 'lucide-react';
import { useAppStore } from '../store';
import { calculateApi } from '../services';
import { toast } from 'sonner';
import { Skeleton } from './Skeleton';

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
  } = useAppStore();

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
      <h3>Analysis & Cost</h3>

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
            <span className="cost-item-value">${costEstimate.breakdown.material_cost.toFixed(2)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Laser Time</span>
            <span className="cost-item-value">${costEstimate.breakdown.laser_time_cost.toFixed(2)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Energy</span>
            <span className="cost-item-value">${costEstimate.breakdown.energy_cost.toFixed(2)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Setup</span>
            <span className="cost-item-value">${costEstimate.breakdown.setup_fee.toFixed(2)}</span>
          </div>
          <div className="cost-divider"></div>
          <div className="cost-item subtotal">
            <span className="cost-item-label">Subtotal</span>
            <span className="cost-item-value">${costEstimate.breakdown.subtotal.toFixed(2)}</span>
          </div>
          <div className="cost-item">
            <span className="cost-item-label">Tax</span>
            <span className="cost-item-value">${costEstimate.breakdown.tax.toFixed(2)}</span>
          </div>
          <div className="cost-divider"></div>
          <div className="cost-item total">
            <span className="cost-item-label">Total</span>
            <span className="cost-item-value">${costEstimate.breakdown.total.toFixed(2)}</span>
          </div>
          {costEstimate.estimated_production_time_hours > 0 && (
            <div className="production-time">
              <Clock size={14} />
              <span>Production: {costEstimate.estimated_production_time_hours.toFixed(1)} hrs</span>
            </div>
          )}
        </div>
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

import React, { useEffect } from 'react';
import { Calculator, Clock, Zap, Scissors } from 'lucide-react';
import { useAppStore } from '../store';
import { calculateApi } from '../services';
import { toast } from 'sonner';

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
      const timer = setTimeout(() => {
        handleCalculate();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [uploadedFile, selectedMaterial, selectedThickness, quantity]);

  if (!fileAnalysis) return null;

  return (
    <div className="cost-display">
      <h2>File Analysis & Cost Estimate</h2>

      <div className="analysis-grid">
        <div className="analysis-card">
          <div className="analysis-icon">
            <Scissors size={24} />
          </div>
          <div className="analysis-info">
            <p className="analysis-label">Dimensions</p>
            <p className="analysis-value">
              {fileAnalysis.width_mm.toFixed(1)} × {fileAnalysis.height_mm.toFixed(1)} mm
            </p>
          </div>
        </div>

        <div className="analysis-card">
          <div className="analysis-icon">
            <Calculator size={24} />
          </div>
          <div className="analysis-info">
            <p className="analysis-label">Area</p>
            <p className="analysis-value">{fileAnalysis.area_cm2.toFixed(2)} cm²</p>
          </div>
        </div>

        <div className="analysis-card">
          <div className="analysis-icon">
            <Scissors size={24} />
          </div>
          <div className="analysis-info">
            <p className="analysis-label">Cut Length</p>
            <p className="analysis-value">{(fileAnalysis.cut_length_mm / 1000).toFixed(2)} m</p>
          </div>
        </div>

        <div className="analysis-card">
          <div className="analysis-icon">
            <Clock size={24} />
          </div>
          <div className="analysis-info">
            <p className="analysis-label">Est. Cut Time</p>
            <p className="analysis-value">{fileAnalysis.estimated_cut_time_minutes.toFixed(1)} min</p>
          </div>
        </div>
      </div>

      {costEstimate && (
        <div className="cost-breakdown">
          <h3>Cost Breakdown</h3>
          
          <div className="cost-item">
            <div className="cost-item-label">
              <Calculator size={16} />
              Material Cost
            </div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.material_cost.toFixed(2)}
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-item-label">
              <Scissors size={16} />
              Laser Time Cost
            </div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.laser_time_cost.toFixed(2)}
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-item-label">
              <Zap size={16} />
              Energy Cost
            </div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.energy_cost.toFixed(2)}
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-item-label">Setup Fee</div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.setup_fee.toFixed(2)}
            </div>
          </div>

          <div className="cost-divider"></div>

          <div className="cost-item subtotal">
            <div className="cost-item-label">Subtotal</div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.subtotal.toFixed(2)}
            </div>
          </div>

          <div className="cost-item">
            <div className="cost-item-label">Tax</div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.tax.toFixed(2)}
            </div>
          </div>

          <div className="cost-divider"></div>

          <div className="cost-item total">
            <div className="cost-item-label">Total</div>
            <div className="cost-item-value">
              ${costEstimate.breakdown.total.toFixed(2)}
            </div>
          </div>

          {costEstimate.estimated_production_time_hours > 0 && (
            <div className="production-time">
              <Clock size={16} />
              <span>
                Estimated Production Time: {costEstimate.estimated_production_time_hours.toFixed(1)} hours
              </span>
            </div>
          )}
        </div>
      )}

      <button
        className="calculate-btn"
        onClick={handleCalculate}
        disabled={isCalculating || !selectedMaterial || !selectedThickness}
      >
        {isCalculating ? 'Calculating...' : 'Calculate Cost'}
      </button>
    </div>
  );
};

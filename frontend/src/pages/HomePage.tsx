import React, { useState } from 'react';
import { FileUpload } from '../components/FileUpload';
import { MaterialSelector } from '../components/MaterialSelector';
import { CostDisplay } from '../components/CostDisplay';
import { OrderForm } from '../components/OrderForm';
import { useAppStore } from '../store';
import { CheckCircle, ArrowRight } from 'lucide-react';

export const HomePage: React.FC = () => {
  const [step, setStep] = useState(1);
  const { uploadedFile, selectedMaterial, costEstimate } = useAppStore();

  const handleCalculateComplete = () => {
    if (uploadedFile && selectedMaterial && costEstimate) {
      setStep(3);
    }
  };

  const handleOrderSuccess = () => {
    setStep(5);
  };

  return (
    <div className="home-page">
      <header className="hero">
        <h1>⚡LaserHub</h1>
        <p>Instant Laser Cutting Cost Calculator</p>
        <p className="hero-subtitle">
          Upload your vector files, select material, and get instant pricing
        </p>
      </header>

      <div className="steps-indicator">
        <div className={`step ${step >= 1 ? 'active' : ''}`}>
          <div className="step-number">1</div>
          <span>Upload</span>
        </div>
        <ArrowRight size={16} className="step-arrow" />
        <div className={`step ${step >= 2 ? 'active' : ''}`}>
          <div className="step-number">2</div>
          <span>Configure</span>
        </div>
        <ArrowRight size={16} className="step-arrow" />
        <div className={`step ${step >= 3 ? 'active' : ''}`}>
          <div className="step-number">3</div>
          <span>Review</span>
        </div>
        <ArrowRight size={16} className="step-arrow" />
        <div className={`step ${step >= 4 ? 'active' : ''}`}>
          <div className="step-number">4</div>
          <span>Order</span>
        </div>
      </div>

      <main className="main-content">
        {step === 1 && (
          <div className="step-content animate-in">
            <FileUpload />
            {uploadedFile && (
              <button
                className="next-btn"
                onClick={() => setStep(2)}
              >
                Next: Select Material
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="step-content animate-in">
            <MaterialSelector />
            <div className="step-buttons">
              <button className="back-btn" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="next-btn"
                onClick={() => setStep(3)}
                disabled={!selectedMaterial}
              >
                Next: Review Cost
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="step-content animate-in">
            <CostDisplay onCalculateComplete={handleCalculateComplete} />
            <div className="step-buttons">
              <button className="back-btn" onClick={() => setStep(2)}>
                Back
              </button>
              {costEstimate && (
                <button
                  className="next-btn"
                  onClick={() => setStep(4)}
                >
                  Next: Place Order
                  <ArrowRight size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="step-content animate-in">
            <OrderForm onSuccess={handleOrderSuccess} />
            <div className="step-buttons">
              <button className="back-btn" onClick={() => setStep(3)}>
                Back
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="success-message animate-in">
            <CheckCircle size={64} className="success-icon" />
            <h2>Order Placed Successfully!</h2>
            <p>Thank you for your order. We'll contact you soon.</p>
            <button className="new-order-btn" onClick={() => window.location.reload()}>
              Start New Order
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

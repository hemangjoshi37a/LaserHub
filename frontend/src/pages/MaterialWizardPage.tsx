import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, ArrowLeft, Check, GitCompare } from 'lucide-react';
import { materialsApi } from '../services';
import type { Material } from '../services';
import { recommendMaterials, type WizardAnswers } from '../utils/materialWizard';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const QUESTIONS: Array<{
  key: keyof WizardAnswers;
  title: string;
  options: { value: string; label: string }[];
}> = [
  {
    key: 'useCase',
    title: 'What are you making?',
    options: [
      { value: 'signage', label: 'Signage' },
      { value: 'enclosure', label: 'Enclosure / Box' },
      { value: 'jewelry', label: 'Jewelry' },
      { value: 'decoration', label: 'Decoration' },
      { value: 'prototype', label: 'Prototype' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    key: 'environment',
    title: 'Indoor or outdoor use?',
    options: [
      { value: 'indoor', label: 'Indoor' },
      { value: 'outdoor', label: 'Outdoor' },
    ],
  },
  {
    key: 'strength',
    title: 'Strength requirement?',
    options: [
      { value: 'low', label: 'Low (display only)' },
      { value: 'medium', label: 'Medium (daily use)' },
      { value: 'high', label: 'High (load bearing)' },
    ],
  },
  {
    key: 'budget',
    title: 'Budget per piece?',
    options: [
      { value: 'low', label: '< ₹100' },
      { value: 'medium', label: '₹100 – ₹500' },
      { value: 'high', label: '₹500 +' },
    ],
  },
  {
    key: 'finish',
    title: 'Finish preference?',
    options: [
      { value: 'matte', label: 'Matte' },
      { value: 'glossy', label: 'Glossy' },
      { value: 'natural_wood', label: 'Natural wood' },
      { value: 'metallic', label: 'Metallic' },
      { value: 'any', label: 'Any' },
    ],
  },
];

interface Props {
  embedded?: boolean;
  onClose?: () => void;
  onPick?: (m: Material) => void;
}

export const MaterialWizardPage: React.FC<Props> = ({ embedded, onClose, onPick }) => {
  useDocumentTitle('Material Wizard — LaserHub');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [step, setStep] = useState<Step>(0);
  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({});
  const navigate = useNavigate();
  const { setSelectedMaterial, setSelectedThickness } = useAppStore();

  useEffect(() => {
    materialsApi.listMaterials().then(setMaterials).catch(() => toast.error('Failed to load materials'));
  }, []);

  const results = useMemo(() => {
    if (step < 5 || materials.length === 0) return [];
    return recommendMaterials(materials, answers as WizardAnswers, 3);
  }, [step, materials, answers]);

  const pick = (opt: string) => {
    const q = QUESTIONS[step];
    setAnswers((a) => ({ ...a, [q.key]: opt }));
    setStep((s) => (s + 1) as Step);
  };

  const handleOrder = (m: Material) => {
    setSelectedMaterial(m);
    if (m.available_thicknesses.length > 0) setSelectedThickness(m.available_thicknesses[0]);
    onPick?.(m);
    if (!embedded) navigate('/upload');
  };

  const progress = Math.min(100, (step / 5) * 100);

  return (
    <div className={embedded ? '' : 'container'} style={{ padding: embedded ? 0 : '2rem 1rem', maxWidth: 760, margin: '0 auto' }}>
      {!embedded && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>
            <Sparkles size={22} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Material Wizard
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Answer 5 quick questions and we'll recommend the best materials for your project.
          </p>
        </div>
      )}

      <div
        style={{
          height: 6,
          background: 'var(--bg-tertiary, #f1f5f9)',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--accent-color, #0ea5e9)',
            transition: 'width .3s ease',
          }}
        />
      </div>

      {step < 5 ? (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.4rem' }}>
            Step {step + 1} of 5
          </div>
          <h2 style={{ margin: '0 0 1.2rem', fontSize: '1.3rem' }}>{QUESTIONS[step].title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem' }}>
            {QUESTIONS[step].options.map((opt) => (
              <button
                key={opt.value}
                className="thickness-btn"
                onClick={() => pick(opt.value)}
                style={{ padding: '0.9rem', fontSize: '0.95rem', justifyContent: 'center' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'space-between' }}>
            <button
              className="thickness-btn"
              onClick={() => step > 0 && setStep((s) => (s - 1) as Step)}
              disabled={step === 0}
              style={{ fontSize: '0.85rem' }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            {embedded && onClose && (
              <button className="thickness-btn" onClick={onClose} style={{ fontSize: '0.85rem' }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.3rem' }}>
              <Check size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: '#10b981' }} />
              Top {results.length} recommendations
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Based on your answers, these materials suit your project best.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {results.map(({ material, reasons }, idx) => (
              <div key={material.id} className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: material.color_hex || '#0ea5e9',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong>{material.name}</strong>
                    {idx === 0 && (
                      <span className="mp-badge" style={{ background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem' }}>
                        Best match
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {reasons.join(' · ')}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                    {formatPrice(material.rate_per_cm2_mm)}/cm² · up to {material.max_thickness_mm ?? material.available_thicknesses.slice(-1)[0] ?? '?'} mm
                  </div>
                </div>
                <button
                  className="calculate-btn"
                  style={{ padding: '0.55rem 0.9rem', fontSize: '0.85rem' }}
                  onClick={() => handleOrder(material)}
                >
                  Use this <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="thickness-btn"
              onClick={() => { setStep(0); setAnswers({}); }}
              style={{ fontSize: '0.85rem' }}
            >
              Start over
            </button>
            <Link to="/materials/compare" className="thickness-btn" style={{ fontSize: '0.85rem', textDecoration: 'none' }}>
              <GitCompare size={14} /> Compare all materials
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialWizardPage;

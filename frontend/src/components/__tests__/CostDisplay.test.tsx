import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CostDisplay } from '../CostDisplay';
import { useAppStore } from '../../store';
import { calculateApi } from '../../services';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the store
vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

// Mock the API
vi.mock('../../services', () => ({
  calculateApi: {
    calculateCost: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CostDisplay Component', () => {
  const mockSetCostEstimate = vi.fn();
  const mockSetIsCalculating = vi.fn();
  const mockOnCalculateComplete = vi.fn();

  const mockFileAnalysis = {
    file_id: '123',
    width_mm: 100,
    height_mm: 100,
    area_cm2: 100,
    cut_length_mm: 400,
    estimated_cut_time_minutes: 5,
    complexity_score: 1,
  };

  const mockSelectedMaterial = {
    id: 1,
    name: 'Acrylic',
    type: 'plastic',
    rate_per_cm2_mm: 0.05,
    available_thicknesses: [3, 5],
  };

  const mockCostEstimate = {
    file_id: '123',
    material_name: 'Acrylic',
    thickness_mm: 3,
    quantity: 1,
    breakdown: {
      material_cost: 15.00,
      laser_time_cost: 10.00,
      energy_cost: 2.00,
      setup_fee: 5.00,
      subtotal: 32.00,
      tax: 6.40,
      total: 38.40,
    },
    estimated_production_time_hours: 0.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as any).mockReturnValue({
      uploadedFile: { file_id: '123' },
      fileAnalysis: mockFileAnalysis,
      selectedMaterial: mockSelectedMaterial,
      selectedThickness: 3,
      quantity: 1,
      costEstimate: null,
      setCostEstimate: mockSetCostEstimate,
      setIsCalculating: mockSetIsCalculating,
      isCalculating: false,
    });
  });

  it('renders file analysis details', () => {
    render(<CostDisplay onCalculateComplete={mockOnCalculateComplete} />);
    
    expect(screen.getByText('100.0 × 100.0 mm')).toBeInTheDocument();
    expect(screen.getByText('100.00 cm²')).toBeInTheDocument();
    expect(screen.getByText('0.40 m')).toBeInTheDocument();
    expect(screen.getByText('5.0 min')).toBeInTheDocument();
  });

  it('handles calculate button click', async () => {
    (calculateApi.calculateCost as any).mockResolvedValue(mockCostEstimate);

    render(<CostDisplay onCalculateComplete={mockOnCalculateComplete} />);
    
    const calculateBtn = screen.getByText('Calculate Cost');
    fireEvent.click(calculateBtn);

    expect(mockSetIsCalculating).toHaveBeenCalledWith(true);
    await waitFor(() => {
      expect(calculateApi.calculateCost).toHaveBeenCalled();
      expect(mockSetCostEstimate).toHaveBeenCalledWith(mockCostEstimate);
      expect(mockOnCalculateComplete).toHaveBeenCalled();
    });
  });

  it('renders cost breakdown when estimate exists', () => {
    (useAppStore as any).mockReturnValue({
      uploadedFile: { file_id: '123' },
      fileAnalysis: mockFileAnalysis,
      selectedMaterial: mockSelectedMaterial,
      selectedThickness: 3,
      quantity: 1,
      costEstimate: mockCostEstimate,
      setCostEstimate: mockSetCostEstimate,
      setIsCalculating: mockSetIsCalculating,
      isCalculating: false,
    });

    render(<CostDisplay onCalculateComplete={mockOnCalculateComplete} />);
    
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText('$32.00')).toBeInTheDocument();
    expect(screen.getByText('$38.40')).toBeInTheDocument();
    expect(screen.getByText(/Estimated Production Time: 0.5 hours/i)).toBeInTheDocument();
  });

  it('disables calculate button when calculating', () => {
    (useAppStore as any).mockReturnValue({
      uploadedFile: { file_id: '123' },
      fileAnalysis: mockFileAnalysis,
      selectedMaterial: mockSelectedMaterial,
      selectedThickness: 3,
      quantity: 1,
      costEstimate: null,
      setCostEstimate: mockSetCostEstimate,
      setIsCalculating: mockSetIsCalculating,
      isCalculating: true,
    });

    render(<CostDisplay onCalculateComplete={mockOnCalculateComplete} />);
    
    const calculateBtn = screen.getByText('Calculating...');
    expect(calculateBtn).toBeDisabled();
  });
});

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MaterialSelector } from '../MaterialSelector';
import { useAppStore } from '../../store';
import { materialsApi } from '../../services';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the store
vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

// Mock the API
vi.mock('../../services', () => ({
  materialsApi: {
    listMaterials: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Skeleton
vi.mock('../Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

describe('MaterialSelector Component', () => {
  const mockSetMaterials = vi.fn();
  const mockSetSelectedMaterial = vi.fn();
  const mockSetSelectedThickness = vi.fn();
  const mockSetQuantity = vi.fn();

  const mockMaterials = [
    {
      id: 1,
      name: 'Acrylic',
      type: 'plastic',
      rate_per_cm2_mm: 0.05,
      available_thicknesses: [3, 5, 10],
      description: 'Clear plastic',
    },
    {
      id: 2,
      name: 'Plywood',
      type: 'wood',
      rate_per_cm2_mm: 0.03,
      available_thicknesses: [3, 4, 6],
      description: 'Natural wood',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as any).mockReturnValue({
      materials: [],
      setMaterials: mockSetMaterials,
      selectedMaterial: null,
      setSelectedMaterial: mockSetSelectedMaterial,
      selectedThickness: null,
      setSelectedThickness: mockSetSelectedThickness,
      quantity: 1,
      setQuantity: mockSetQuantity,
    });
    (materialsApi.listMaterials as any).mockResolvedValue(mockMaterials);
  });

  it('loads and displays materials', async () => {
    render(<MaterialSelector />);
    
    // Check for skeletons initially
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(materialsApi.listMaterials).toHaveBeenCalled();
      expect(mockSetMaterials).toHaveBeenCalledWith(mockMaterials);
    });
  });

  it('renders material cards', async () => {
    (useAppStore as any).mockReturnValue({
      materials: mockMaterials,
      setMaterials: mockSetMaterials,
      selectedMaterial: mockMaterials[0],
      setSelectedMaterial: mockSetSelectedMaterial,
      selectedThickness: 3,
      setSelectedThickness: mockSetSelectedThickness,
      quantity: 1,
      setQuantity: mockSetQuantity,
    });

    // Make it not loading immediately for this test
    (materialsApi.listMaterials as any).mockResolvedValue(mockMaterials);

    render(<MaterialSelector />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Acrylic')).toBeInTheDocument();
    expect(screen.getByText('Plywood')).toBeInTheDocument();
  });

  it('handles material selection', async () => {
    (useAppStore as any).mockReturnValue({
      materials: mockMaterials,
      setMaterials: mockSetMaterials,
      selectedMaterial: mockMaterials[0],
      setSelectedMaterial: mockSetSelectedMaterial,
      selectedThickness: 3,
      setSelectedThickness: mockSetSelectedThickness,
      quantity: 1,
      setQuantity: mockSetQuantity,
    });

    render(<MaterialSelector />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    const plywoodCard = screen.getByText('Plywood').closest('.material-card');
    await act(async () => {
      fireEvent.click(plywoodCard!);
    });

    expect(mockSetSelectedMaterial).toHaveBeenCalledWith(mockMaterials[1]);
  });

  it('handles thickness selection', async () => {
    (useAppStore as any).mockReturnValue({
      materials: mockMaterials,
      setMaterials: mockSetMaterials,
      selectedMaterial: mockMaterials[0],
      setSelectedMaterial: mockSetSelectedMaterial,
      selectedThickness: 3,
      setSelectedThickness: mockSetSelectedThickness,
      quantity: 1,
      setQuantity: mockSetQuantity,
    });

    render(<MaterialSelector />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    const thickness5Btn = screen.getByText('5mm');
    await act(async () => {
      fireEvent.click(thickness5Btn);
    });

    expect(mockSetSelectedThickness).toHaveBeenCalledWith(5);
  });

  it('handles quantity changes', async () => {
    (useAppStore as any).mockReturnValue({
      materials: mockMaterials,
      setMaterials: mockSetMaterials,
      selectedMaterial: mockMaterials[0],
      setSelectedMaterial: mockSetSelectedMaterial,
      selectedThickness: 3,
      setSelectedThickness: mockSetSelectedThickness,
      quantity: 1,
      setQuantity: mockSetQuantity,
    });

    render(<MaterialSelector />);
    
    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    const plusBtn = screen.getByText('+');
    await act(async () => {
      fireEvent.click(plusBtn);
    });

    expect(mockSetQuantity).toHaveBeenCalledWith(2);
  });
});

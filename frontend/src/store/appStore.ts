import { create } from 'zustand';
import { Material, CostEstimate, FileUploadResponse, FileAnalysis, Order, VendorProfile } from '../services';

interface AppState {
  // File state
  uploadedFile: FileUploadResponse | null;
  fileAnalysis: FileAnalysis | null;
  
  // Material selection
  materials: Material[];
  selectedMaterial: Material | null;
  selectedThickness: number | null;
  quantity: number;
  
  // Vendor selection
  selectedVendor: VendorProfile | null;
  
  // Cost estimate
  costEstimate: CostEstimate | null;
  
  // Order
  currentOrder: Order | null;
  
  // UI state
  isCalculating: boolean;
  isProcessing: boolean;
  
  // Actions
  setUploadedFile: (file: FileUploadResponse | null) => void;
  setFileAnalysis: (analysis: FileAnalysis | null) => void;
  setMaterials: (materials: Material[]) => void;
  setSelectedMaterial: (material: Material | null) => void;
  setSelectedThickness: (thickness: number | null) => void;
  setQuantity: (quantity: number) => void;
  setSelectedVendor: (vendor: VendorProfile | null) => void;
  setCostEstimate: (estimate: CostEstimate | null) => void;
  setCurrentOrder: (order: Order | null) => void;
  setIsCalculating: (loading: boolean) => void;
  setIsProcessing: (loading: boolean) => void;
  resetState: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  uploadedFile: null,
  fileAnalysis: null,
  materials: [],
  selectedMaterial: null,
  selectedThickness: null,
  quantity: 1,
  selectedVendor: null,
  costEstimate: null,
  currentOrder: null,
  isCalculating: false,
  isProcessing: false,
  
  // Actions
  setUploadedFile: (file) => set({ uploadedFile: file }),
  setFileAnalysis: (analysis) => set({ fileAnalysis: analysis }),
  setMaterials: (materials) => set({ materials }),
  setSelectedMaterial: (material) => set({ selectedMaterial: material }),
  setSelectedThickness: (thickness) => set({ selectedThickness: thickness }),
  setQuantity: (quantity) => set({ quantity }),
  setSelectedVendor: (vendor) => set({ selectedVendor: vendor }),
  setCostEstimate: (estimate) => set({ costEstimate: estimate }),
  setCurrentOrder: (order) => set({ currentOrder: order }),
  setIsCalculating: (loading) => set({ isCalculating: loading }),
  setIsProcessing: (loading) => set({ isProcessing: loading }),
  
  resetState: () => set({
    uploadedFile: null,
    fileAnalysis: null,
    selectedMaterial: null,
    selectedThickness: null,
    quantity: 1,
    selectedVendor: null,
    costEstimate: null,
    currentOrder: null,
  }),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUpload } from '../FileUpload';
import { useAppStore } from '../../store';
import { uploadApi } from '../../services';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the store
vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

// Mock the API
vi.mock('../../services', () => ({
  uploadApi: {
    uploadFile: vi.fn(),
    getFileAnalysis: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FileUpload Component', () => {
  const mockSetUploadedFile = vi.fn();
  const mockSetFileAnalysis = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppStore as any).mockReturnValue({
      uploadedFile: null,
      setUploadedFile: mockSetUploadedFile,
      setFileAnalysis: mockSetFileAnalysis,
    });
  });

  it('renders upload zone when no file is uploaded', () => {
    render(<FileUpload />);
    expect(screen.getByText(/Upload Your Design/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop your file here/i)).toBeInTheDocument();
  });

  it('handles file upload successfully', async () => {
    const file = new File(['test'], 'test.svg', { type: 'image/svg+xml' });
    const mockUploadResponse = { file_id: '123', filename: 'test.svg', file_size: 1024, file_type: 'svg' };
    const mockAnalysisResponse = { file_id: '123', width_mm: 100, height_mm: 100 };

    (uploadApi.uploadFile as any).mockResolvedValue(mockUploadResponse);
    (uploadApi.getFileAnalysis as any).mockResolvedValue(mockAnalysisResponse);

    const { container } = render(<FileUpload />);
    
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    
    // Simulate file drop/select
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadApi.uploadFile).toHaveBeenCalledWith(file);
      expect(mockSetUploadedFile).toHaveBeenCalledWith(mockUploadResponse);
      expect(mockSetFileAnalysis).toHaveBeenCalledWith(mockAnalysisResponse);
    });
  });

  it('renders uploaded file info when a file exists', () => {
    (useAppStore as any).mockReturnValue({
      uploadedFile: { file_id: '123', filename: 'test.svg', file_size: 1024, file_type: 'svg' },
      setUploadedFile: mockSetUploadedFile,
      setFileAnalysis: mockSetFileAnalysis,
    });

    render(<FileUpload />);
    expect(screen.getByText('test.svg')).toBeInTheDocument();
    expect(screen.getByText(/1.0 KB • SVG/i)).toBeInTheDocument();
  });

  it('handles file removal', async () => {
    (useAppStore as any).mockReturnValue({
      uploadedFile: { file_id: '123', filename: 'test.svg', file_size: 1024, file_type: 'svg' },
      setUploadedFile: mockSetUploadedFile,
      setFileAnalysis: mockSetFileAnalysis,
    });

    (uploadApi.deleteFile as any).mockResolvedValue({});

    render(<FileUpload />);
    
    const removeBtn = screen.getByRole('button');
    fireEvent.click(removeBtn);

    expect(uploadApi.deleteFile).toHaveBeenCalledWith('123');
    expect(mockSetUploadedFile).toHaveBeenCalledWith(null);
    expect(mockSetFileAnalysis).toHaveBeenCalledWith(null);
  });
});

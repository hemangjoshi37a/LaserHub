import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, FileImage, FileCode, FileText as FileTextIcon, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '../store';
import { uploadApi } from '../services';
import { API_URL } from '../services/api';
import { toast } from 'sonner';

// Browsers are inconsistent with MIME types for vector files.
// DXF/EPS/AI often arrive as text/plain or application/octet-stream.
// SVG may arrive as text/xml, text/plain, or image/svg+xml.
// We accept all common variants so the backend can do the real validation.
const ALLOWED_TYPES = {
  'image/svg+xml': ['.svg'],
  'text/xml': ['.svg', '.dxf'],
  'text/plain': ['.svg', '.dxf', '.eps', '.ai', '.plt', '.hpgl'],
  'application/xml': ['.svg'],
  'application/dxf': ['.dxf'],
  'image/vnd.dxf': ['.dxf'],
  'application/postscript': ['.ai', '.eps'],
  'application/illustrator': ['.ai'],
  'application/eps': ['.eps'],
  'image/eps': ['.eps'],
  'application/cdr': ['.cdr'],
  'application/coreldraw': ['.cdr'],
  'application/x-cdr': ['.cdr'],
  'application/plt': ['.plt'],
  'application/hpgl': ['.hpgl'],
  'image/wmf': ['.wmf'],
  'image/x-wmf': ['.wmf'],
  'application/x-wmf': ['.wmf'],
  'image/emf': ['.emf'],
  'image/x-emf': ['.emf'],
  'application/x-emf': ['.emf'],
  'application/x-dwg': ['.dwg'],
  'application/pdf': ['.pdf', '.ai'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/octet-stream': ['.dxf', '.ai', '.eps', '.cdr', '.plt', '.hpgl', '.wmf', '.emf', '.dwg', '.pdf', '.png', '.jpg', '.jpeg'],
};

// Format-specific hints shown while uploading
function getFormatHint(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const hints: Record<string, string> = {
    dxf:  'DXF file detected — parsing geometry...',
    svg:  'SVG file detected — analysing paths...',
    ai:   'Adobe Illustrator file detected — parsing...',
    eps:  'EPS file detected — reading PostScript data...',
    cdr:  'CorelDRAW file detected — estimating dimensions...',
    plt:  'PLT/HPGL file detected — parsing plotter data...',
    hpgl: 'PLT/HPGL file detected — parsing plotter data...',
    dwg:  'DWG detected — preparing analysis...',
    pdf:  'PDF detected — extracting vector paths...',
    png:  'PNG detected — processing raster data...',
    jpg:  'JPG detected — processing raster data...',
    jpeg: 'JPEG detected — processing raster data...',
  };
  return hints[ext] ?? 'Processing file...';
}

export const FileUpload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadingHint, setUploadingHint] = useState<string>('Uploading...');
  const { setUploadedFile, setFileAnalysis, uploadedFile } = useAppStore();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploadingHint(getFormatHint(file.name));
    setUploading(true);

    try {
      const response = await uploadApi.uploadFile(file);
      setUploadedFile(response);

      // Get file analysis
      const analysis = await uploadApi.getFileAnalysis(response.file_id);
      setFileAnalysis(analysis);

      if (response.parse_warning) {
        toast.warning('File uploaded with a note', {
          description: response.parse_warning,
          duration: 8000,
        });
      } else {
        toast.success('File uploaded successfully!', {
          description: `${file.name} - ${(file.size / 1024).toFixed(1)} KB`,
        });
      }
    } catch (error: any) {
      toast.error('Upload failed', {
        description: error.response?.data?.detail || 'Please try again',
      });
    } finally {
      setUploading(false);
    }
  }, [setUploadedFile, setFileAnalysis]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    multiple: false,
    disabled: uploading,
  });

  const handleRemove = () => {
    if (uploadedFile) {
      uploadApi.deleteFile(uploadedFile.file_id).catch(console.error);
    }
    setUploadedFile(null);
    setFileAnalysis(null);
  };

  const isSvg = uploadedFile?.file_type === 'svg';
  const isDxf = uploadedFile?.file_type === 'dxf';
  const previewUrl = uploadedFile ? `${API_URL}/upload/${uploadedFile.file_id}/raw` : null;

  return (
    <div className="upl-upload animate-in">
      {!uploadedFile ? (
        <div
          {...getRootProps()}
          className={`upl-dropzone ${isDragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="upl-dz-uploading">
              <div className="spinner"></div>
              <p>{uploadingHint}</p>
            </div>
          ) : (
            <>
              <div className="upl-dz-icon">
                <Upload size={36} />
              </div>
              <p className="upl-dz-title">
                {isDragActive ? 'Drop your file here…' : 'Drag & drop your design'}
              </p>
              <p className="upl-dz-sub">or click to browse · max 25 MB</p>
              <div className="upl-dz-formats">
                <span className="upl-format-badge"><FileCode size={12} /> SVG</span>
                <span className="upl-format-badge"><FileCode size={12} /> DXF</span>
                <span className="upl-format-badge"><FileImage size={12} /> AI</span>
                <span className="upl-format-badge"><FileImage size={12} /> EPS</span>
                <span className="upl-format-badge"><FileImage size={12} /> CDR</span>
                <span className="upl-format-badge"><FileCode size={12} /> DWG</span>
                <span className="upl-format-badge"><FileTextIcon size={12} /> PDF</span>
                <span className="upl-format-badge"><ImageIcon size={12} /> IMG</span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="upl-file-card animate-in">
          <div className="upl-file-thumb">
            {(isSvg || isDxf) && previewUrl ? (
              <img src={previewUrl} alt="Preview" />
            ) : (
              <File size={28} />
            )}
          </div>
          <div className="upl-file-info">
            <div className="upl-file-name">
              <CheckCircle size={16} className="upl-file-check" />
              <span>{uploadedFile.filename}</span>
            </div>
            <div className="upl-file-meta">
              {(uploadedFile.file_size / 1024).toFixed(1)} KB · {uploadedFile.file_type.toUpperCase()}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="upl-replace-btn"
            aria-label="Replace file"
          >
            <X size={14} /> Replace file
          </button>
        </div>
      )}

      <div className="upl-disclaimer">
        <strong>Copyright notice —</strong> by uploading a file, you confirm that you own the
        intellectual property rights or have permission to use this design. Uploading copyrighted
        files without authorization is strictly prohibited and may result in account suspension.
      </div>
    </div>
  );
};

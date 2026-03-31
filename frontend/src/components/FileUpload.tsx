import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { uploadApi } from '../services';
import { toast } from 'sonner';

const ALLOWED_TYPES = {
  'image/svg+xml': ['.svg'],
  'application/dxf': ['.dxf'],
  'application/pdf': ['.pdf'],
  'application/postscript': ['.ai', '.eps'],
};

export const FileUpload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const { setUploadedFile, setFileAnalysis, uploadedFile } = useAppStore();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);

    try {
      const response = await uploadApi.uploadFile(file);
      setUploadedFile(response);

      // Get file analysis
      const analysis = await uploadApi.getFileAnalysis(response.file_id);
      setFileAnalysis(analysis);

      toast.success('File uploaded successfully!', {
        description: `${file.name} - ${(file.size / 1024).toFixed(1)} KB`,
      });
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
  const previewUrl = uploadedFile ? `/api/upload/${uploadedFile.file_id}/raw` : null;

  return (
    <div className="upload-container animate-in">
      <h2>Upload Your Design</h2>
      <p className="upload-description">
        Support for DXF, SVG, AI, PDF, and EPS files
      </p>

      {!uploadedFile ? (
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        >
          <input {...getInputProps()} />
          <Upload size={48} className="upload-icon" />
          {uploading ? (
            <div className="uploading-state">
              <div className="spinner"></div>
              <p>Uploading and analyzing...</p>
            </div>
          ) : isDragActive ? (
            <div className="dropzone-content">
              <Upload size={32} />
              <p>Drop your file here...</p>
            </div>
          ) : (
            <div className="dropzone-content">
              <Upload size={48} />
              <p>Drag & drop your file here, or click to browse</p>
              <p className="file-types">DXF • SVG • AI • PDF • EPS</p>
            </div>
          )}
        </div>
      ) : (
        <div className="uploaded-file-container animate-in">
          {(isSvg || isDxf) && previewUrl && (
            <div className="file-preview-canvas animate-in">
              <img src={previewUrl} alt="Design Preview" />
            </div>
          )}
          <div className="uploaded-file animate-in">
            <div className="file-info">
              <File size={32} />
              <div className="file-details">
                <p className="filename">{uploadedFile.filename}</p>
                <p className="file-size">
                  {(uploadedFile.file_size / 1024).toFixed(1)} KB • {uploadedFile.file_type.toUpperCase()}
                </p>
              </div>
              <CheckCircle size={24} className="success-icon" />
            </div>
            <button 
              onClick={handleRemove} 
              className="remove-btn"
              aria-label="Remove file"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

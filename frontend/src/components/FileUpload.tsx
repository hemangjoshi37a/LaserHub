import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { uploadApi } from '../services';
import { API_URL } from '../services/api';
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
  const previewUrl = uploadedFile ? `${API_URL}/upload/${uploadedFile.file_id}/raw` : null;

  return (
    <div className="upload-container upload-compact animate-in">
      <h3>Upload Your Design</h3>
      <p className="upload-description">DXF, SVG, AI, PDF, and EPS supported</p>

      {!uploadedFile ? (
        <div
          {...getRootProps()}
          className={`dropzone dropzone-compact ${isDragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="uploading-state">
              <div className="spinner"></div>
              <p>Uploading...</p>
            </div>
          ) : (
            <div className="dropzone-content">
              <Upload size={24} />
              <p>{isDragActive ? 'Drop here...' : 'Drag & drop or click to browse'}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="uploaded-file-container uploaded-file-compact animate-in">
          <div className="uploaded-file animate-in">
            <div className="file-info">
              {(isSvg || isDxf) && previewUrl ? (
                <img src={previewUrl} alt="Preview" className="file-thumb" />
              ) : (
                <File size={20} />
              )}
              <div className="file-details">
                <span className="filename">{uploadedFile.filename}</span>
                <span className="file-size">
                  {(uploadedFile.file_size / 1024).toFixed(1)} KB &middot; {uploadedFile.file_type.toUpperCase()}
                </span>
              </div>
              <CheckCircle size={16} className="success-icon" />
            </div>
            <button
              onClick={handleRemove}
              className="remove-btn"
              aria-label="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

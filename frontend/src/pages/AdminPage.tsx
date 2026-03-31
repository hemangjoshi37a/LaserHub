import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLogin } from '../components/AdminLogin';
import { AdminDashboard } from '../components/AdminDashboard';
import { MaterialManager } from '../components/MaterialManager';
import { Analytics } from './Analytics';

export const AdminPage: React.FC = () => {
  const token = localStorage.getItem('admin_token');

  if (!token) {
    return <AdminLogin />;
  }

  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/materials" element={<MaterialManager />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
};

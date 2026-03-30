import React from 'react';
import { AdminLogin } from '../components/AdminLogin';
import { AdminDashboard } from '../components/AdminDashboard';

export const AdminPage: React.FC = () => {
  const token = localStorage.getItem('admin_token');

  if (!token) {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
};

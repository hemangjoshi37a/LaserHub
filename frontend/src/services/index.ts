import api from './api';

export interface MaterialConfig {
  id: number;
  material_id: number;
  thickness_mm: number;
  rate_per_cm2: number;
  cut_speed_mm_min: number;
  is_in_stock: boolean;
}

export interface Material {
  id: number;
  name: string;
  type: string;
  rate_per_cm2_mm: number;
  available_thicknesses: number[];
  description?: string;
  configs: MaterialConfig[];
}

export interface FileUploadResponse {
  file_id: string;
  filename: string;
  file_size: number;
  file_type: string;
  upload_url: string;
}

export interface FileAnalysis {
  file_id: string;
  width_mm: number;
  height_mm: number;
  area_cm2: number;
  cut_length_mm: number;
  estimated_cut_time_minutes: number;
  complexity_score: number;
}

export interface CostBreakdown {
  material_cost: number;
  laser_time_cost: number;
  energy_cost: number;
  setup_fee: number;
  subtotal: number;
  tax: number;
  total: number;
}

export interface CostEstimate {
  file_id: string;
  material_name: string;
  thickness_mm: number;
  quantity: number;
  breakdown: CostBreakdown;
  estimated_production_time_hours: number;
}

export interface Order {
  id: number;
  order_number: string;
  file_id: string;
  material_name: string;
  thickness_mm: number;
  quantity: number;
  total_amount: number;
  status: string;
  customer_email: string;
  customer_name: string;
  shipping_address: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export const authApi = {
  register: async (userData: any): Promise<User> => {
    const response = await api.post<User>('/auth/register', userData);
    return response.data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post<AuthResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  listMyOrders: async (): Promise<Order[]> => {
    const response = await api.get<Order[]>('/auth/orders');
    return response.data;
  },

  verifyEmail: async (token: string): Promise<any> => {
    const response = await api.post('/auth/verify', { token });
    return response.data;
  },

  requestPasswordReset: async (email: string): Promise<any> => {
    const response = await api.post('/auth/password-reset-request', { email });
    return response.data;
  },

  confirmPasswordReset: async (token: string, newPassword: string): Promise<any> => {
    const response = await api.post('/auth/password-reset-confirm', {
      token,
      new_password: newPassword,
    });
    return response.data;
  },
};

export const uploadApi = {
  uploadFile: async (file: File): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post<FileUploadResponse>('/upload/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  },

  getFileAnalysis: async (fileId: string): Promise<FileAnalysis> => {
    const response = await api.get<FileAnalysis>(`/upload/${fileId}`);
    return response.data;
  },

  deleteFile: async (fileId: string): Promise<void> => {
    await api.delete(`/upload/${fileId}`);
  },
};

export const materialsApi = {
  listMaterials: async (): Promise<Material[]> => {
    const response = await api.get<Material[]>('/materials/');
    return response.data;
  },

  getMaterial: async (id: number): Promise<Material> => {
    const response = await api.get<Material>(`/materials/${id}`);
    return response.data;
  },

  createMaterial: async (material: Omit<Material, 'id'>): Promise<Material> => {
    const response = await api.post<Material>('/materials/', material);
    return response.data;
  },

  updateMaterial: async (id: number, material: Partial<Material>): Promise<Material> => {
    const response = await api.put<Material>(`/materials/${id}`, material);
    return response.data;
  },

  deleteMaterial: async (id: number): Promise<void> => {
    await api.delete(`/materials/${id}`);
  },

  createConfig: async (config: Omit<MaterialConfig, 'id'>): Promise<MaterialConfig> => {
    const response = await api.post<MaterialConfig>('/materials/configs', config);
    return response.data;
  },

  updateConfig: async (id: number, config: Partial<MaterialConfig>): Promise<MaterialConfig> => {
    const response = await api.put<MaterialConfig>(`/materials/configs/${id}`, config);
    return response.data;
  },
};

export const calculateApi = {
  calculateCost: async (
    fileId: string,
    materialId: number,
    thicknessMm: number,
    quantity: number = 1
  ): Promise<CostEstimate> => {
    const response = await api.post<CostEstimate>('/calculate/', {
      file_id: fileId,
      material_id: materialId,
      thickness_mm: thicknessMm,
      quantity,
    });
    return response.data;
  },

  getPreview: async (fileId: string): Promise<any> => {
    const response = await api.get(`/calculate/preview/${fileId}`);
    return response.data;
  },
};

export const ordersApi = {
  createOrder: async (orderData: {
    file_id: string;
    material_id: number;
    thickness_mm: number;
    quantity: number;
    customer_email: string;
    customer_name: string;
    shipping_address: string;
    total_amount: number;
  }): Promise<Order> => {
    const response = await api.post<Order>('/orders/', orderData);
    return response.data;
  },

  getOrder: async (orderId: number): Promise<Order> => {
    const response = await api.get<Order>(`/orders/${orderId}`);
    return response.data;
  },

  listOrders: async (limit: number = 50, offset: number = 0): Promise<Order[]> => {
    const response = await api.get<Order[]>('/orders/', {
      params: { limit, offset },
    });
    return response.data;
  },
};

export const paymentApi = {
  createPaymentIntent: async (orderId: number, amount: number): Promise<{
    client_secret: string;
    payment_intent_id: string;
  }> => {
    const response = await api.post('/payment/intent', {
      order_id: orderId,
      amount,
      currency: 'usd',
    });
    return response.data;
  },

  getPaymentStatus: async (orderId: number): Promise<any> => {
    const response = await api.get(`/payment/status/${orderId}`);
    return response.data;
  },
};

export interface SalesData {
  date: string;
  revenue: number;
  orders: number;
}

export interface MaterialMetric {
  material_name: string;
  count: number;
  revenue: number;
}

export interface CustomerMetric {
  email: string;
  name: string;
  order_count: number;
  total_spent: number;
}

export interface AnalyticsData {
  sales_over_time: SalesData[];
  popular_materials: MaterialMetric[];
  top_customers: CustomerMetric[];
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
}

export const adminApi = {
  login: async (email: string, password: string): Promise<{
    access_token: string;
    token_type: string;
  }> => {
    const formData = new FormData();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post('/admin/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },

  getDashboard: async (): Promise<any> => {
    const response = await api.get('/admin/dashboard');
    return response.data;
  },

  listOrders: async (statusFilter?: string): Promise<Order[]> => {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await api.get<Order[]>('/admin/orders', { params });
    return response.data;
  },

  updateOrder: async (orderId: number, updateData: {
    status?: string;
    notes?: string;
    carrier?: string;
    tracking_number?: string;
  }): Promise<Order> => {
    const response = await api.put<Order>(`/admin/orders/${orderId}`, updateData);
    return response.data;
  },

  getAnalytics: async (): Promise<AnalyticsData> => {
    const response = await api.get<AnalyticsData>('/admin/analytics');
    return response.data;
  },

  exportOrders: async (): Promise<Blob> => {
    const response = await api.get('/admin/orders/export', {
      responseType: 'blob',
    });
    return response.data;
  },
};

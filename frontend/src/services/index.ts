import api from './api';

export interface Material {
  id: number;
  name: string;
  type: string;
  rate_per_cm2_mm: number;
  available_thicknesses: number[];
  description?: string;
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

  updateOrder: async (orderId: number, status: string): Promise<Order> => {
    const response = await api.put<Order>(`/admin/orders/${orderId}`, {
      status,
    });
    return response.data;
  },
};

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
  color_hex?: string;
  image_url?: string;
  is_active?: boolean;
  configs: MaterialConfig[];
  strength_rating?: number;
  outdoor_safe?: boolean;
  food_safe?: boolean;
  burn_behavior?: string;
  finish_options?: string;
  best_use_cases?: string[];
  max_thickness_mm?: number | null;
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  count: number;
}

export interface ValidationResult {
  score: number;
  issues: ValidationIssue[];
  summary: string;
}

export interface FileUploadResponse {
  file_id: string;
  filename: string;
  file_size: number;
  file_type: string;
  upload_url: string;
  parse_warning?: string;
}

export interface FileAnalysis {
  file_id: string;
  width_mm: number;
  height_mm: number;
  area_cm2: number;
  cut_length_mm: number;
  estimated_cut_time_minutes: number;
  complexity_score: number;
  validation_issues?: ValidationIssue[];
  health_score: number;
  health_status: 'optimal' | 'warning' | 'critical';
}

export const optimizationApi = {
  optimizeFile: async (fileId: string): Promise<FileAnalysis> => {
    const response = await api.post<FileAnalysis>(`/optimization/${fileId}/optimize`);
    return response.data;
  },
};

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
  vendor_name?: string;
  shipping_address: string;
  created_at: string;
  updated_at: string;
}

export interface KanbanCard {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  material_name: string;
  thickness_mm: number;
  quantity: number;
  status: string;
  deadline: string | null;
  notes?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface QuoteLineItem {
  description: string;
  material: string;
  thickness?: number | null;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface Quote {
  id: number;
  quote_number: string;
  vendor_id: number;
  customer_name: string;
  customer_email: string;
  items: QuoteLineItem[];
  subtotal: number;
  setup_fee: number;
  tax: number;
  total: number;
  notes: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  valid_until: string | null;
  created_at: string;
  updated_at?: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role?: string;
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
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);

    const response = await api.post<AuthResponse>('/auth/login', params, {
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

  googleLogin: async (credential: string): Promise<AuthResponse & { user: User }> => {
    const response = await api.post('/auth/google', { credential });
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

  validateFile: async (fileId: string): Promise<ValidationResult> => {
    const response = await api.get<ValidationResult>(`/upload/${fileId}/validate`);
    return response.data;
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

  reorder: async (orderId: number): Promise<Order> => {
    const response = await api.post<Order>(`/orders/${orderId}/reorder`);
    return response.data;
  },

  getGuestOrder: async (trackingToken: string): Promise<Order & { guest_tracking_token?: string }> => {
    const response = await api.get(`/orders/guest/${trackingToken}`);
    return response.data;
  },
};

// === Saved Addresses ===
export interface SavedAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
}

export const addressesApi = {
  list: async (): Promise<SavedAddress[]> => {
    const r = await api.get('/addresses/');
    return r.data.addresses || [];
  },
  create: async (data: Omit<SavedAddress, 'id'>): Promise<SavedAddress> => {
    const r = await api.post('/addresses/', data);
    return r.data;
  },
  update: async (id: string, data: Omit<SavedAddress, 'id'>): Promise<SavedAddress> => {
    const r = await api.put(`/addresses/${id}`, data);
    return r.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/addresses/${id}`);
  },
  setDefault: async (id: string): Promise<void> => {
    await api.put(`/addresses/${id}/default`);
  },
};

// === Saved Quotes (localStorage) ===
export interface SavedQuote {
  id: string;
  design_id?: number | null;
  file_id?: string | null;
  vendor_slug?: string;
  vendor_name?: string;
  material: string;
  material_id?: number;
  thickness: number;
  qty: number;
  price: number;
  saved_at: string;
}

const SAVED_QUOTES_KEY = 'laserhub_saved_quotes';
const QUOTE_EXPIRY_DAYS = 30;

export const savedQuotesStore = {
  load: (): SavedQuote[] => {
    try {
      const raw = localStorage.getItem(SAVED_QUOTES_KEY);
      if (!raw) return [];
      const quotes = JSON.parse(raw) as SavedQuote[];
      const cutoff = Date.now() - QUOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const fresh = quotes.filter((q) => {
        const t = new Date(q.saved_at).getTime();
        return !Number.isNaN(t) && t >= cutoff;
      });
      if (fresh.length !== quotes.length) {
        localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify(fresh));
      }
      return fresh;
    } catch {
      return [];
    }
  },
  save: (quote: Omit<SavedQuote, 'id' | 'saved_at'>): SavedQuote => {
    const existing = savedQuotesStore.load();
    const newQuote: SavedQuote = {
      ...quote,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(SAVED_QUOTES_KEY, JSON.stringify([newQuote, ...existing]));
    return newQuote;
  },
  remove: (id: string): void => {
    const existing = savedQuotesStore.load();
    localStorage.setItem(
      SAVED_QUOTES_KEY,
      JSON.stringify(existing.filter((q) => q.id !== id)),
    );
  },
};

export const paymentApi = {
  createPaymentIntent: async (orderId: number, amount: number, currency = 'usd'): Promise<{
    client_secret: string;
    payment_intent_id: string;
  }> => {
    const response = await api.post('/payment/intent', {
      order_id: orderId,
      amount,
      currency,
    });
    return response.data;
  },

  createRazorpayOrder: async (orderId: number, amount: number, currency = 'INR'): Promise<{
    razorpay_order_id: string;
    key_id: string;
    amount: number;
    currency: string;
    order_number: string;
  }> => {
    const response = await api.post('/payment/razorpay/order', {
      order_id: orderId,
      amount,
      currency,
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
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);

    const response = await api.post('/admin/login', params, {
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

  getKanban: async (): Promise<Record<string, KanbanCard[]>> => {
    const response = await api.get<Record<string, KanbanCard[]>>('/admin/orders/kanban');
    return response.data;
  },

  patchOrderStatus: async (orderId: number, status: string): Promise<{ id: number; status: string }> => {
    const response = await api.patch<{ id: number; status: string }>(
      `/admin/orders/${orderId}/status`,
      { status },
    );
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

  getSettings: async (category?: string): Promise<any[]> => {
    const params = category ? { category } : {};
    const response = await api.get('/admin/settings', { params });
    return response.data;
  },

  updateSettings: async (settings: any[]): Promise<any> => {
    const response = await api.put('/admin/settings', settings);
    return response.data;
  },

  seedPaymentSettings: async (): Promise<any> => {
    const response = await api.post('/admin/settings/seed-payment');
    return response.data;
  },

  getFinancialsSummary: async (): Promise<FinancialsSummary> => {
    const response = await api.get<FinancialsSummary>('/admin/financials/summary');
    return response.data;
  },

  downloadTaxReport: async (startDate?: string, endDate?: string): Promise<Blob> => {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await api.get('/admin/financials/tax-report', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },
};

export interface FinancialsSummary {
  revenue: { today: number; week: number; month: number; year: number };
  profit: number;
  profit_margin_pct: number;
  cogs: {
    total: number;
    material: number;
    laser: number;
    energy: number;
    by_material: { name: string; total: number }[];
  };
  orders_count: { today: number; week: number; month: number; year: number; total: number };
  avg_order_value: number;
  top_customers: { name: string; email: string; order_count: number; total_spent: number }[];
  revenue_timeline: { date: string; revenue: number }[];
  payment_methods: { method: string; total: number }[];
}

export interface InventoryItem {
  id: number;
  vendor_id: number;
  material_id: number;
  material_name: string;
  thickness_mm: number;
  sheet_width_mm: number;
  sheet_height_mm: number;
  quantity_sheets: number;
  cost_per_sheet: number;
  low_threshold: number;
  supplier: string;
  supplier_url: string;
  notes: string;
  is_low: boolean;
  updated_at: string;
}

export interface StockMovementItem {
  id: number;
  delta: number;
  reason: string;
  order_id: number | null;
  created_at: string;
}

export const inventoryApi = {
  list: async (): Promise<InventoryItem[]> => {
    const response = await api.get<InventoryItem[]>('/inventory/');
    return response.data;
  },
  alerts: async (): Promise<InventoryItem[]> => {
    const response = await api.get<InventoryItem[]>('/inventory/alerts');
    return response.data;
  },
  create: async (data: {
    material_id: number;
    thickness_mm: number;
    sheet_width_mm: number;
    sheet_height_mm: number;
    quantity_sheets?: number;
    cost_per_sheet?: number;
    low_threshold?: number;
    supplier?: string;
    supplier_url?: string;
    notes?: string;
  }): Promise<InventoryItem> => {
    const response = await api.post<InventoryItem>('/inventory/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<InventoryItem>): Promise<InventoryItem> => {
    const response = await api.put<InventoryItem>(`/inventory/${id}`, data);
    return response.data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/inventory/${id}`);
  },
  adjust: async (id: number, delta: number, reason: string = ''): Promise<InventoryItem> => {
    const response = await api.post<InventoryItem>(`/inventory/${id}/movement`, { delta, reason });
    return response.data;
  },
  movements: async (id: number): Promise<StockMovementItem[]> => {
    const response = await api.get<StockMovementItem[]>(`/inventory/${id}/movements`);
    return response.data;
  },
};

// === Marketplace API ===

export const marketplaceApi = {
  getFeatured: async (): Promise<any> => {
    const response = await api.get('/marketplace/featured');
    return response.data;
  },

  browseDesigns: async (params: {
    category?: string;
    search?: string;
    sort_by?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any> => {
    const response = await api.get('/marketplace/designs', { params });
    return response.data;
  },

  getDesignDetail: async (designId: number): Promise<any> => {
    const response = await api.get(`/marketplace/designs/${designId}`);
    return response.data;
  },

  compareVendors: async (
    fileId: string,
    materialId: number,
    thicknessMm: number,
    quantity: number = 1
  ): Promise<any> => {
    const response = await api.post('/marketplace/compare', null, {
      params: { file_id: fileId, material_id: materialId, thickness_mm: thicknessMm, quantity },
    });
    return response.data;
  },

  getCategories: async (): Promise<any> => {
    const response = await api.get('/marketplace/categories');
    return response.data;
  },

  getVendorReviews: async (vendorId: number): Promise<any[]> => {
    const response = await api.get(`/marketplace/vendors/${vendorId}/reviews`);
    return response.data;
  },

  createVendorReview: async (vendorId: number, data: {
    vendor_id: number;
    order_id?: number;
    rating: number;
    comment?: string;
  }): Promise<any> => {
    const response = await api.post(`/marketplace/vendors/${vendorId}/reviews`, data);
    return response.data;
  },
};

// === Vendor API ===

export interface VendorProfile {
  id: number;
  shop_name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  banner_url?: string;
  website?: string;
  location?: string;
  rating: number;
  total_reviews: number;
  total_orders: number;
  is_verified: boolean;
  avg_turnaround_days: number;
  min_order_amount: number;
  specialties?: string[];
  created_at: string;
  // Contact + verification
  phone_country_code?: string;
  phone_number?: string;
  business_email?: string;
  business_address?: string;
  gst_number?: string;
  gst_certificate_url?: string;
  storefront_image_url?: string;
  // Google My Business sync
  gmb_place_id?: string;
  gmb_name?: string;
  gmb_phone?: string;
  gmb_address?: string;
  gmb_website?: string;
  gmb_rating?: number;
  gmb_review_count?: number;
  gmb_maps_url?: string;
  gmb_last_synced?: string;
}

export type VendorAssetType = 'logo' | 'storefront' | 'gst' | 'banner';

export interface VendorAssetUploadResponse {
  url: string;
  asset_type: VendorAssetType;
}

export interface VendorListingItem {
  id: number;
  listing_id: number;
  title: string;
  category: string;
  thumbnail_url: string | null;
  likes_count: number;
  material_name: string;
  thickness_mm: number;
  price: number;
  min_price?: number;
  sold_count: number;
}

export interface VendorMaterialItem {
  id: number;
  vendor_id: number;
  material_id: number;
  material_name?: string;
  custom_price_per_cm2_mm?: number;
  thickness_mm: number;
  is_in_stock: boolean;
  cut_speed_mm_min: number;
  lead_time_days: number;
}

export const vendorApi = {
  listVendors: async (params: { location?: string; sort_by?: string; q?: string } = {}): Promise<VendorProfile[]> => {
    const response = await api.get<VendorProfile[]>('/vendors/', { params });
    return response.data;
  },

  getVendor: async (slug: string): Promise<VendorProfile> => {
    const response = await api.get<VendorProfile>(`/vendors/${slug}`);
    return response.data;
  },

  registerVendor: async (userId: number, data: { shop_name: string; description?: string; website?: string; location?: string }): Promise<VendorProfile> => {
    const response = await api.post<VendorProfile>(`/vendors/register/${userId}`, data);
    return response.data;
  },

  getVendorMaterials: async (vendorId: number): Promise<VendorMaterialItem[]> => {
    const response = await api.get<VendorMaterialItem[]>(`/vendors/${vendorId}/materials`);
    return response.data;
  },

  getVendorListings: async (vendorId: number): Promise<VendorListingItem[]> => {
    const response = await api.get<VendorListingItem[]>(`/vendors/${vendorId}/listings`);
    return response.data;
  },

  addVendorMaterial: async (data: any): Promise<VendorMaterialItem> => {
    const response = await api.post<VendorMaterialItem>('/vendors/materials', data);
    return response.data;
  },

  getVendorStats: async (): Promise<any> => {
    const response = await api.get('/vendors/dashboard/stats');
    return response.data;
  },

  getVendorOrders: async (statusFilter?: string): Promise<any[]> => {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await api.get('/vendors/orders', { params });
    return response.data;
  },

  updateVendorOrder: async (orderId: number, status: string, notes?: string): Promise<any> => {
    const response = await api.put(`/vendors/orders/${orderId}`, null, {
      params: { status, notes },
    });
    return response.data;
  },

  updateProfile: async (body: Partial<VendorProfile>): Promise<VendorProfile> => {
    const response = await api.put<VendorProfile>('/vendors/profile', body);
    return response.data;
  },

  uploadAsset: async (file: File, assetType: VendorAssetType): Promise<VendorAssetUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('asset_type', assetType);
    const response = await api.post<VendorAssetUploadResponse>(
      '/vendors/profile/upload-asset',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },

  syncGmb: async (placeId: string): Promise<VendorProfile> => {
    const response = await api.post<VendorProfile>('/vendors/profile/sync-gmb', {
      place_id: placeId,
    });
    return response.data;
  },
};

// === Design API ===

export interface DesignItem {
  id: number;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  thumbnail_url?: string;
  is_public: boolean;
  is_featured: boolean;
  likes_count: number;
  downloads_count: number;
  creator_name?: string;
  created_at: string;
  min_price?: number;
  vendor_count?: number;
}

export const designApi = {
  createDesign: async (data: {
    file_id: string;
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    is_public?: boolean;
  }): Promise<any> => {
    const response = await api.post('/designs/', data);
    return response.data;
  },

  toggleSharing: async (designId: number, isPublic: boolean): Promise<any> => {
    const response = await api.post(`/designs/${designId}/share`, null, {
      params: { is_public: isPublic },
    });
    return response.data;
  },

  toggleLike: async (designId: number): Promise<{ liked: boolean }> => {
    const response = await api.post(`/designs/${designId}/like`);
    return response.data;
  },

  getMyDesigns: async (): Promise<DesignItem[]> => {
    const response = await api.get('/designs/my');
    return response.data;
  },
};

// === Super Admin API ===

export interface SAUser {
  id: number;
  email: string;
  name: string;
  role: string;
  is_verified: boolean;
  created_at: string;
  order_count: number;
}

export interface SAVendor {
  id: number;
  user_id: number;
  shop_name: string;
  slug: string;
  description?: string;
  location?: string;
  rating: number;
  total_orders: number;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  owner_email: string;
  owner_name: string;
}

export interface SAStats {
  total_users: number;
  total_vendors: number;
  total_orders: number;
  total_revenue: number;
  users_this_month: number;
}

export interface SADesign {
  id: number;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  is_public: boolean;
  is_featured: boolean;
  thumbnail_url?: string;
  creator_name: string;
  likes_count: number;
  created_at: string;
}

export interface SADesignCreate {
  title: string;
  description?: string;
  category: string;
  tags: string[];
  thumbnail_url?: string;
  is_public: boolean;
  is_featured: boolean;
}

export interface SADesignUpdate {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  is_public?: boolean;
  is_featured?: boolean;
  thumbnail_url?: string;
}

export const superAdminApi = {
  getUsers: async (params: { role?: string; search?: string } = {}): Promise<SAUser[]> => {
    const response = await api.get<SAUser[]>('/super-admin/users', { params });
    return response.data;
  },

  updateUserRole: async (userId: number, role: string): Promise<SAUser> => {
    const response = await api.put<SAUser>(`/super-admin/users/${userId}/role`, { role });
    return response.data;
  },

  updateUserVerification: async (userId: number, is_verified: boolean): Promise<SAUser> => {
    const response = await api.put<SAUser>(`/super-admin/users/${userId}/verify`, { is_verified });
    return response.data;
  },

  deleteUser: async (userId: number): Promise<void> => {
    await api.delete(`/super-admin/users/${userId}`);
  },

  getStats: async (): Promise<SAStats> => {
    const response = await api.get<SAStats>('/super-admin/stats');
    return response.data;
  },

  getVendors: async (): Promise<SAVendor[]> => {
    const response = await api.get<SAVendor[]>('/super-admin/vendors');
    return response.data;
  },

  approveVendor: async (vendorId: number, is_verified: boolean): Promise<SAVendor> => {
    const response = await api.put<SAVendor>(`/super-admin/vendors/${vendorId}/approve`, { is_verified });
    return response.data;
  },

  // Design management
  getDesigns: async (): Promise<SADesign[]> => {
    const response = await api.get<SADesign[]>('/super-admin/designs');
    return response.data;
  },

  createDesign: async (data: SADesignCreate): Promise<SADesign> => {
    const response = await api.post<SADesign>('/super-admin/designs', data);
    return response.data;
  },

  updateDesign: async (designId: number, data: SADesignUpdate): Promise<SADesign> => {
    const response = await api.put<SADesign>(`/super-admin/designs/${designId}`, data);
    return response.data;
  },

  deleteDesign: async (designId: number): Promise<void> => {
    await api.delete(`/super-admin/designs/${designId}`);
  },

  listOrders: async (statusFilter?: string): Promise<Order[]> => {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await api.get<Order[]>('/super-admin/orders', { params });
    return response.data;
  },
};

// === Quotes API ===

export interface QuoteCreatePayload {
  customer_name: string;
  customer_email: string;
  items: QuoteLineItem[];
  setup_fee: number;
  tax: number;
  notes: string;
  valid_until: string | null;
}

export const quotesApi = {
  list: async (statusFilter?: string): Promise<Quote[]> => {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await api.get<Quote[]>('/quotes/', { params });
    return response.data;
  },
  get: async (id: number): Promise<Quote> => {
    const response = await api.get<Quote>(`/quotes/${id}`);
    return response.data;
  },
  create: async (data: QuoteCreatePayload): Promise<Quote> => {
    const response = await api.post<Quote>('/quotes/', data);
    return response.data;
  },
  update: async (id: number, data: Partial<QuoteCreatePayload>): Promise<Quote> => {
    const response = await api.put<Quote>(`/quotes/${id}`, data);
    return response.data;
  },
  send: async (id: number): Promise<Quote> => {
    const response = await api.post<Quote>(`/quotes/${id}/send`);
    return response.data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/quotes/${id}`);
  },
  // Public endpoints (no auth)
  getPublic: async (quoteNumber: string): Promise<Quote> => {
    const response = await api.get<Quote>(`/quotes/public/${quoteNumber}`);
    return response.data;
  },
  acceptPublic: async (quoteNumber: string): Promise<Quote> => {
    const response = await api.post<Quote>(`/quotes/public/${quoteNumber}/accept`);
    return response.data;
  },
  rejectPublic: async (quoteNumber: string): Promise<Quote> => {
    const response = await api.post<Quote>(`/quotes/public/${quoteNumber}/reject`);
    return response.data;
  },
};

// ============================================================================
// CRM (Customer intelligence for vendors)
// ============================================================================
export type CustomerTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface CrmCustomer {
  email: string;
  name: string;
  phone?: string | null;
  order_count: number;
  total_spent: number;
  first_order_date: string | null;
  last_order_date: string | null;
  avg_order_value: number;
  tier: CustomerTier;
  days_since_last_order: number | null;
  notes: string;
  tags: string[];
}

export interface CrmCustomerDetail extends CrmCustomer {
  orders: Array<{
    id: number;
    order_number: string;
    total_amount: number;
    status: string;
    created_at: string | null;
    thickness_mm: number;
    quantity: number;
  }>;
}

export interface CrmFilters {
  tier?: CustomerTier;
  search?: string;
  min_spent?: number;
  days_since_order_gt?: number;
}

export const crmApi = {
  listCustomers: async (filters: CrmFilters = {}): Promise<CrmCustomer[]> => {
    const { data } = await api.get<CrmCustomer[]>('/crm/customers', { params: filters });
    return data;
  },
  getCustomer: async (email: string): Promise<CrmCustomerDetail> => {
    const { data } = await api.get<CrmCustomerDetail>(`/crm/customers/${encodeURIComponent(email)}`);
    return data;
  },
  updateNotes: async (email: string, notes: string, tags?: string[]): Promise<void> => {
    await api.put(`/crm/customers/${encodeURIComponent(email)}/notes`, { notes, tags });
  },
  broadcast: async (
    subject: string,
    body: string,
    filter: { tier?: CustomerTier; min_spent?: number } = {}
  ): Promise<{ count: number; recipients: string[] }> => {
    const { data } = await api.post('/crm/broadcast', { subject, body, filter });
    return data;
  },
  createDiscountCode: async (payload: {
    percent_off: number;
    tier?: CustomerTier;
    min_spent?: number;
    expires_days?: number;
  }): Promise<{ code: string }> => {
    const { data } = await api.post('/crm/discount-code', payload);
    return data;
  },
};

// ============================================================================
// Team (Team members + activity log for vendor accounts)
// ============================================================================
export type TeamRole = 'owner' | 'operator' | 'designer' | 'accountant';

export interface TeamMember {
  id: number;
  email: string;
  name?: string | null;
  role: TeamRole;
  accepted: boolean;
  invited_at: string;
  last_active_at?: string | null;
}

export interface ActivityEntry {
  id: number;
  user_email: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const teamApi = {
  list: async (): Promise<TeamMember[]> => {
    const { data } = await api.get<TeamMember[]>('/team/');
    return data;
  },
  invite: async (email: string, role: TeamRole): Promise<TeamMember> => {
    const { data } = await api.post<TeamMember>('/team/invite', { email, role });
    return data;
  },
  accept: async (token: string): Promise<{ status: string }> => {
    const { data } = await api.post(`/team/accept/${token}`);
    return data;
  },
  updateRole: async (id: number, role: TeamRole): Promise<TeamMember> => {
    const { data } = await api.put<TeamMember>(`/team/${id}/role`, { role });
    return data;
  },
  remove: async (id: number): Promise<void> => {
    await api.delete(`/team/${id}`);
  },
  activity: async (page = 1, perPage = 50): Promise<ActivityEntry[]> => {
    const { data } = await api.get<ActivityEntry[]>('/team/activity', {
      params: { page, per_page: perPage },
    });
    return data;
  },
};

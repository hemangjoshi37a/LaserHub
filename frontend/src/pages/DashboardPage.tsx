import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { authApi, Order } from '../services';
import { Package, Calendar, Clock, ChevronRight, Loader2 } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await authApi.listMyOrders();
        setOrders(data);
      } catch (error) {
        console.error('Failed to fetch orders', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, []);

  if (isLoading) {
    return (
      <div className="loading-container">
        <Loader2 className="animate-spin" size={48} />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p>Manage your orders and account settings</p>
        </div>
      </header>

      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Total Orders</h3>
          <div className="stat-value">{orders.length}</div>
        </div>
        <div className="stat-card">
          <h3>Recent Order</h3>
          <div className="stat-value">
            {orders.length > 0 ? `#${orders[0].order_number}` : 'None'}
          </div>
        </div>
      </div>

      <section className="orders-section">
        <h2>Order History</h2>
        {orders.length === 0 ? (
          <div className="empty-orders">
            <Package size={48} />
            <p>You haven't placed any orders yet.</p>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-info">
                  <div className="order-main">
                    <span className="order-number">#{order.order_number}</span>
                    <span className={`order-status status-${order.status}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="order-meta">
                    <span>
                      <Calendar size={14} />
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <span>
                      <Clock size={14} />
                      {order.material_name} ({order.thickness_mm}mm)
                    </span>
                  </div>
                </div>
                <div className="order-total">
                  <span>${order.total_amount.toFixed(2)}</span>
                  <ChevronRight size={20} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

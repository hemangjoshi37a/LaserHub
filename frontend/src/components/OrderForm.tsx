import React, { useState } from 'react';
import { CreditCard, Mail, User, MapPin } from 'lucide-react';
import { useAppStore } from '../store';
import { ordersApi, paymentApi } from '../services';
import { toast } from 'sonner';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null;

interface OrderFormProps {
  onSuccess: (order: any) => void;
}

const CheckoutForm: React.FC<{ order: any; onSuccess: () => void }> = ({ order, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(order.client_secret, {
        payment_method: {
          card: elements.getElement(CardElement)!,
        },
      });

      if (error) {
        toast.error('Payment failed', {
          description: error.message,
        });
      } else if (paymentIntent?.status === 'succeeded') {
        toast.success('Payment successful!');
        onSuccess();
      }
    } catch (err: any) {
      toast.error('Payment error', {
        description: err.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="form-group">
        <label>Card Information</label>
        <div className="card-element">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: '16px',
                  color: '#424770',
                  '::placeholder': {
                    color: '#aab7c4',
                  },
                },
                invalid: {
                  color: '#9e2146',
                },
              },
            }}
          />
        </div>
      </div>

      <button type="submit" disabled={!stripe || processing} className="pay-btn">
        {processing ? 'Processing...' : `Pay $${order.amount.toFixed(2)}`}
      </button>
    </form>
  );
};

export const OrderForm: React.FC<OrderFormProps> = ({ onSuccess }) => {
  const { costEstimate, resetState, selectedMaterial } = useAppStore();
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    shipping_address: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!costEstimate) {
      toast.error('No cost estimate available');
      return;
    }

    setSubmitting(true);

    try {
      // Create order
      const order = await ordersApi.createOrder({
        file_id: costEstimate.file_id,
        material_id: selectedMaterial?.id ?? 1,
        thickness_mm: costEstimate.thickness_mm,
        quantity: costEstimate.quantity,
        customer_email: formData.customer_email,
        customer_name: formData.customer_name,
        shipping_address: formData.shipping_address,
        total_amount: costEstimate.breakdown.total,
      });

      // Create payment intent
      const payment = await paymentApi.createPaymentIntent(order.id, costEstimate.breakdown.total);
      setPaymentIntent({ ...payment, amount: costEstimate.breakdown.total, order });
    } catch (error: any) {
      toast.error('Order creation failed', {
        description: error.response?.data?.detail || 'Please try again',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    toast.success('Order placed successfully!');
    resetState();
    onSuccess(paymentIntent.order);
  };

  if (paymentIntent) {
    return (
      <div className="payment-container">
        <h2>Complete Payment</h2>
        <div className="order-summary">
          <h3>Order Summary</h3>
          <p>Order #: {paymentIntent.order.order_number}</p>
          <p>Total: ${paymentIntent.amount.toFixed(2)}</p>
        </div>

        {stripePromise ? (
          <Elements stripe={stripePromise}>
            <CheckoutForm order={paymentIntent} onSuccess={handlePaymentSuccess} />
          </Elements>
        ) : (
          <div className="payment-unavailable">
            <p>Payment processing is not configured. Please contact support.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="order-form order-form-compact">
      <h3>Customer Information</h3>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group-compact">
            <label><User size={14} /> Name</label>
            <input
              type="text"
              required
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              placeholder="John Doe"
            />
          </div>
          <div className="form-group form-group-compact">
            <label><Mail size={14} /> Email</label>
            <input
              type="email"
              required
              value={formData.customer_email}
              onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
              placeholder="john@example.com"
            />
          </div>
        </div>

        <div className="form-group form-group-compact">
          <label><MapPin size={14} /> Shipping Address</label>
          <textarea
            required
            value={formData.shipping_address}
            onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
            placeholder="123 Main St, City, State 12345"
            rows={2}
          />
        </div>

        {costEstimate && (
          <div className="order-total order-total-compact">
            <span>Subtotal: ${costEstimate.breakdown.subtotal.toFixed(2)}</span>
            <span>Tax: ${costEstimate.breakdown.tax.toFixed(2)}</span>
            <strong>Total: ${costEstimate.breakdown.total.toFixed(2)}</strong>
          </div>
        )}

        <button type="submit" disabled={submitting} className="submit-btn submit-btn-compact">
          <CreditCard size={16} />
          {submitting ? 'Processing...' : 'Proceed to Payment'}
        </button>
      </form>
    </div>
  );
};

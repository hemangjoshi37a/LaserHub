import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Mail, User, MapPin, AlertCircle, LogIn, Info, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';
import { ordersApi, paymentApi, addressesApi, type SavedAddress } from '../services';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';
// Stripe and Razorpay are loaded dynamically only when needed to prevent
// console clutter and tracking prevention warnings on non-payment pages.
import { useCurrencyStore, formatPrice } from '../store/currencyStore';

// ---------------------------------------------------------------------------
// Stripe initialisation — null when key is missing / test placeholder
// ---------------------------------------------------------------------------

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined;

const isValidStripeKey = (key: string | undefined): boolean => {
  if (!key) return false;
  // Reject obvious placeholder values
  if (key.includes('XXXX') || key === 'your_stripe_key') return false;
  return key.startsWith('pk_test_') || key.startsWith('pk_live_');
};

// Helper to load stripe and its react components lazily
let stripePromiseCache: any = null;
let stripeReactLib: any = null;

const getStripeModules = async () => {
  if (!stripePromiseCache && isValidStripeKey(STRIPE_KEY)) {
    const { loadStripe } = await import('@stripe/stripe-js');
    stripePromiseCache = loadStripe(STRIPE_KEY as string);
  }
  if (!stripeReactLib) {
    stripeReactLib = await import('@stripe/react-stripe-js');
  }
  return { stripePromise: stripePromiseCache, ...stripeReactLib };
};

// ---------------------------------------------------------------------------
// Razorpay checkout helper
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Stripe PaymentElement checkout form
// ---------------------------------------------------------------------------

interface CheckoutFormProps {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
}

const StripeCheckoutForm: React.FC<CheckoutFormProps & { stripeLib: any }> = ({ amount, onSuccess, stripeLib }) => {
  const stripe = stripeLib.useStripe();
  const elements = stripeLib.useElements();
  const { currency } = useCurrencyStore();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (error) toast.error('Payment failed', { description: error.message });
      else if (paymentIntent?.status === 'succeeded') {
        toast.success('Payment successful!');
        onSuccess();
      }
    } catch (err: any) {
      toast.error('Payment error', { description: err.message });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="form-group">
        <label>Card / Payment Details</label>
        <div className="card-element">
          <stripeLib.PaymentElement options={{ layout: 'tabs' }} />
        </div>
      </div>
      <button type="submit" disabled={!stripe || processing} className="pay-btn">
        {processing ? 'Processing…' : `Pay ${formatPrice(amount, currency)} with Stripe`}
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Main OrderForm component
// ---------------------------------------------------------------------------

interface OrderFormProps {
  onSuccess: (order?: unknown) => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({ onSuccess }) => {
  const { costEstimate, resetState, selectedMaterial, selectedVendor } = useAppStore();
  const { isAuthenticated, user } = useAuthStore();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);
  const [formData, setFormData] = useState({
    customer_name: user?.name || '',
    customer_email: user?.email || '',
    shipping_address: '',
  });
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [guestTrackingToken, setGuestTrackingToken] = useState<string | null>(null);

  // Load saved addresses for authenticated users
  useEffect(() => {
    if (!isAuthenticated) return;
    addressesApi.list()
      .then((addrs) => {
        setSavedAddresses(addrs);
        const def = addrs.find((a) => a.is_default) || addrs[0];
        if (def) {
          setSelectedAddressId(def.id);
          setFormData((fd) => ({
            ...fd,
            shipping_address: formatAddress(def),
          }));
        }
      })
      .catch(() => { /* no saved addresses */ });
  }, [isAuthenticated]);

  const formatAddress = (a: SavedAddress) =>
    [a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(', ');

  const handleAddressSelect = (id: string) => {
    setSelectedAddressId(id);
    const addr = savedAddresses.find((a) => a.id === id);
    if (addr) {
      setFormData((fd) => ({ ...fd, shipping_address: formatAddress(addr) }));
    } else {
      setFormData((fd) => ({ ...fd, shipping_address: '' }));
    }
  };
  const [submitting, setSubmitting] = useState(false);
  // Holds the Stripe client_secret + order metadata once the intent is created
  const [stripePayment, setStripePayment] = useState<{
    clientSecret: string;
    amount: number;
    order: { id: number; order_number: string };
  } | null>(null);
  // Tracks whether Razorpay checkout is being initialised
  const [razorpayLoading, setRazorpayLoading] = useState(false);

  // Remember the created order so Razorpay can reference it
  const [createdOrder, setCreatedOrder] = useState<{
    id: number;
    order_number: string;
    total_amount: number;
  } | null>(null);

  // Detect whether Razorpay key is configured from env
  const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
  const razorpayConfigured = Boolean(razorpayKeyId && !razorpayKeyId.includes('XXXX'));

  // Pre-load the Razorpay script in the background
  useEffect(() => {
    if (razorpayConfigured) {
      loadRazorpayScript().catch(() => {/* silent */});
    }
  }, [razorpayConfigured]);

  // Lazily loaded Stripe library + Elements provider. Declared here at the top
  // level (NOT inside the `if (createdOrder)` branch) so the hook order stays
  // identical on every render — moving it into the conditional payment screen
  // violated the Rules of Hooks and crashed checkout once an order was created.
  const [stripeLib, setStripeLib] = useState<any>(null);

  useEffect(() => {
    if (createdOrder && isValidStripeKey(STRIPE_KEY)) {
      getStripeModules().then(setStripeLib);
    }
  }, [createdOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!costEstimate) {
      toast.error('No cost estimate available');
      return;
    }

    setSubmitting(true);
    try {
      const order = await ordersApi.createOrder({
        file_id: costEstimate.file_id,
        material_id: selectedMaterial?.id ?? 1,
        thickness_mm: costEstimate.thickness_mm,
        quantity: costEstimate.quantity,
        customer_email: formData.customer_email,
        customer_name: formData.customer_name,
        shipping_address: formData.shipping_address,
        total_amount: costEstimate.breakdown.total,
        vendor_id: selectedVendor?.id,
      });

      setCreatedOrder({
        id: order.id,
        order_number: order.order_number,
        total_amount: costEstimate.breakdown.total,
      });

      // Capture guest tracking token (only present when not logged in)
      const token = (order as unknown as { guest_tracking_token?: string }).guest_tracking_token;
      if (token) {
        setGuestTrackingToken(token);
        const trackUrl = `${window.location.origin}/track/${token}`;
        toast.success('Tracking link ready', {
          description: trackUrl,
          duration: 8000,
        });
        // Simulate "email to customer" in dev
        // eslint-disable-next-line no-console
        console.log(
          `[Guest Order] Tracking URL emailed to ${formData.customer_email}: ${trackUrl}`,
        );
      }

      // If Stripe is configured, pre-fetch the PaymentIntent
      if (isValidStripeKey(STRIPE_KEY)) {
        const payment = await paymentApi.createPaymentIntent(order.id, costEstimate.breakdown.total);
        setStripePayment({
          clientSecret: payment.client_secret,
          amount: costEstimate.breakdown.total,
          order,
        });
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { detail?: string } }; message?: string };
      toast.error('Order creation failed', {
        description: axiosError.response?.data?.detail || 'Please try again',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripeSuccess = () => {
    toast.success('Order placed successfully!');
    resetState();
    onSuccess(createdOrder);
  };

  const handleRazorpay = async () => {
    if (!createdOrder) return;

    setRazorpayLoading(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        toast.error('Failed to load Razorpay. Please check your internet connection.');
        return;
      }

      const rpOrder = await paymentApi.createRazorpayOrder(
        createdOrder.id,
        createdOrder.total_amount,
        'INR'
      );

      const options = {
        key: rpOrder.key_id,
        amount: rpOrder.amount,
        currency: rpOrder.currency,
        name: 'LaserHub',
        description: `Order #${createdOrder.order_number}`,
        order_id: rpOrder.razorpay_order_id,
        handler: (_response: unknown) => {
          // Webhook will update the order status server-side.
          // We optimistically mark it as success on the frontend.
          toast.success('Payment successful!');
          resetState();
          onSuccess(createdOrder);
        },
        prefill: {
          name: formData.customer_name,
          email: formData.customer_email,
        },
        theme: { color: '#0066ff' },
        modal: {
          ondismiss: () => {
            toast.info('Payment cancelled');
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initiate Razorpay';
      toast.error('Razorpay error', { description: message });
    } finally {
      setRazorpayLoading(false);
    }
  };

  // ---- Payment screen (order created, choose payment method) ----
  if (createdOrder) {
    const amount = createdOrder.total_amount;

    return (
      <div className="payment-container">
        <h2>Complete Payment</h2>
        <div className="order-summary">
          <h3>Order Summary</h3>
          <p>Order #: {createdOrder.order_number}</p>
          <p>Total: {fp(amount)}</p>
          {guestTrackingToken && (
            <div style={{
              marginTop: '0.5rem', padding: '0.5rem 0.75rem',
              background: 'var(--color-primary-50, #eff6ff)',
              border: '1px solid var(--color-primary-200, #bfdbfe)',
              borderRadius: 6, fontSize: '0.85rem',
            }}>
              Your tracking link:{' '}
              <Link to={`/track/${guestTrackingToken}`}>
                /track/{guestTrackingToken.slice(0, 8)}…
              </Link>
            </div>
          )}
        </div>

        {/* Stripe section */}
        {stripeLib?.stripePromise && stripePayment ? (
          <div className="payment-method-section">
            <h4 className="payment-method-title">Pay with Card (Stripe)</h4>
            <stripeLib.Elements
              stripe={stripeLib.stripePromise}
              options={{
                clientSecret: stripePayment.clientSecret,
                appearance: { theme: 'stripe' },
              }}
            >
              <StripeCheckoutForm
                stripeLib={stripeLib}
                clientSecret={stripePayment.clientSecret}
                amount={amount}
                onSuccess={handleStripeSuccess}
              />
            </stripeLib.Elements>
          </div>
        ) : isValidStripeKey(STRIPE_KEY) && !stripeLib ? (
          <div className="payment-unavailable">
            <Loader2 size={16} className="spin" />
            <span>Loading payment gateway...</span>
          </div>
        ) : !isValidStripeKey(STRIPE_KEY) ? (
          <div className="payment-unavailable">
            <AlertCircle size={16} />
            <span>Stripe payment is not configured.</span>
          </div>
        ) : null}

        {/* Razorpay section */}
        {razorpayConfigured ? (
          <div className="payment-method-section">
            <h4 className="payment-method-title">Pay with Razorpay</h4>
            <button
              className="razorpay-btn"
              onClick={handleRazorpay}
              disabled={razorpayLoading}
            >
              <img
                src="https://razorpay.com/favicon.png"
                alt=""
                width={16}
                height={16}
                style={{ borderRadius: 2 }}
              />
              {razorpayLoading ? 'Opening Razorpay…' : `Pay ${fp(amount)} with Razorpay`}
            </button>
          </div>
        ) : null}

          <div className="payment-unavailable">
            <AlertCircle size={16} />
            <span>Payment app not added. Please contact support for offline payment options.</span>
          </div>
      </div>
    );
  }

  // ---- Customer info form ----
  return (
    <div className="order-form order-form-compact">
      <h3>Customer Information</h3>

      {!isAuthenticated && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.65rem 0.85rem', marginBottom: '0.75rem',
          background: 'var(--color-primary-50, #eff6ff)',
          border: '1px solid var(--color-primary-200, #bfdbfe)',
          borderRadius: 8, fontSize: '0.85rem',
        }}>
          <Info size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Continuing as guest — create an account to track and reorder easily.
          </span>
          <Link to="/login" className="sa-btn sa-btn--ghost-sm" style={{ whiteSpace: 'nowrap' }}>
            <LogIn size={12} /> Login
          </Link>
        </div>
      )}

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

        {isAuthenticated && savedAddresses.length > 0 && (
          <div className="form-group form-group-compact">
            <label>Saved Addresses</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={selectedAddressId}
                onChange={(e) => handleAddressSelect(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
              >
                <option value="">— Enter new address —</option>
                {savedAddresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.label || 'Address') + ' · ' + formatAddress(a)}
                    {a.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
              <Link to="/admin/my-settings" className="sa-btn sa-btn--ghost-sm" style={{ whiteSpace: 'nowrap' }}>
                Manage
              </Link>
            </div>
          </div>
        )}

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
            <span>Subtotal: {fp(costEstimate.breakdown.subtotal)}</span>
            <span>Tax: {fp(costEstimate.breakdown.tax)}</span>
            <strong>Total: {fp(costEstimate.breakdown.total)}</strong>
          </div>
        )}

        <button type="submit" disabled={submitting} className="submit-btn submit-btn-compact">
          <CreditCard size={16} />
          {submitting ? 'Processing…' : 'Proceed to Payment'}
        </button>
      </form>
    </div>
  );
};

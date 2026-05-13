import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  Mail,
  Lock,
  User,
  UserPlus,
  Loader2,
  Search,
  Upload,
  BookOpen,
  ShieldCheck,
  Building2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { GoogleLogin } from '../components/GoogleLogin';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const CUSTOMER_BENEFITS = [
  {
    icon: <Search size={18} />,
    title: 'Compare prices from multiple vendors',
    desc: 'One upload, side-by-side quotes from verified laser cutting shops.',
  },
  {
    icon: <Upload size={18} />,
    title: 'Upload your design, get instant quotes',
    desc: 'DXF, SVG, AI, PDF, EPS — priced per cm of cut length in seconds.',
  },
  {
    icon: <BookOpen size={18} />,
    title: 'Free design library',
    desc: 'Browse and remix thousands of open designs for laser cutting.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Secure payments',
    desc: 'Stripe-backed checkout with full refund protection.',
  },
];

const VENDOR_BENEFITS = [
  {
    icon: <Building2 size={18} />,
    title: 'Reach thousands of buyers',
    desc: 'Connect with makers, engineers, and designers looking for laser cutting.',
  },
  {
    icon: <Loader2 size={18} />,
    title: 'Automated Quote Engine',
    desc: 'Let our algorithm handle the pricing based on your custom material rates.',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Secure Payouts',
    desc: 'Integrated payment processing with weekly payouts to your bank account.',
  },
  {
    icon: <Search size={18} />,
    title: 'Manage Orders',
    desc: 'Powerful dashboard to track production, shipping, and customer history.',
  },
];

export const RegisterPage: React.FC = () => {
  useDocumentTitle('Create Account — LaserHub');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'vendor'>('customer');
  const navigate = useNavigate();
  const { register, setUser, isLoading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    try {
      await register({ email, name, password, role });
      toast.success('Registration successful! Please check your email for verification.');
      navigate('/login');
    } catch (error) {
      toast.error('Registration failed. Email may already be in use.');
    }
  };

  return (
    <div className="auth-page auth-split">
      <div className="auth-split-inner">
        <div className="auth-card auth-form-col">
          <h1>Create account</h1>
          <p>Join LaserHub for order history and faster checkout</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="role-selector-container">
              <label>I want to...</label>
              <div className="role-selector">
                <button
                  type="button"
                  className={`role-btn ${role === 'customer' ? 'active' : ''}`}
                  onClick={() => setRole('customer')}
                >
                  <Users size={16} />
                  <span>Order Designs</span>
                </button>
                <button
                  type="button"
                  className={`role-btn ${role === 'vendor' ? 'active' : ''}`}
                  onClick={() => setRole('vendor')}
                >
                  <Building2 size={16} />
                  <span>Sell Services</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <div className="input-with-icon">
                <User size={18} />
                <input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-with-icon">
                <Lock size={18} />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <p className="field-hint">Must be at least 8 characters</p>
            </div>

            <button type="submit" className="auth-submit" disabled={isLoading}>
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              Create Account
            </button>
          </form>

          <GoogleLogin
            onSuccess={(data) => {
              localStorage.setItem('user_token', data.access_token);
              setUser(data.user);
              navigate('/dashboard');
            }}
          />

          <p className="auth-footer">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </div>

        <aside className="auth-benefits-col" aria-label="Why LaserHub">
          <div className="auth-benefits-graphic" aria-hidden="true">
            <div className="auth-benefits-graphic-blob" />
            <div className="auth-benefits-graphic-grid" />
          </div>
          <h2>Why LaserHub?</h2>
          <p className="auth-benefits-sub">
            The open marketplace for laser cutting — instant quotes, fair prices,
            built by makers for makers.
          </p>
          <ul className="auth-benefits-list">
            {(role === 'vendor' ? VENDOR_BENEFITS : CUSTOMER_BENEFITS).map((b) => (
              <li key={b.title}>
                <span className="auth-benefits-icon">{b.icon}</span>
                <div>
                  <strong>{b.title}</strong>
                  <p>{b.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
};

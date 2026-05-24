import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  Mail,
  Lock,
  LogIn,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Zap,
  Clock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { GoogleLogin } from '../components/GoogleLogin';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const FEATURES = [
  {
    icon: Clock,
    title: 'Instant quotes',
    desc: 'Upload a design and compare prices across verified vendors in seconds.',
  },
  {
    icon: ShieldCheck,
    title: 'Trusted vendors',
    desc: 'Every shop is reviewed, rated, and backed by our buyer-protection guarantee.',
  },
  {
    icon: Sparkles,
    title: 'Premium materials',
    desc: 'Acrylic, plywood, leather, metal — priced precisely per cm of cut length.',
  },
] as const;

export const LoginPage: React.FC = () => {
  useDocumentTitle('Sign In — LaserHub');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shakeForm, setShakeForm] = useState(false);
  const [formError, setFormError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, setUser, isLoading } = useAuthStore();

  // Resolve where to go after a successful sign-in. Honor ?returnTo= when it is
  // a safe, same-site relative path (must start with a single "/" — this blocks
  // open-redirects like "//evil.com" or "https://evil.com"). Otherwise fall
  // back to the role-appropriate dashboard.
  const redirectAfterAuth = (role?: string) => {
    const returnTo = searchParams.get('returnTo');
    if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      navigate(returnTo, { replace: true });
      return;
    }
    if (role === 'vendor') {
      navigate('/vendor/dashboard');
    } else if (role === 'super_admin') {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!email.trim() || !password) {
      setFormError('Please enter your email and password.');
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 550);
      return;
    }

    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      toast.success('Welcome back');
      redirectAfterAuth(user?.role);
    } catch (error) {
      // Use the message resolved by the auth store (backend `detail` such as
      // "Incorrect email or password"), falling back to a friendly default for
      // network/unexpected failures rather than always blaming the credentials.
      const message = useAuthStore.getState().error || 'Unable to sign in. Please try again.';
      setFormError(message);
      setShakeForm(true);
      setTimeout(() => setShakeForm(false), 550);
    }
  };

  const handleGoogleSuccess = (data: { access_token: string; user: any }) => {
    localStorage.setItem('user_token', data.access_token);
    setUser(data.user);
    redirectAfterAuth(data.user?.role);
  };

  return (
    <div className="lh-auth-shell">
      {/* Background layers: gradient + animated orbs + grid overlay */}
      <div className="lh-auth-bg" aria-hidden />
      <div className="lh-auth-orbs" aria-hidden>
        <span className="lh-auth-orb lh-auth-orb-a" />
        <span className="lh-auth-orb lh-auth-orb-b" />
        <span className="lh-auth-orb lh-auth-orb-c" />
      </div>
      <div className="lh-auth-grid" aria-hidden />

      {/* ── LEFT: Brand showcase (hero image + features) ───────────────── */}
      <aside className="lh-auth-hero" aria-label="Why LaserHub">
        <picture className="lh-auth-hero-img" aria-hidden>
          <source media="(max-width: 768px)" srcSet="/brand/login-hero-mobile.webp" />
          <img
            src="/brand/login-hero.webp"
            alt=""
            loading="lazy"
            decoding="async"
            width={1600}
            height={900}
          />
        </picture>
        <div className="lh-auth-hero-veil" aria-hidden />

        <div className="lh-auth-hero-content">
          <div className="lh-auth-brand">
            <span className="lh-auth-brand-mark" aria-hidden>
              <Zap size={22} />
            </span>
            <div>
              <h1>LaserHub</h1>
              <p className="lh-auth-brand-tag">The Laser Cutting Marketplace</p>
            </div>
          </div>

          <p className="lh-auth-hero-lede">
            Instant quotes, vetted vendors, and premium materials — one upload away.
          </p>

          <ul className="lh-auth-features">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title}>
                <span className="lh-auth-feature-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ── RIGHT: Sign-in form card ───────────────────────────────────── */}
      <main className="lh-auth-form-wrap">
        {/* Mobile logo (visible when the left hero panel is hidden) */}
        <Link to="/" className="lh-auth-mobile-brand">
          <span className="lh-auth-brand-mark" aria-hidden>
            <Zap size={18} />
          </span>
          <strong>LaserHub</strong>
        </Link>

        <div className={`lh-auth-card ${shakeForm ? 'lh-auth-shake' : ''}`}>
          <div className="lh-auth-card-header">
            <h2>Welcome back</h2>
            <p>Sign in to quote, track orders, and manage your workshop.</p>
          </div>

          <form onSubmit={handleSubmit} className="lh-auth-form" noValidate>
            <div className="lh-field">
              <label htmlFor="email">Email</label>
              <div className="lh-field-input">
                <Mail size={16} className="lh-field-icon" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formError) setFormError('');
                  }}
                  required
                />
              </div>
            </div>

            <div className="lh-field">
              <div className="lh-field-label-row">
                <label htmlFor="password">Password</label>
                <Link to="/forgot-password" className="lh-field-link">
                  Forgot password?
                </Link>
              </div>
              <div className="lh-field-input">
                <Lock size={16} className="lh-field-icon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formError) setFormError('');
                  }}
                  required
                />
                <button
                  type="button"
                  className="lh-field-reveal"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {formError && (
              <div className="lh-auth-error" role="alert">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <button type="submit" className="lh-auth-submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 size={18} className="lh-auth-spin" />
              ) : (
                <LogIn size={18} />
              )}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="lh-auth-divider">
            <span>or continue with</span>
          </div>

          <GoogleLogin onSuccess={handleGoogleSuccess} />

          <p className="lh-auth-footer">
            New to LaserHub? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </main>
    </div>
  );
};

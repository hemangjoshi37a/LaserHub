import React, { useState } from 'react';
import { Mail, Github, Clock, CheckCircle } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const SUBJECTS = [
  'General Inquiry',
  'Vendor Inquiry',
  'Bug Report',
  'Feature Request',
  'Other',
];

const SUPPORT_EMAIL = 'hemangjoshi37a@gmail.com';

// RFC-5322-lite: good enough to reject obvious garbage without false negatives.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

export const ContactUsPage: React.FC = () => {
  useDocumentTitle('Contact — LaserHub');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) {
      next.name = 'Please enter your name.';
    }
    if (!email.trim()) {
      next.email = 'Please enter your email.';
    } else if (!EMAIL_RE.test(email.trim())) {
      next.email = 'Please enter a valid email address.';
    }
    if (!message.trim()) {
      next.message = 'Please enter a message.';
    } else if (message.trim().length < 10) {
      next.message = 'Please provide a few more details (at least 10 characters).';
    }
    return next;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSending(true);

    // There is no server-side contact endpoint, so we hand the message off to
    // the user's email client via mailto. We never claim the message was
    // "sent" — only that the draft was opened. The support email is always
    // shown below so the customer can reach us even if mailto fails.
    const body = encodeURIComponent(
      `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`
    );
    const subjectEncoded = encodeURIComponent(`[LaserHub] ${subject}`);

    try {
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subjectEncoded}&body=${body}`;
    } catch {
      // Ignore: the fallback success panel still surfaces the support email.
    }

    // Confirm the hand-off and reset the form to prevent accidental re-submits.
    setSent(true);
    setName('');
    setEmail('');
    setSubject(SUBJECTS[0]);
    setMessage('');
    setErrors({});
    setSending(false);
  };

  return (
    <div className="contact-page">
      {/* Hero */}
      <div className="contact-hero">
        <div className="contact-hero-content">
          <h1 className="contact-hero-title">Get in Touch</h1>
          <p className="contact-hero-sub">
            We typically respond within 24 hours. Reach out for bug reports, vendor
            inquiries, feature requests, or general questions.
          </p>
        </div>
      </div>

      <div className="contact-body">
        {/* Info cards */}
        <div className="contact-grid">
          <div className="contact-card">
            <div className="contact-card-icon">
              <Mail size={22} />
            </div>
            <h3>Email</h3>
            <p>Send us a message directly.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="contact-card-link">
              {SUPPORT_EMAIL}
            </a>
          </div>

          <div className="contact-card">
            <div className="contact-card-icon">
              <Github size={22} />
            </div>
            <h3>GitHub Issues</h3>
            <p>Report bugs or request features on the public tracker.</p>
            <a
              href="https://github.com/hemangjoshi37a/LaserHub/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="contact-card-link"
            >
              Open an issue
            </a>
          </div>

          <div className="contact-card">
            <div className="contact-card-icon">
              <Clock size={22} />
            </div>
            <h3>Response Time</h3>
            <p>We respond to all enquiries within 24–48 hours on business days.</p>
          </div>
        </div>

        {/* Contact form */}
        <div className="contact-form-wrapper">
          <h2>Send a Message</h2>

          {sent ? (
            <div className="contact-success" role="status" aria-live="polite">
              <CheckCircle size={40} className="contact-success-icon" />
              <h3>Your email draft is ready</h3>
              <p>
                We've opened your email client with your message pre-filled. Just
                hit send to reach our team.
              </p>
              <p className="contact-success-note">
                If your email client didn't open, please email us directly at{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </p>
              <button
                type="button"
                className="contact-submit-btn"
                onClick={() => setSent(false)}
              >
                Write another message
              </button>
            </div>
          ) : (
            <>
              <p className="contact-form-note">
                Submitting this form opens your email client pre-filled with your
                message. Prefer to write us directly? Email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </p>
              <form className="contact-form" onSubmit={handleSubmit} noValidate>
                <div className="contact-form-row">
                  <div className="contact-form-group">
                    <label htmlFor="contact-name">Name</label>
                    <input
                      id="contact-name"
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) {
                          setErrors((prev) => ({ ...prev, name: undefined }));
                        }
                      }}
                      placeholder="Your full name"
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? 'contact-name-error' : undefined}
                      required
                    />
                    {errors.name && (
                      <span id="contact-name-error" className="contact-field-error">
                        {errors.name}
                      </span>
                    )}
                  </div>
                  <div className="contact-form-group">
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) {
                          setErrors((prev) => ({ ...prev, email: undefined }));
                        }
                      }}
                      placeholder="you@example.com"
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? 'contact-email-error' : undefined}
                      required
                    />
                    {errors.email && (
                      <span id="contact-email-error" className="contact-field-error">
                        {errors.email}
                      </span>
                    )}
                  </div>
                </div>

                <div className="contact-form-group">
                  <label htmlFor="contact-subject">Subject</label>
                  <select
                    id="contact-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="contact-form-group">
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      if (errors.message) {
                        setErrors((prev) => ({ ...prev, message: undefined }));
                      }
                    }}
                    placeholder="Describe your question or issue in detail..."
                    rows={7}
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? 'contact-message-error' : undefined}
                    required
                  />
                  {errors.message && (
                    <span id="contact-message-error" className="contact-field-error">
                      {errors.message}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="contact-submit-btn"
                  disabled={sending}
                >
                  <Mail size={16} />
                  {sending ? 'Opening…' : 'Send Message'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

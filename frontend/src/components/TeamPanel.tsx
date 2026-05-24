import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, Loader2, Activity, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  teamApi,
  type TeamMember,
  type TeamRole,
  type ActivityEntry,
} from '../services';

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: '#6d28d9',
  operator: '#0ea5e9',
  designer: '#16a34a',
  accountant: '#d97706',
};

const ROLES: TeamRole[] = ['owner', 'operator', 'designer', 'accountant'];

// Basic email format check, mirrors the backend EmailStr requirement closely
// enough to catch obvious mistakes before we hit the API.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Extract a human-readable message from an Axios error, handling FastAPI's
 *  `detail` which may be a string OR an array of validation errors (422). */
function errorMessage(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first?.msg) return String(first.msg);
  }
  if (typeof e?.message === 'string') return e.message;
  return fallback;
}

function initials(name?: string | null, email?: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export const TeamPanel: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [showInvite, setShowInvite] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([teamApi.list(), teamApi.activity(1, 50)]);
      setMembers(m);
      setActivity(a);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRoleChange = async (id: number, role: TeamRole) => {
    try {
      await teamApi.updateRole(id, role);
      toast.success('Role updated');
      load();
    } catch (e: any) {
      toast.error(errorMessage(e, 'Update failed'));
    }
  };

  const handleRemove = async (id: number) => {
    if (!window.confirm('Remove this team member?')) return;
    try {
      await teamApi.remove(id);
      toast.success('Removed');
      load();
    } catch (e: any) {
      toast.error(errorMessage(e, 'Remove failed'));
    }
  };

  const pending = members.filter((m) => !m.accepted);
  const active = members.filter((m) => m.accepted);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Team</h1>
          <p className="adm-page-sub">
            {active.length} active · {pending.length} pending
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="sa-btn sa-btn--ghost-sm" onClick={load}>
            <RefreshCw size={14} />
          </button>
          <button className="sa-btn sa-btn--primary-sm" onClick={() => setShowInvite(true)}>
            <UserPlus size={14} /> Invite Member
          </button>
        </div>
      </header>

      <div className="adm-card" style={{ marginBottom: '1.5rem' }}>
        <div className="adm-card-header">
          <h2 className="adm-card-title">
            <Users size={18} /> Team members
          </h2>
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Loader2 className="spinner" size={28} />
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No team members yet. Click "Invite Member" to add your first.
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Last Active</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="adm-row">
                    <td>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: ROLE_COLORS[m.role] || '#6b7280',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        {initials(m.name, m.email)}
                      </div>
                    </td>
                    <td className="adm-cell-medium">{m.name || '—'}</td>
                    <td className="adm-cell-sub">{m.email}</td>
                    <td>
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as TeamRole)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: 6,
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="adm-cell-sub">
                      {new Date(m.invited_at).toLocaleDateString()}
                    </td>
                    <td className="adm-cell-sub">
                      {m.last_active_at
                        ? new Date(m.last_active_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td>
                      {m.accepted ? (
                        <span className="sa-badge sa-badge--success">Active</span>
                      ) : (
                        <span className="sa-badge">Pending</span>
                      )}
                    </td>
                    <td>
                      {!m.accepted && (
                        <button
                          className="sa-btn sa-btn--ghost-sm"
                          disabled
                          title="Resending invite emails isn't available yet"
                          style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        >
                          Resend
                        </button>
                      )}
                      <button
                        className="sa-btn sa-btn--danger-sm"
                        onClick={() => handleRemove(m.id)}
                        style={{ marginLeft: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h2 className="adm-card-title">
            <Activity size={18} /> Recent activity
          </h2>
        </div>
        {activity.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No activity yet.
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {activity.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: '0.6rem 1rem',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <strong>{e.user_name || e.user_email || 'Someone'}</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{e.action}</span>
                  {e.entity_type && (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {' '}
                      on {e.entity_type}
                      {e.entity_id ? ` #${e.entity_id}` : ''}
                    </span>
                  )}
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={load} />}
    </div>
  );
};

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('operator');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Email required');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      toast.error('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      await teamApi.invite(trimmed, role);
      toast.success('Invite created');
      onInvited();
      onClose();
    } catch (e: any) {
      toast.error(errorMessage(e, 'Invite failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary, #fff)',
          borderRadius: 8,
          width: 'min(420px, 95%)',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Invite Team Member</h3>
          <button className="sa-btn sa-btn--ghost-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '1rem' }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) submit();
          }}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid var(--border-color)',
          }}
        />
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
          Role
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as TeamRole)}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 6,
            border: '1px solid var(--border-color)',
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button className="sa-btn sa-btn--ghost-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="sa-btn sa-btn--primary-sm" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={14} className="spinner" /> : <UserPlus size={14} />} Invite
          </button>
        </div>
      </div>
    </div>
  );
}

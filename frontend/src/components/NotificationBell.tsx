/**
 * NotificationBell — shared in-app notification bell + dropdown.
 *
 * Polls GET /api/notifications every 30s, shows an unread count badge, and
 * renders a dropdown listing each notification's title / message / time.
 * Clicking a notification marks it read (if unread) and navigates to its
 * `link` (when present).
 *
 * Used both in the dashboard header (DashboardLayout) and the public top nav
 * (NavUserMenu) so logged-in customers always see their notifications.
 *
 * Styling reuses the existing `dash-notifications-*` classes from
 * styles/dashboard-new.css. The optional `variant` prop adds a modifier class
 * so the bell can adapt to the lighter public navbar.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationsApi } from '../services';

interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type?: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

const POLL_INTERVAL_MS = 30_000;

interface NotificationBellProps {
  /** Visual variant: 'dashboard' (dark header) or 'navbar' (public top nav). */
  variant?: 'dashboard' | 'navbar';
}

export function NotificationBell({ variant = 'dashboard' }: NotificationBellProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Poll for notifications while mounted.
  useEffect(() => {
    let cancelled = false;

    const fetchNotifications = async () => {
      try {
        const data = await notificationsApi.list();
        if (!cancelled) setNotifications(data as NotificationItem[]);
      } catch {
        // Silent — the bell simply shows no notifications on failure.
      }
    };

    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkRead = async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      // Non-fatal — leave the item unread if the request fails.
    }
  };

  const handleItemClick = (n: NotificationItem) => {
    if (!n.is_read) handleMarkRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div
      className={`dash-notifications-wrapper notif-bell-${variant}`}
      ref={wrapperRef}
    >
      <button
        type="button"
        className={`dash-icon-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={20} />
        {unreadCount > 0 && <div className="notification-dot">{unreadCount}</div>}
      </button>

      {open && (
        <div className="dash-notifications-dropdown" role="menu">
          <div className="dash-notifications-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && <span>{unreadCount} unread</span>}
          </div>
          <div className="dash-notifications-list">
            {notifications.length === 0 ? (
              <div className="dash-no-notifications">
                <Bell size={24} />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  role="menuitem"
                  tabIndex={0}
                  className={`dash-notification-item ${n.is_read ? 'read' : 'unread'}`}
                  onClick={() => handleItemClick(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(n);
                    }
                  }}
                >
                  <div className="notification-item-dot" />
                  <div className="notification-item-content">
                    <p className="notification-item-title">{n.title}</p>
                    <p className="notification-item-msg">{n.message}</p>
                    <span className="notification-item-time">
                      {new Date(n.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;

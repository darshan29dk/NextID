import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import './Toast.css';

/**
 * Toast notification component.
 * Usage: import { useToast } from '../../components/Toast/Toast';
 * const { showToast, ToastContainer } = useToast();
 * showToast('Operation successful!', 'success');
 * Return <ToastContainer /> somewhere in your JSX (once per page).
 */

const ICONS = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const ToastItem = ({ toast, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setVisible(true), 10);
    // Auto-close after duration
    const closeTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose(toast.id), 350);
    }, toast.duration || 4000);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(closeTimer);
    };
  }, [toast, onClose]);

  return (
    <div className={`toast-item toast-${toast.type} ${visible ? 'toast-visible' : ''}`}>
      <div className="toast-icon">{ICONS[toast.type] || ICONS.info}</div>
      <div className="toast-message">{toast.message}</div>
      <button
        className="toast-close"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onClose(toast.id), 350);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
};

let _setToasts = null;
let _toastIdCounter = 0;

/**
 * Show a toast notification from anywhere.
 * type: 'success' | 'error' | 'warning' | 'info'
 */
export const showToast = (message, type = 'info', duration = 4000) => {
  if (!_setToasts) {
    // Fallback to native alert if Toast not mounted
    alert(message);
    return;
  }
  const id = ++_toastIdCounter;
  _setToasts((prev) => [...prev, { id, message, type, duration }]);
};

/**
 * Mount this once at your page root to enable toasts on that page.
 */
export const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _setToasts = setToasts;
    return () => { _setToasts = null; };
  }, []);

  const handleClose = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={handleClose} />
      ))}
    </div>
  );
};

export default ToastContainer;

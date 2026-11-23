import React from 'react';
import { X } from 'lucide-react';
import { useLang } from '../lib/i18n.tsx';

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-4 border-b border-gray-200">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827] tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
  icon?: React.ReactNode;
}> = ({ label, value, hint, accent = false, icon }) => (
  <div className="wab-card rounded-xl p-4 sm:p-5 transition-colors hover:border-[#14532D]/40">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className={`mt-1.5 text-2xl sm:text-3xl font-extrabold font-mono-num ${accent ? 'text-[#14532D]' : 'text-[#111827]'}`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-gray-500 truncate">{hint}</p>}
      </div>
      {icon && (
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            accent ? 'bg-[#DCFCE7] text-[#14532D]' : 'bg-gray-100 text-[#14532D] border border-gray-200'
          }`}
        >
          {icon}
        </div>
      )}
    </div>
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ open, title, onClose, children, maxWidth = 'max-w-2xl' }) => {
  const { lang } = useLang();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5 overflow-y-auto">
      <div className={`w-full ${maxWidth} rounded-xl bg-white border border-gray-200 overflow-hidden my-auto max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-[#14532D] text-white shrink-0">
          <h2 className="text-base sm:text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label={lang === 'fr' ? 'Fermer' : 'إغلاق'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto text-[#111827]">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}> = ({ open, title, message, confirmLabel = 'تأكيد', onConfirm, onCancel, loading = false }) => {
  const { lang } = useLang();
  if (!open) return null;
  return (
    <Modal open={open} title={title} onClose={onCancel} maxWidth="max-w-md">
      <p className="text-sm text-gray-700 leading-relaxed">{message}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 min-h-[44px]"
        >
          {lang === 'fr' ? 'Annuler' : 'إلغاء'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className="px-4 py-2.5 rounded-lg bg-[#DC2626] text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
        >
          {loading ? (lang === 'fr' ? 'En cours...' : 'جاري التنفيذ...') : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="wab-card rounded-xl p-8 text-center">
    <h3 className="text-base font-extrabold text-[#111827]">{title}</h3>
    <p className="mt-1.5 text-sm text-gray-600 max-w-md mx-auto">{description}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const AvatarBadge: React.FC<{
  name: string;
  photoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ name, photoUrl, size = 'md' }) => {
  const dims = size === 'lg' ? 'w-20 h-20 text-xl' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-11 h-11 text-sm';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${dims} rounded-xl object-cover border border-gray-200 shrink-0 bg-gray-100`}
      />
    );
  }

  return (
    <div
      className={`${dims} rounded-xl bg-[#14532D] border border-[#14532D] flex items-center justify-center font-extrabold text-white shrink-0`}
    >
      {initials || 'W'}
    </div>
  );
};

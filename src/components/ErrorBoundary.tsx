import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { FirestoreErrorInfo } from '../lib/firebase.ts';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isPermissionError: boolean;
  path?: string | null;
}

function parseErrorDetails(error: unknown): {
  message: string;
  isPermissionError: boolean;
  path?: string | null;
} {
  const raw = error instanceof Error ? error.message : String(error || 'Unexpected error');
  try {
    const parsed = JSON.parse(raw) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed.error === 'string' && 'operationType' in parsed) {
      const lower = parsed.error.toLowerCase();
      const isPerm =
        lower.includes('permission') ||
        lower.includes('insufficient') ||
        lower.includes('missing or insufficient');
      return {
        message: parsed.error,
        isPermissionError: isPerm,
        path: parsed.path,
      };
    }
  } catch {
    // plain error string
  }
  const lowerRaw = raw.toLowerCase();
  return {
    message: raw,
    isPermissionError:
      lowerRaw.includes('permission') || lowerRaw.includes('insufficient'),
  };
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isPermissionError: false,
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const parsed = parseErrorDetails(error);
    return {
      hasError: true,
      message: parsed.message,
      isPermissionError: parsed.isPermissionError,
      path: parsed.path,
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('WAB ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[#F8FAFC] text-[#111827] flex items-center justify-center p-4"
        >
          <div className="wab-card rounded-2xl max-w-md w-full p-7 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#DC2626] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h1 className="text-lg font-extrabold text-[#111827]">
              {this.state.isPermissionError
                ? 'تعذر الوصول إلى البيانات (صلاحيات Firebase)'
                : 'حدث خطأ غير متوقع في المنصة'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              {this.state.isPermissionError
                ? 'تأكد من تسجيل الدخول بحساب مفعّل وبريد إلكتروني مؤكد يمتلك صلاحية هذا الفضاء.'
                : 'تم احتواء الخطأ دون فقدان أي بيانات محفوظة. يمكنك إعادة المحاولة الآن.'}
            </p>
            {this.state.path && (
              <div className="text-[11px] font-mono-num text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                {this.state.path}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '', isPermissionError: false });
                window.location.reload();
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#14532D] py-3 px-4 text-sm font-bold text-white hover:bg-[#166534] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل المنصة</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

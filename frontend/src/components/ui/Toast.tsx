import React from 'react';
import { useToastStore } from '../../store/useToastStore';
import { cn } from '../../lib/utils';
import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';

export const Toast: React.FC = () => {
  const { message, type, visible } = useToastStore();

  if (!visible || !message) return null;

  const iconMap = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    warn: <AlertCircle className="w-4 h-4 text-amber-500" />,
    error: <XCircle className="w-4 h-4 text-rose-500" />,
    info: <Info className="w-4 h-4 text-blue-500" />,
  };

  return (
    <div
      className={cn(
        'fixed top-5 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2.5 px-4 py-2.5',
        'bg-surface/95 backdrop-blur-md border border-border-subtle rounded-full shadow-lg',
        'text-[13px] font-medium text-text-main transition-all duration-200 animate-in fade-in slide-in-from-top-2'
      )}
    >
      {iconMap[type]}
      <span>{message}</span>
    </div>
  );
};

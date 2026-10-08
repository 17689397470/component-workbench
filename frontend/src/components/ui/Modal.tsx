import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  zIndex?: number;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  zIndex = 50,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
    >
      {/* 毛玻璃背景 */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div
        className={cn(
          'relative w-full bg-surface border border-border-subtle rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col',
          'animate-in zoom-in-95 duration-200 max-h-[90vh]',
          maxWidth
        )}
      >
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="text-base font-semibold text-text-main flex items-center gap-2">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

import React, { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-lg',
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* 遮罩背景 */}
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex pl-10">
        <div
          className={cn(
            'w-screen bg-surface border-l border-border-subtle shadow-2xl flex flex-col',
            'md:rounded-l-2xl animate-in slide-in-from-right duration-300',
            maxWidth
          )}
        >
          {/* 抽屉顶部标题栏 */}
          <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between flex-shrink-0">
            <div>
              <div className="text-base font-semibold text-text-main flex items-center gap-2">
                {title}
              </div>
              {subtitle && <div className="text-xs text-text-dim mt-0.5">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 抽屉内容区 */}
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {/* 抽屉底部操作栏 */}
          {footer && (
            <div className="px-6 py-4 border-t border-border-subtle bg-subtle/40 flex-shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

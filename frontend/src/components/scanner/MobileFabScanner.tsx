import React from 'react';
import { Camera } from 'lucide-react';
import { useScannerStore } from '../../store/useScannerStore';
import { triggerHaptic } from '../../lib/utils';

export const MobileFabScanner: React.FC = () => {
  const { openScanner } = useScannerStore();

  const handleClick = () => {
    triggerHaptic();
    openScanner();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="md:hidden fixed bottom-[74px] right-4 z-40 flex items-center gap-2 bg-text-main text-surface px-4 py-3 rounded-full shadow-lg active:scale-95 transition-all text-xs font-semibold"
      title="打开手机沉浸式扫码与拍标签录入"
    >
      <Camera className="w-4 h-4" />
      <span>扫码入库</span>
    </button>
  );
};

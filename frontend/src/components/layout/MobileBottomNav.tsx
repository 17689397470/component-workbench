import React from 'react';
import { ActiveTab } from './FloatingHeader';
import { Package, Layers, FileSpreadsheet, Hammer } from 'lucide-react';
import { cn, triggerHaptic } from '../../lib/utils';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { key: 'boxes', label: '物理收纳', icon: Layers },
    { key: 'projects', label: '工程与BOM', icon: Hammer },
    { key: 'inventory', label: '我的库存', icon: Package },
  ] as const;

  const handleSelect = (key: ActiveTab) => {
    triggerHaptic();
    onTabChange(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-[58px] bg-surface/90 backdrop-blur-xl border-t border-border-subtle z-40 px-2 flex items-center justify-around pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleSelect(tab.key)}
            className="flex-1 flex flex-col items-center justify-center py-1 select-none active:scale-95 transition-transform"
          >
            <Icon
              className={cn(
                'w-5 h-5 transition-transform duration-200',
                isActive ? 'text-accent scale-110' : 'text-text-dim'
              )}
            />
            <span
              className={cn(
                'text-[10px] mt-0.5 tracking-tight transition-colors',
                isActive ? 'font-semibold text-text-main' : 'font-normal text-text-dim'
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

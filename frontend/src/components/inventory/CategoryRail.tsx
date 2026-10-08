import React from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { cn } from '../../lib/utils';

export const CategoryRail: React.FC = () => {
  const { categoryFilter, setCategoryFilter } = useInventoryStore();

  const categories = [
    { key: '', label: '全部', icon: '🔹' },
    { key: '电阻', label: '电阻', icon: '⚡' },
    { key: '电容', label: '电容', icon: '🔋' },
    { key: '芯片', label: '芯片', icon: '🔲' },
    { key: '二极管', label: '二极管', icon: '▲' },
    { key: '三极管/MOS', label: '三极管/MOS', icon: '◈' },
    { key: '接插件', label: '接插件', icon: '🔌' },
    { key: '模块', label: '模块', icon: '📦' },
    { key: '电感', label: '电感', icon: '🌀' },
    { key: '其他', label: '其他', icon: '🏷️' },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 no-scrollbar select-none">
      {categories.map((c) => {
        const isActive = categoryFilter === c.key;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategoryFilter(c.key)}
            className={cn(
              'px-2.5 py-1 rounded-[2px] text-xs font-mono font-bold whitespace-nowrap transition-colors flex items-center gap-1 border',
              isActive
                ? 'bg-accent/15 text-accent border-accent/40 shadow-2xs font-black'
                : 'bg-surface text-text-muted hover:text-text-main hover:bg-subtle border-border-subtle'
            )}
          >
            <span className="text-[11px]">{c.icon}</span>
            <span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
};

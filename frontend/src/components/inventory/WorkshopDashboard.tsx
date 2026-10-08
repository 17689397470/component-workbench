import React from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { ChevronUp, ChevronDown, Package, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const WorkshopDashboard: React.FC = () => {
  const { stats, setLowStockOnly, lowStockOnly } = useInventoryStore();

  if (!stats) return null;

  return (
    <div className="mb-3 bg-surface border border-border-subtle rounded-[3px] px-3.5 py-2 flex items-center justify-between gap-3 text-xs font-mono select-none">
      {/* 左侧：在库总览、物理收纳、告警指标紧凑单行排布 */}
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap min-w-0">
        {/* 在库资产 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Package className="w-3.5 h-3.5 text-accent stroke-[2.2]" />
          <span className="text-text-muted font-sans font-medium">在库现货:</span>
          <strong className="text-text-main font-black">{stats.totalTypes}</strong>
          <span className="text-text-muted text-[11px]">种 SKU</span>
          <span className="text-text-muted/60">/</span>
          <strong className="text-accent font-black">{stats.totalPieces}</strong>
          <span className="text-text-muted text-[11px]">件</span>
        </div>

        <span className="text-border-subtle hidden sm:inline">|</span>

        {/* 物理空间 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Layers className="w-3.5 h-3.5 text-text-muted stroke-[2.2]" />
          <span className="text-text-muted font-sans font-medium">物理容器:</span>
          <strong className="text-text-main font-black">{stats.boxesCount}</strong>
          <span className="text-text-muted text-[11px]">个</span>
        </div>

        <span className="text-border-subtle hidden sm:inline">|</span>

        {/* 低库存告警快速切换微标 */}
        <button
          type="button"
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 rounded-[2px] transition-colors border text-[11px] font-bold shrink-0',
            lowStockOnly
              ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
              : stats.lowStockCount > 0
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              : 'bg-canvas text-text-muted border-border-subtle'
          )}
          title="点击切换仅查看低库存告警元件"
        >
          <AlertTriangle className="w-3 h-3 stroke-[2.2]" />
          <span>待补料: {stats.lowStockCount} 种</span>
        </button>

        {/* 核心品类等宽紧凑标签 */}
        {stats.categoryDistribution && stats.categoryDistribution.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-text-muted">
            <span className="text-border-subtle">|</span>
            <span className="text-text-muted/80 font-sans">分布:</span>
            {stats.categoryDistribution.slice(0, 3).map((c) => (
              <span
                key={c.category}
                className="px-1.5 py-0.2 bg-canvas border border-border-subtle rounded-[2px] text-text-muted"
              >
                {c.category} {c.count}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：工规运行状态指示微灯 */}
      <div className="hidden sm:flex items-center gap-2 shrink-0 text-[11px]">
        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-sans font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
          <span>本地工坊数据库就绪</span>
        </span>
      </div>
    </div>
  );
};

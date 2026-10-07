import React from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { ChevronUp, ChevronDown, Package, Layers, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const WorkshopDashboard: React.FC = () => {
  const { stats, dashboardCollapsed, toggleDashboardCollapsed, setLowStockOnly, lowStockOnly } =
    useInventoryStore();

  if (!stats) return null;

  return (
    <div className="mb-5 bg-surface border border-border-subtle rounded-2xl p-4 shadow-sm transition-all">
      {/* 顶栏小标题与折叠开关 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-text-main flex items-center gap-1.5">
            <span>⚡</span> 工坊数据大盘
          </span>
          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            健康运行中
          </span>
        </div>
        <button
          type="button"
          onClick={toggleDashboardCollapsed}
          className="text-[11px] font-medium text-text-muted hover:text-text-main flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-subtle transition-colors"
        >
          {dashboardCollapsed ? (
            <>
              <span>展开大盘</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>收起大盘</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* 展开态：三卡片网格 */}
      {!dashboardCollapsed ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* 卡片 1: 在库现货总览 */}
          <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-text-muted">
              <span className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-accent" />
                <span>在库现货总览</span>
              </span>
            </div>
            <div className="my-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-sans text-text-main tabular-nums">
                {stats.totalTypes}
              </span>
              <span className="text-xs text-text-muted">种 SKU</span>
            </div>
            <div className="text-[11px] text-text-dim flex items-center gap-1">
              <span>在库总件数:</span>
              <strong className="text-accent font-mono font-semibold">{stats.totalPieces}</strong>
              <span>件</span>
            </div>
          </div>

          {/* 卡片 2: 品类结构分布 */}
          <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-text-muted">
              <span>📊 品类结构分布</span>
              <span className="text-[10px] text-text-dim">占比统计</span>
            </div>
            {/* 多色分段进度条 */}
            <div className="my-2.5 h-2 w-full bg-subtle rounded-full overflow-hidden flex">
              {stats.categoryDistribution?.slice(0, 5).map((cat, idx) => {
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500'];
                return (
                  <div
                    key={cat.category}
                    className={cn('h-full', colors[idx % colors.length])}
                    style={{ width: `${cat.percentage}%` }}
                    title={`${cat.category}: ${cat.count} 种 (${cat.percentage}%)`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto text-[10px] text-text-muted no-scrollbar">
              {stats.categoryDistribution?.slice(0, 4).map((c) => (
                <span key={c.category} className="whitespace-nowrap">
                  {c.category}: {c.count}种
                </span>
              ))}
            </div>
          </div>

          {/* 卡片 3: 物理收纳与健康度 */}
          <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-text-muted">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-accent" />
                <span>物理收纳与健康度</span>
              </span>
            </div>
            <div className="my-2 flex items-center justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-sans text-text-main tabular-nums">
                  {stats.boxesCount}
                </span>
                <span className="text-xs text-text-muted">个收纳盒</span>
              </div>
              {/* 低库存警告胶囊 */}
              <button
                type="button"
                onClick={() => setLowStockOnly(!lowStockOnly)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  lowStockOnly
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20'
                )}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>待补料: {stats.lowStockCount} 种</span>
              </button>
            </div>
            <div className="text-[11px] text-text-dim">
              <span>空间分配健康 · 现货入盒率 100%</span>
            </div>
          </div>
        </div>
      ) : (
        /* 收起态：极简单行摘要 */
        <div className="flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-3">
            <span>
              📦 在库 <strong className="text-text-main">{stats.totalTypes}</strong> 种 (
              <strong className="text-text-main">{stats.totalPieces}</strong> 件)
            </span>
            <span>·</span>
            <span>
              🗄️ <strong className="text-text-main">{stats.boxesCount}</strong> 个收纳盒
            </span>
            <span>·</span>
            <span
              onClick={() => setLowStockOnly(!lowStockOnly)}
              className="text-amber-600 cursor-pointer font-medium hover:underline flex items-center gap-1"
            >
              ⚠️ {stats.lowStockCount} 种待补料
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

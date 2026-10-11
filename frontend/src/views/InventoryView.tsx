import React, { useEffect, useRef } from 'react';
import { useInventoryStore } from '../store/useInventoryStore';
import { useToastStore } from '../store/useToastStore';
import { WorkshopDashboard } from '../components/inventory/WorkshopDashboard';
import { CategoryRail } from '../components/inventory/CategoryRail';
import { InventoryTable } from '../components/inventory/InventoryTable';
import { InventoryGrid } from '../components/inventory/InventoryGrid';
import { ComponentDetailDrawer } from '../components/inventory/ComponentDetailDrawer';
import { ComponentEntryDrawer } from '../components/inventory/ComponentEntryDrawer';
import { Search, Table as TableIcon, LayoutGrid, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { componentApi } from '../api/componentApi';

export const InventoryView: React.FC = () => {
  const {
    components,
    loading,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    gridDensity,
    toggleGridDensity,
    fetchComponents,
    fetchStats,
    locationFilter,
    setLocationFilter,
  } = useInventoryStore();

  const { showToast } = useToastStore();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchComponents();
    fetchStats();
  }, []);

  // 监听键盘 '/' 快捷键自动聚焦搜索框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 一键灌入常用 E24/常用芯片预设
  const handleSeedPresets = async () => {
    try {
      const res = await componentApi.seedPresets();
      if (res.success) {
        showToast(`✔ 成功载入 ${res.data.count} 项常用元件预设！`, 'success');
        fetchComponents();
        fetchStats();
      }
    } catch (err: any) {
      showToast('预设载入失败: ' + err.message, 'error');
    }
  };

  return (
    <div className="max-w-[1720px] mx-auto px-2 sm:px-4 py-3">
      {/* 顶部工坊紧凑大盘 */}
      <WorkshopDashboard />

      {/* 工规检索与工具栏 */}
      <div className="mb-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* 紧凑搜索框 */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted stroke-[2.2] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索型号、阻值、封装、盒位... (按 / 快速聚焦)"
            className="w-full bg-surface border border-border-subtle rounded-[2px] pl-9 pr-12 py-1.5 text-xs text-text-main font-mono placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-block text-[10px] font-mono font-bold text-text-muted bg-subtle px-1.5 py-0.2 rounded-[2px] border border-border-subtle pointer-events-none">
            /
          </kbd>
        </div>

        {/* 右侧工具组 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 按盒位筛选标签 (如果处于按盒筛选中) */}
          {locationFilter && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 text-accent border border-accent/30 rounded-[2px] text-xs font-mono font-bold">
              <span>盒位: {locationFilter}</span>
              <button
                type="button"
                onClick={() => setLocationFilter('')}
                className="hover:opacity-75 font-bold ml-0.5"
              >
                ✕
              </button>
            </div>
          )}

          {/* 常用预设快捷载入 */}
          {components.length === 0 && !loading && (
            <button
              type="button"
              onClick={handleSeedPresets}
              className="text-xs font-bold text-text-muted hover:text-text-main border border-border-subtle hover:border-border-hover bg-surface px-2.5 py-1.5 rounded-[2px] flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent stroke-[2.2]" />
              <span>载入常用预设</span>
            </button>
          )}

          {/* 移动端单双列密度切换 */}
          {viewMode === 'grid' && (
            <button
              type="button"
              onClick={toggleGridDensity}
              className="md:hidden text-xs text-text-muted bg-surface border border-border-subtle px-2 py-1 rounded-[2px] flex items-center gap-1"
            >
              <span>{gridDensity === 'double' ? '▦ 双列' : '🔲 单列'}</span>
            </button>
          )}

          {/* 视图分段切换器 (📋 表格 vs 🗂️ 图文大卡 - 工规分段按钮) */}
          <div className="flex items-center bg-subtle/70 p-0.5 rounded-[2px] border border-border-subtle">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold rounded-[2px] transition-all',
                viewMode === 'table'
                  ? 'bg-surface text-accent shadow-2xs border border-border-subtle'
                  : 'text-text-muted hover:text-text-main border border-transparent'
              )}
            >
              <TableIcon className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>表格</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-bold rounded-[2px] transition-all',
                viewMode === 'grid'
                  ? 'bg-surface text-accent shadow-2xs border border-border-subtle'
                  : 'text-text-muted hover:text-text-main border border-transparent'
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5 stroke-[2.2]" />
              <span>卡片</span>
            </button>
          </div>
        </div>
      </div>

      {/* 分类紧凑导轨 */}
      <CategoryRail />

      {/* 视图内容展示 */}
      {loading ? (
        <div className="py-24 text-center text-text-dim text-xs">正在加载工坊元件...</div>
      ) : viewMode === 'table' ? (
        <InventoryTable components={components} />
      ) : (
        <InventoryGrid components={components} density={gridDensity} />
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import {
  StorageBoxSummary,
  BoxGridResponseData,
  BoxGridSlot,
  BoxComponentDetail,
} from '../../types/box';
import { ComponentItem } from '../../types/component';
import { boxApi } from '../../api/boxApi';
import { componentApi } from '../../api/componentApi';
import { useToastStore } from '../../store/useToastStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { AcrylicDrawerCell } from './AcrylicDrawerCell';
import {
  Search,
  RefreshCw,
  Printer,
  Settings,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Archive,
  ExternalLink,
  Inbox,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Minus,
  FileText,
} from 'lucide-react';

interface BoxWorkspaceProps {
  box: StorageBoxSummary | null;
  hasAnyBox?: boolean;
  onCreateBox?: () => void;
  onOpenDetailDrawer?: (box: StorageBoxSummary) => void;
  onConfigEdit: (box: StorageBoxSummary) => void;
  onOpenLabelPrint: (box: StorageBoxSummary) => void;
  onDeleteBox?: (box: StorageBoxSummary) => void;
  onSelectComponent: (comp: ComponentItem | BoxComponentDetail) => void;
  onBoxUpdated?: () => void;
  onBackToList?: () => void;
}

export const BoxWorkspace: React.FC<BoxWorkspaceProps> = ({
  box,
  hasAnyBox = true,
  onCreateBox,
  onOpenDetailDrawer,
  onConfigEdit,
  onOpenLabelPrint,
  onDeleteBox,
  onSelectComponent,
  onBoxUpdated,
  onBackToList,
}) => {
  const { showToast } = useToastStore();
  const { setEntryDrawerOpen } = useInventoryStore();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BoxGridResponseData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // 交互状态
  const [inspectSlot, setInspectSlot] = useState<BoxGridSlot | null>(null);
  const [assignTargetSlot, setAssignTargetSlot] = useState<string | null>(null);
  const [assigningComp, setAssigningComp] = useState<BoxComponentDetail | null>(null);

  // 空格入料：全库检索状态
  const [allCompsSearch, setAllCompsSearch] = useState('');
  const [allCompsLoading, setAllCompsLoading] = useState(false);
  const [allCompsResults, setAllCompsResults] = useState<ComponentItem[]>([]);

  // 散料托盘折叠
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(true);

  // 库存微调 loading
  const [adjustingStock, setAdjustingStock] = useState(false);

  // 加载网格数据
  const fetchGridData = async (page: number = currentPage) => {
    if (!box?.name) return;
    setLoading(true);
    try {
      const res = await boxApi.getBoxGrid(box.name, page);
      if (res.success && res.data) {
        setData(res.data);
        // 如果当前正在巡检某格，保持数据最新
        if (inspectSlot) {
          const updatedSlot = res.data.grid.find((s) => s.slot === inspectSlot.slot);
          if (updatedSlot && updatedSlot.isOccupied) {
            setInspectSlot(updatedSlot);
          } else {
            setInspectSlot(null);
          }
        }
      } else {
        showToast('加载网格数据失败', 'error');
      }
    } catch (err: any) {
      showToast('加载网格异常: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (box?.name) {
      setCurrentPage(1);
      setSearchQuery('');
      setInspectSlot(null);
      setAssignTargetSlot(null);
      setAssigningComp(null);
      setAllCompsSearch('');
      setAllCompsResults([]);
      fetchGridData(1);
    }
  }, [box?.name, box?.rows, box?.cols, box?.pages]);

  useEffect(() => {
    const handleGlobalDataChanged = () => {
      fetchGridData(currentPage);
    };
    window.addEventListener('GLOBAL_INVENTORY_DATA_CHANGED', handleGlobalDataChanged);
    return () => window.removeEventListener('GLOBAL_INVENTORY_DATA_CHANGED', handleGlobalDataChanged);
  }, [box?.name, currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    setInspectSlot(null);
    setAssignTargetSlot(null);
    fetchGridData(newPage);
  };

  // 分配物料入格
  const handleAssignToSlot = async (
    slotName: string,
    comp: BoxComponentDetail | ComponentItem
  ) => {
    if (!box?.name) return;
    try {
      const res = await boxApi.assignSlot(comp.id, box.name, slotName);
      if (res.success) {
        showToast(`已放入抽屉格位 [${slotName}]`, 'success');
        setAssigningComp(null);
        setAssignTargetSlot(null);
        await fetchGridData(currentPage);
        if (onBoxUpdated) onBoxUpdated();
      } else {
        showToast('分配格位失败', 'error');
      }
    } catch (err: any) {
      showToast('分配格位异常: ' + err.message, 'error');
    }
  };

  // 移出格位
  const handleClearSlot = async (comp: BoxComponentDetail, keepInBox: boolean = true) => {
    try {
      const res = await boxApi.clearSlot(comp.id, keepInBox);
      if (res.success) {
        showToast(
          keepInBox ? `已移入盒内散料区` : `已彻底移出此收纳盒`,
          'success'
        );
        setInspectSlot(null);
        await fetchGridData(currentPage);
        if (onBoxUpdated) onBoxUpdated();
      } else {
        showToast('移出格位失败', 'error');
      }
    } catch (err: any) {
      showToast('操作异常: ' + err.message, 'error');
    }
  };

  // 就地微调抽屉内物料库存
  const handleAdjustQuantity = async (compId: number, delta: number) => {
    setAdjustingStock(true);
    try {
      const res = await componentApi.adjustQuantity(compId, delta);
      if (res.success) {
        showToast(`库存已更新为 ${res.data.quantity} 件`, 'success');
        await fetchGridData(currentPage);
        if (onBoxUpdated) onBoxUpdated();
      }
    } catch (err: any) {
      showToast('库存调整失败: ' + err.message, 'error');
    } finally {
      setAdjustingStock(false);
    }
  };

  // 全库物料检索
  const handleSearchAllComps = async (q: string) => {
    setAllCompsSearch(q);
    if (!q.trim()) {
      setAllCompsResults([]);
      return;
    }
    setAllCompsLoading(true);
    try {
      const res = await componentApi.getAll({ q: q.trim() });
      if (res.success && res.data) {
        setAllCompsResults(res.data.slice(0, 10));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAllCompsLoading(false);
    }
  };

  const gridSlots = data?.grid || [];
  const unassigned = data?.unassigned || [];
  const boxConfig = data?.box || box;

  // 搜索高亮索引
  const searchMatchMap = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const set = new Set<string>();
    for (const item of gridSlots) {
      if (
        item.slot.toLowerCase().includes(q) ||
        item.components.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.value && c.value.toLowerCase().includes(q)) ||
            (c.package && c.package.toLowerCase().includes(q)) ||
            (c.lcsc_part && c.lcsc_part.toLowerCase().includes(q))
        )
      ) {
        set.add(item.slot);
      }
    }
    return set;
  }, [gridSlots, searchQuery]);

  const cols = boxConfig?.cols || 6;
  const rows = boxConfig?.rows || 4;
  const totalSlots = gridSlots.length;
  const occupiedSlots = gridSlots.filter((s) => s.isOccupied).length;
  const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  if (!box) {
    if (!hasAnyBox) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center text-text-muted border border-border-subtle rounded-md bg-canvas">
          <Layers className="w-14 h-14 text-border-hover mb-3 opacity-60" />
          <h3 className="text-base font-bold text-text-main">系统暂无物理收纳容器</h3>
          <p className="text-xs sm:text-sm text-text-muted mt-1.5 max-w-sm mb-4">
            创建您的第一个 2D 亚克力网格抽屉、阻容样品本或散料盒，开启物理网格化库位管理。
          </p>
          {onCreateBox && (
            <button
              type="button"
              onClick={onCreateBox}
              className="px-4 py-2 bg-accent hover:bg-accent/90 text-white font-bold text-xs rounded-[2px] transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>新建首个收纳容器</span>
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-text-muted border border-border-subtle rounded-md bg-canvas">
        <Layers className="w-14 h-14 text-border-hover mb-3 opacity-60" />
        <h3 className="text-base font-bold text-text-main">请在左侧选择一个物理收纳容器</h3>
        <p className="text-xs sm:text-sm text-text-muted mt-1.5 max-w-sm">
          点击左侧零件箱、样品册或随手盒，即可在主工作台展开 2D 亚克力透视阵列与巡检抽屉。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas border-[1.5px] border-border-subtle rounded-md overflow-hidden relative">
      {/* 1. 顶部工业控制台工具栏 (大字号、高对比度、硬朗线条) */}
      <div className="px-4 py-3 bg-surface border-b-[1.5px] border-border-subtle flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* 左侧：返回按键(移动端) + 容器标识 + 规格 */}
        <div className="flex items-center gap-3 min-w-0">
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="md:hidden p-2 hover:bg-subtle rounded text-text-muted hover:text-text-main border-[1.5px] border-border-subtle"
              title="返回收纳盒列表"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.2]" />
            </button>
          )}

          {/* 物理色标 (加宽加厚) */}
          <span
            className="w-3.5 h-8.5 rounded-[2px] shrink-0 shadow-2xs"
            style={{ backgroundColor: boxConfig?.color || '#3B82F6' }}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                onClick={() => onOpenDetailDrawer && box && onOpenDetailDrawer(box)}
                className="font-black text-base sm:text-lg text-text-main truncate tracking-tight cursor-pointer hover:text-accent transition-colors"
                title="点击查看收纳盒详情档案与全量物料清单"
              >
                {boxConfig?.name}
              </h2>
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded-[2px] bg-subtle text-text-muted border border-border-subtle shrink-0">
                {boxConfig?.box_type === 'BOOK'
                  ? `样品本 · P${currentPage}/${data?.totalPages || boxConfig.pages || 1}`
                  : boxConfig?.box_type === 'BIN'
                  ? '随手盒 · 散料仓'
                  : `${rows}R × ${cols}C (${totalSlots}格)`}
              </span>
            </div>

            {/* 容量饱和度高对比度标尺 (随手盒展示物料总量) */}
            <div className="flex items-center gap-2.5 text-xs text-text-muted mt-1 font-mono font-bold">
              {boxConfig?.box_type === 'BIN' ? (
                <span>
                  在库散料: <strong className="text-text-main font-black">{unassigned.length}</strong> 种 (
                  {unassigned.reduce((s, i) => s + (i.quantity || 0), 0)} 件)
                </span>
              ) : (
                <>
                  <span>
                    已占用 <strong className="text-text-main font-black">{occupiedSlots}</strong> / {totalSlots} 格
                  </span>
                  <div className="w-24 h-2.5 bg-subtle rounded-full overflow-hidden border border-border-subtle">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${occupancyRate}%` }}
                    />
                  </div>
                  <span className="text-accent font-black">{occupancyRate}%</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 中间/右侧：样品本翻页 + 搜索框 + 动作工具栏 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 样品本翻页器 */}
          {boxConfig?.box_type === 'BOOK' && (
            <div className="flex items-center bg-canvas border border-border-subtle rounded-[2px] p-0.5 font-mono text-xs">
              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() => handlePageChange(currentPage - 1)}
                className="p-1.5 hover:bg-subtle text-text-muted hover:text-text-main disabled:opacity-30 rounded-[2px]"
                title="上一页"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 font-bold text-text-main text-xs">
                P{String(currentPage).padStart(2, '0')} / {String(data?.totalPages || 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                disabled={currentPage >= (data?.totalPages || 1) || loading}
                onClick={() => handlePageChange(currentPage + 1)}
                className="p-1.5 hover:bg-subtle text-text-muted hover:text-text-main disabled:opacity-30 rounded-[2px]"
                title="下一页"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 格内即时搜索与高亮框 (加宽大字号) */}
          <div className="relative w-56 sm:w-64">
            <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索阻容/编号/格号..."
              className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm font-mono bg-canvas border border-border-subtle rounded-[2px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* ＋ 存入物料 主操作 */}
          <button
            type="button"
            onClick={() => setEntryDrawerOpen(true, boxConfig?.name)}
            className="px-2.5 py-1.5 text-xs font-black bg-accent text-white hover:bg-accent/90 rounded-[2px] transition-colors shadow-2xs flex items-center gap-1 shrink-0"
            title={`录入元器件并存放到【${boxConfig?.name}】`}
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>存入物料</span>
          </button>

          {/* 刷新 */}
          <button
            onClick={() => fetchGridData(currentPage)}
            disabled={loading}
            className="p-2 hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
            title="刷新当前收纳盒网格数据"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* 查看收纳盒详情档案与物料明细清单 */}
          {onOpenDetailDrawer && box && (
            <button
              type="button"
              onClick={() => onOpenDetailDrawer(box)}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold bg-subtle hover:bg-surface border border-border-subtle hover:border-border-hover text-text-main rounded-[2px] transition-colors flex items-center gap-1.5"
              title="查看该收纳盒详情档案与盒内全量物料明细清单"
            >
              <FileText className="w-4 h-4 text-accent" />
              <span>盒内清单</span>
            </button>
          )}

          {/* 标签打印 */}
          <button
            onClick={() => onOpenLabelPrint(box)}
            className="px-3 py-1.5 text-xs sm:text-sm font-semibold bg-accent/10 hover:bg-accent hover:text-white text-accent border border-accent/20 rounded-[2px] transition-colors flex items-center gap-1.5"
            title="生成物理标签纸与二维码"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">打印标签</span>
          </button>

          {/* 规格配置 */}
          <button
            onClick={() => onConfigEdit(box)}
            className="px-3 py-1.5 text-xs sm:text-sm font-medium text-text-muted hover:text-text-main hover:bg-subtle border border-border-subtle rounded-[2px] transition-colors flex items-center gap-1.5"
            title="修改收纳盒尺寸与参数"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">配置</span>
          </button>

          {/* 删除收纳盒 */}
          {onDeleteBox && box && (
            <button
              onClick={() => onDeleteBox(box)}
              className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-danger hover:bg-danger/10 border border-danger/20 rounded-[2px] transition-colors flex items-center gap-1.5"
              title={`彻底删除收纳盒【${box.name}】`}
            >
              <Trash2 className="w-4 h-4 stroke-[2.2]" />
              <span className="hidden sm:inline">删除</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. 状态提示条：正在散料划入格位 */}
      {assigningComp && (
        <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/30 flex items-center justify-between text-xs sm:text-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-text-main truncate">
              正在安置【<strong className="text-emerald-600 dark:text-emerald-400 font-bold">{assigningComp.name}</strong>】：
              请在下方网格中点击任意<strong className="underline ml-1 font-bold">空白抽屉</strong>放置
            </span>
          </div>
          <button
            onClick={() => setAssigningComp(null)}
            className="px-2.5 py-1 text-xs text-text-muted hover:text-danger border border-border-subtle rounded-[2px] bg-surface shrink-0 ml-2 font-medium"
          >
            取消放置
          </button>
        </div>
      )}

      {/* 3. 工作台工作区：随手盒物料仓 / 2D 亚克力网格矩阵 + 右侧就地巡检抽屉面板 */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {boxConfig?.box_type === 'BIN' ? (
          /* 随手盒专属：散料仓卡片流视图 */
          <div className="flex-1 overflow-auto p-4 flex flex-col">
            {unassigned.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted bg-canvas rounded-md border border-dashed border-border-subtle my-auto">
                <div className="w-12 h-12 rounded-full bg-subtle flex items-center justify-center mb-3 text-text-muted border border-border-subtle">
                  <Archive className="w-6 h-6 text-accent stroke-[2]" />
                </div>
                <h3 className="text-base font-black text-text-main">随手盒当前暂无元器件</h3>
                <p className="text-xs sm:text-sm text-text-muted mt-1.5 max-w-sm mb-4">
                  随手盒适用于存放无特定行列网格的散装器件、静电袋或自封袋物料。
                </p>
                <button
                  type="button"
                  onClick={() => setEntryDrawerOpen(true, boxConfig?.name)}
                  className="px-4 py-2 bg-accent hover:bg-accent/90 text-white font-black text-xs rounded-[2px] transition-colors shadow-2xs flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>＋ 录入元器件到此随手盒</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-text-muted pb-1 border-b border-border-subtle">
                  <span>盒内散料物料清单 ({unassigned.length} 种)</span>
                  <div className="flex items-center gap-3">
                    {onOpenDetailDrawer && box && (
                      <button
                        type="button"
                        onClick={() => onOpenDetailDrawer(box)}
                        className="text-text-muted hover:text-text-main flex items-center gap-1 font-semibold"
                        title="打开收纳盒档案与完整物料清单表格"
                      >
                        <FileText className="w-3.5 h-3.5 text-accent" />
                        <span>表格明细</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEntryDrawerOpen(true, boxConfig?.name)}
                      className="text-accent hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>继续存入</span>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {unassigned.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onSelectComponent(item)}
                      className="p-3 bg-surface hover:bg-subtle/70 rounded-[2px] border border-border-subtle hover:border-accent cursor-pointer transition-colors flex flex-col justify-between group select-none shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[11px] font-mono font-bold px-1.5 py-0.2 bg-subtle text-text-muted rounded-[2px] border border-border-subtle">
                            {item.category}
                          </span>
                          <span className="text-sm font-black font-mono text-text-main">
                            {item.quantity} 件
                          </span>
                        </div>
                        <h4 className="text-xs font-black text-text-main group-hover:text-accent truncate">
                          {item.name}
                        </h4>
                        <div className="text-[11px] font-mono text-text-muted truncate mt-0.5">
                          {item.package || '-'} · {item.value || '-'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 网格柜与样品本：2D 亚克力网格阵列 */
          <div className="flex-1 overflow-auto p-4 flex flex-col justify-between">
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] flex items-center justify-center z-20">
                  <div className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle rounded shadow-xs text-xs sm:text-sm text-text-main font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                    <span>正在投射亚克力矩阵...</span>
                  </div>
                </div>
              )}

              {/* 亚克力物理抽屉网格 */}
              <div
                className="grid gap-2.5 transition-all pb-4"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(155px, 1fr))`,
                }}
              >
                {gridSlots.map((slotItem) => {
                  const isSelected =
                    inspectSlot?.slot === slotItem.slot || assignTargetSlot === slotItem.slot;
                  const isSearchMatch = searchMatchMap ? searchMatchMap.has(slotItem.slot) : false;
                  const isSearchDimmed = searchMatchMap !== null && !isSearchMatch;
                  const isAssignTarget = !!assigningComp && !slotItem.isOccupied;

                  return (
                    <AcrylicDrawerCell
                      key={slotItem.slot}
                      slotItem={slotItem}
                      isSelected={isSelected}
                      isSearchMatch={isSearchMatch}
                      isSearchDimmed={isSearchDimmed}
                      isAssignTarget={isAssignTarget}
                      onClick={() => {
                        if (assigningComp) {
                          if (!slotItem.isOccupied) {
                            handleAssignToSlot(slotItem.slot, assigningComp);
                          } else {
                            showToast(`抽屉 [${slotItem.slot}] 已被占用`, 'info');
                          }
                        } else if (slotItem.isOccupied) {
                          setAssignTargetSlot(null);
                          setInspectSlot(slotItem);
                        } else {
                          setInspectSlot(null);
                          setAssignTargetSlot(slotItem.slot);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 右侧：就地抽屉面板 (Inspector & Inbound Panel) - 宽度加大至 380px，字号大更清晰 */}
        {(inspectSlot || assignTargetSlot) && (
          <div className="w-88 md:w-96 border-l-[1.5px] border-border-subtle bg-surface flex flex-col shrink-0 z-10 animate-in slide-in-from-right duration-200 shadow-md">
            {/* A. 抽屉维护面板 (点击已占抽屉) */}
            {inspectSlot && inspectSlot.components[0] && (
              <>
                <div className="p-3.5 border-b-[1.5px] border-border-subtle flex items-center justify-between bg-canvas/60">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black px-2.5 py-0.5 bg-accent/15 text-accent border border-accent/30 rounded-[2px]">
                      {inspectSlot.slot}
                    </span>
                    <span className="font-black text-sm text-text-main">抽屉物理巡检</span>
                  </div>
                  <button
                    onClick={() => setInspectSlot(null)}
                    className="p-1.5 text-text-muted hover:text-text-main rounded hover:bg-subtle"
                    title="关闭巡检面板"
                  >
                    <X className="w-4 h-4 stroke-[2.2]" />
                  </button>
                </div>

                <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs sm:text-sm">
                  {(() => {
                    const comp = inspectSlot.components[0];
                    return (
                      <>
                        {/* 物料主要信息卡 */}
                        <div className="p-3.5 bg-canvas border-[1.5px] border-border-subtle rounded-[2px] space-y-2.5">
                          <div>
                            <span className="text-xs text-text-muted font-mono font-bold">{comp.category}</span>
                            <h3 className="font-black text-base text-text-main leading-snug mt-0.5">
                              {comp.name}
                            </h3>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-subtle font-mono text-xs">
                            {comp.value && (
                              <div>
                                <span className="text-[11px] text-text-muted font-bold block">规格参数:</span>
                                <span className="font-black text-text-main text-sm">{comp.value}</span>
                              </div>
                            )}
                            {comp.package && (
                              <div>
                                <span className="text-[11px] text-text-muted font-bold block">封装形式:</span>
                                <span className="text-text-main font-bold">{comp.package}</span>
                              </div>
                            )}
                          </div>

                          {comp.lcsc_part && (
                            <div className="pt-2 border-t border-border-subtle text-xs font-mono">
                              <span className="text-[11px] text-text-muted font-bold block">立创编号:</span>
                              <span className="font-black text-accent text-sm">{comp.lcsc_part}</span>
                            </div>
                          )}

                          {comp.notes && (
                            <div className="pt-2 border-t border-border-subtle text-xs text-text-muted">
                              <span className="block font-bold">备注:</span>
                              <p className="mt-1 text-text-main bg-surface p-2 rounded-[2px] border border-border-subtle font-medium">
                                {comp.notes}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* 就地库存快速步进微调器 (大字号、粗按键) */}
                        <div className="p-3.5 bg-canvas border-[1.5px] border-border-subtle rounded-[2px] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-black text-text-main">抽屉内现存数量</span>
                            <div className="font-mono text-xl font-black text-accent">
                              {comp.quantity} <span className="text-xs font-bold text-text-muted">件</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 pt-1">
                            <button
                              disabled={adjustingStock || comp.quantity < 10}
                              onClick={() => handleAdjustQuantity(comp.id, -10)}
                              className="py-2.5 bg-surface hover:bg-subtle text-text-main border-[1.5px] border-border-subtle rounded-[2px] font-mono text-xs sm:text-sm font-black disabled:opacity-30 shadow-2xs"
                              title="减少 10 件"
                            >
                              -10
                            </button>
                            <button
                              disabled={adjustingStock || comp.quantity < 1}
                              onClick={() => handleAdjustQuantity(comp.id, -1)}
                              className="py-2.5 bg-surface hover:bg-subtle text-text-main border-[1.5px] border-border-subtle rounded-[2px] font-mono text-xs sm:text-sm font-black disabled:opacity-30 shadow-2xs"
                              title="减少 1 件"
                            >
                              -1
                            </button>
                            <button
                              disabled={adjustingStock}
                              onClick={() => handleAdjustQuantity(comp.id, 1)}
                              className="py-2.5 bg-surface hover:bg-subtle text-text-main border-[1.5px] border-border-subtle rounded-[2px] font-mono text-xs sm:text-sm font-black shadow-2xs"
                              title="增加 1 件"
                            >
                              +1
                            </button>
                            <button
                              disabled={adjustingStock}
                              onClick={() => handleAdjustQuantity(comp.id, 10)}
                              className="py-2.5 bg-surface hover:bg-subtle text-text-main border-[1.5px] border-border-subtle rounded-[2px] font-mono text-xs sm:text-sm font-black shadow-2xs"
                              title="增加 10 件"
                            >
                              +10
                            </button>
                          </div>
                        </div>

                        {/* 查看元器件全生命周期档案 */}
                        <button
                          onClick={() => onSelectComponent(comp)}
                          className="w-full py-2.5 px-3 bg-accent/10 hover:bg-accent hover:text-white text-accent font-bold rounded-[2px] border border-accent/20 flex items-center justify-center gap-2 transition-colors text-xs sm:text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>查看元器件全生命周期档案</span>
                        </button>

                        {/* 移位与清理操作 */}
                        <div className="pt-2 border-t border-border-subtle space-y-2">
                          <button
                            onClick={() => handleClearSlot(comp, true)}
                            className="w-full py-2 px-2.5 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors text-center text-xs font-medium"
                            title="从当前格子取出，保留在此收纳盒的散料池中"
                          >
                            移入盒内散料区
                          </button>
                          <button
                            onClick={() => handleClearSlot(comp, false)}
                            className="w-full py-2 px-2.5 text-danger hover:bg-danger/10 border border-danger/30 rounded-[2px] transition-colors text-center flex items-center justify-center gap-1.5 text-xs font-medium"
                            title="彻底移出此收纳盒"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>彻底移出此收纳盒</span>
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {/* B. 空抽屉入料面板 (点击空抽屉) */}
            {assignTargetSlot && (
              <>
                <div className="p-3.5 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-[2px]">
                      {assignTargetSlot}
                    </span>
                    <span className="font-bold text-sm text-text-main">抽屉物料存入</span>
                  </div>
                  <button
                    onClick={() => setAssignTargetSlot(null)}
                    className="p-1.5 text-text-muted hover:text-text-main rounded hover:bg-subtle"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs sm:text-sm">
                  {/* 方式 1：从本盒散料安置 */}
                  {unassigned.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-bold text-text-main flex items-center gap-1.5 text-xs sm:text-sm">
                        <Inbox className="w-4 h-4 text-accent" />
                        <span>快捷安置：从本盒待划散料挑选</span>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto border border-border-subtle rounded-[2px] p-1.5 bg-canvas">
                        {unassigned.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleAssignToSlot(assignTargetSlot, u)}
                            className="w-full p-2.5 text-left bg-surface hover:bg-accent/10 rounded-[2px] border border-border-subtle flex items-center justify-between transition-colors group"
                          >
                            <div className="min-w-0 pr-1">
                              <div className="font-bold text-text-main truncate group-hover:text-accent text-xs sm:text-sm">
                                {u.name}
                              </div>
                              <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                                {u.package} {u.value} · {u.quantity}件
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 方式 2：全库物料检索放入 */}
                  <div className="space-y-2">
                    <div className="font-bold text-text-main flex items-center gap-1.5 text-xs sm:text-sm">
                      <Search className="w-4 h-4 text-accent" />
                      <span>从工坊全库检索物料存入</span>
                    </div>
                    <input
                      type="text"
                      value={allCompsSearch}
                      onChange={(e) => handleSearchAllComps(e.target.value)}
                      placeholder="搜索阻容/型号/LCSC..."
                      className="w-full px-3 py-2 font-mono text-xs sm:text-sm bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent"
                    />

                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {allCompsLoading ? (
                        <div className="text-center py-4 text-text-muted text-xs">
                          正在检索工坊物料...
                        </div>
                      ) : allCompsResults.length === 0 ? (
                        allCompsSearch ? (
                          <div className="text-center py-4 text-text-muted text-xs">
                            未找到匹配物料
                          </div>
                        ) : null
                      ) : (
                        allCompsResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleAssignToSlot(assignTargetSlot, c)}
                            className="w-full p-2.5 text-left bg-surface hover:bg-accent/10 rounded-[2px] border border-border-subtle flex items-center justify-between transition-colors group"
                          >
                            <div className="min-w-0 pr-1">
                              <div className="font-bold text-text-main truncate group-hover:text-accent text-xs sm:text-sm">
                                {c.name}
                              </div>
                              <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                                {c.category} · {c.package} · {c.quantity}件
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 4. 底部待分配散料托盘 (Unassigned Tray - 仅网格柜与样品本需要划格) */}
      {boxConfig?.box_type !== 'BIN' && (
        <div className="border-t border-border-subtle bg-surface shrink-0">
          <button
            onClick={() => setIsUnassignedOpen(!isUnassignedOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-subtle/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-accent" />
              <span className="text-xs sm:text-sm font-bold text-text-main">
                盒内待划格散料区 ({unassigned.length} 种)
              </span>
              <span className="text-xs text-text-muted hidden sm:inline">
                (存放于此盒但尚未分配具体抽屉坐标的散料)
              </span>
            </div>

            <div className="flex items-center gap-1 text-text-muted text-xs sm:text-sm font-medium">
              <span>{isUnassignedOpen ? '收起' : '展开'}</span>
              {isUnassignedOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </button>

          {isUnassignedOpen && (
            <div className="px-4 pb-3.5 pt-1 border-t border-border-subtle/40 bg-canvas/50">
              {unassigned.length === 0 ? (
                <div className="py-3 text-center text-xs sm:text-sm text-text-muted font-mono">
                  ✓ 极佳！当前收纳盒内所有物料均已定位到具体抽屉网格，零散料堆积
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-40 overflow-y-auto pr-1">
                  {unassigned.map((item) => {
                    const isBeingAssigned = assigningComp?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-[2px] border flex items-center justify-between gap-2.5 transition-all ${
                          isBeingAssigned
                            ? 'border-emerald-500 bg-emerald-500/15 ring-1 ring-emerald-500'
                            : 'border-border-subtle bg-surface hover:border-border-hover'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-bold text-text-main truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-xs text-text-muted font-mono truncate mt-0.5">
                            {item.package || '-'} · {item.value || '-'} · {item.quantity}件
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (isBeingAssigned) {
                              setAssigningComp(null);
                            } else {
                              setAssigningComp(item);
                              showToast(`已选中【${item.name}】，请在上方网格中点击空格放置`, 'info');
                            }
                          }}
                          className={`px-2.5 py-1.5 text-xs rounded-[2px] font-mono font-bold transition-all flex items-center gap-1 shrink-0 ${
                            isBeingAssigned
                              ? 'bg-emerald-600 text-white'
                              : 'bg-subtle hover:bg-accent hover:text-white text-text-main border border-border-subtle'
                          }`}
                        >
                          <span>{isBeingAssigned ? '放置中' : '划入格位'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

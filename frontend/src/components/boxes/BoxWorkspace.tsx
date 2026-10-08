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
  ExternalLink,
  Inbox,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Minus,
} from 'lucide-react';

interface BoxWorkspaceProps {
  box: StorageBoxSummary | null;
  onConfigEdit: (box: StorageBoxSummary) => void;
  onOpenLabelPrint: (box: StorageBoxSummary) => void;
  onSelectComponent: (comp: ComponentItem | BoxComponentDetail) => void;
  onBoxUpdated?: () => void;
  onBackToList?: () => void;
}

export const BoxWorkspace: React.FC<BoxWorkspaceProps> = ({
  box,
  onConfigEdit,
  onOpenLabelPrint,
  onSelectComponent,
  onBoxUpdated,
  onBackToList,
}) => {
  const { showToast } = useToastStore();

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
        showToast(`库存已调整为 ${res.data.quantity}`, 'success');
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
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-text-dim border border-border-subtle rounded-md bg-canvas">
        <Layers className="w-12 h-12 text-border-hover mb-3 opacity-60" />
        <h3 className="text-sm font-bold text-text-muted">请在左侧选择一个物理收纳容器</h3>
        <p className="text-xs text-text-dim mt-1 max-w-sm">
          点击左侧零件箱、样品册或随手盒，即可在主工作台展开 2D 亚克力透视阵列与巡检抽屉。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas border border-border-subtle rounded-md overflow-hidden relative">
      {/* 1. 顶部工业控制台工具栏 */}
      <div className="px-4 py-2.5 bg-surface border-b border-border-subtle flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* 左侧：返回按键(移动端) + 容器标识 + 规格 */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onBackToList && (
            <button
              onClick={onBackToList}
              className="md:hidden p-1.5 hover:bg-subtle rounded text-text-dim hover:text-text-main border border-border-subtle"
              title="返回收纳盒列表"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          {/* 物理色标 */}
          <span
            className="w-2.5 h-7 rounded-[2px] shrink-0"
            style={{ backgroundColor: boxConfig?.color || '#3B82F6' }}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-text-main truncate tracking-tight">
                {boxConfig?.name}
              </h2>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-subtle text-text-muted border border-border-subtle/80 shrink-0">
                {boxConfig?.box_type === 'BOOK'
                  ? `样品本 · P${currentPage}/${data?.totalPages || boxConfig.pages || 1}`
                  : `${rows}R × ${cols}C (${totalSlots}格)`}
              </span>
            </div>

            {/* 容量饱和度细线指示 */}
            <div className="flex items-center gap-2 text-[10px] text-text-dim mt-0.5">
              <span>
                占用 <strong className="font-mono text-text-main">{occupiedSlots}</strong> / {totalSlots}
              </span>
              <div className="w-16 h-1.5 bg-subtle rounded-full overflow-hidden border border-border-subtle/50">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
              <span className="font-mono text-accent font-semibold">{occupancyRate}%</span>
            </div>
          </div>
        </div>

        {/* 中间/右侧：样品本翻页 + 搜索框 + 动作工具栏 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 样品本翻页器 */}
          {boxConfig?.box_type === 'BOOK' && (
            <div className="flex items-center bg-canvas border border-border-subtle rounded-[2px] p-0.5 font-mono text-xs">
              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() => handlePageChange(currentPage - 1)}
                className="p-1 hover:bg-subtle text-text-muted hover:text-text-main disabled:opacity-30 rounded-[2px]"
                title="上一页"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-bold text-text-main text-[11px]">
                P{String(currentPage).padStart(2, '0')} / {String(data?.totalPages || 1).padStart(2, '0')}
              </span>
              <button
                type="button"
                disabled={currentPage >= (data?.totalPages || 1) || loading}
                onClick={() => handlePageChange(currentPage + 1)}
                className="p-1 hover:bg-subtle text-text-muted hover:text-text-main disabled:opacity-30 rounded-[2px]"
                title="下一页"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 格内即时搜索与高亮框 */}
          <div className="relative w-48 sm:w-56">
            <Search className="w-3.5 h-3.5 text-text-dim absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索阻容/编号/格号..."
              className="w-full pl-7 pr-6 py-1 text-xs font-mono bg-canvas border border-border-subtle rounded-[2px] text-text-main placeholder:text-text-dim/60 focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* 刷新 */}
          <button
            onClick={() => fetchGridData(currentPage)}
            disabled={loading}
            className="p-1.5 hover:bg-subtle text-text-dim hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
            title="刷新当前收纳盒网格数据"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* 标签打印 */}
          <button
            onClick={() => onOpenLabelPrint(box)}
            className="px-2.5 py-1 text-xs font-medium bg-accent/10 hover:bg-accent hover:text-white text-accent border border-accent/20 rounded-[2px] transition-colors flex items-center gap-1"
            title="生成物理标签纸与二维码"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">打印标签</span>
          </button>

          {/* 规格配置 */}
          <button
            onClick={() => onConfigEdit(box)}
            className="px-2 py-1 text-xs text-text-dim hover:text-text-main hover:bg-subtle border border-border-subtle rounded-[2px] transition-colors flex items-center gap-1"
            title="修改收纳盒尺寸与参数"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">配置</span>
          </button>
        </div>
      </div>

      {/* 2. 状态提示条：正在散料划入格位 */}
      {assigningComp && (
        <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/30 flex items-center justify-between text-xs animate-pulse shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-text-main truncate">
              正在安置【<strong className="text-emerald-600 dark:text-emerald-400 font-bold">{assigningComp.name}</strong>】：
              请在下方网格中点击任意<strong className="underline ml-1">空白抽屉</strong>放置
            </span>
          </div>
          <button
            onClick={() => setAssigningComp(null)}
            className="px-2 py-0.5 text-xs text-text-dim hover:text-danger border border-border-subtle rounded-[2px] bg-surface shrink-0 ml-2"
          >
            取消放置
          </button>
        </div>
      )}

      {/* 3. 工作台工作区：2D 亚克力网格矩阵 + 右侧就地巡检抽屉面板 */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* 左侧：2D 亚克力网格阵列 */}
        <div className="flex-1 overflow-auto p-4 flex flex-col justify-between">
          <div className="relative">
            {loading && (
              <div className="absolute inset-0 bg-surface/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle rounded shadow-xs text-xs text-text-muted">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                  <span>正在投射亚克力矩阵...</span>
                </div>
              </div>
            )}

            {/* 亚克力物理抽屉网格 */}
            <div
              className="grid gap-2 transition-all pb-4"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(130px, 1fr))`,
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

        {/* 右侧：就地抽屉面板 (Inspector & Inbound Panel) - 消除弹窗套弹窗 */}
        {(inspectSlot || assignTargetSlot) && (
          <div className="w-80 md:w-88 border-l border-border-subtle bg-surface flex flex-col shrink-0 z-10 animate-in slide-in-from-right duration-200 shadow-md">
            {/* A. 抽屉维护面板 (点击已占抽屉) */}
            {inspectSlot && inspectSlot.components[0] && (
              <>
                <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-[2px]">
                      {inspectSlot.slot}
                    </span>
                    <span className="font-semibold text-xs text-text-main">抽屉物理巡检</span>
                  </div>
                  <button
                    onClick={() => setInspectSlot(null)}
                    className="p-1 text-text-dim hover:text-text-main rounded hover:bg-subtle"
                    title="关闭巡检面板"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 p-3.5 space-y-4 overflow-y-auto text-xs">
                  {(() => {
                    const comp = inspectSlot.components[0];
                    return (
                      <>
                        {/* 物料主要信息卡 */}
                        <div className="p-3 bg-canvas border border-border-subtle rounded-[2px] space-y-2">
                          <div>
                            <span className="text-[10px] text-text-dim font-mono">{comp.category}</span>
                            <h3 className="font-bold text-sm text-text-main leading-tight mt-0.5">
                              {comp.name}
                            </h3>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border-subtle/50 font-mono text-[11px]">
                            {comp.value && (
                              <div>
                                <span className="text-[9px] text-text-dim block">规格参数:</span>
                                <span className="font-bold text-text-main">{comp.value}</span>
                              </div>
                            )}
                            {comp.package && (
                              <div>
                                <span className="text-[9px] text-text-dim block">封装形式:</span>
                                <span className="text-text-muted">{comp.package}</span>
                              </div>
                            )}
                          </div>

                          {comp.lcsc_part && (
                            <div className="pt-1 border-t border-border-subtle/50 text-[11px] font-mono">
                              <span className="text-[9px] text-text-dim block">立创编号:</span>
                              <span className="font-bold text-accent">{comp.lcsc_part}</span>
                            </div>
                          )}

                          {comp.notes && (
                            <div className="pt-1 border-t border-border-subtle/50 text-[10px] text-text-dim">
                              <span className="block text-text-dim/80">备注:</span>
                              <p className="mt-0.5 text-text-muted bg-surface p-1.5 rounded-[2px] border border-border-subtle">
                                {comp.notes}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* 就地库存快速步进微调器 */}
                        <div className="p-3 bg-canvas border border-border-subtle rounded-[2px] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-main">格内库存快速盘点</span>
                            <div className="font-mono text-base font-black text-accent">
                              {comp.quantity} <span className="text-[10px] font-normal text-text-dim">件</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1.5 pt-1">
                            <button
                              disabled={adjustingStock || comp.quantity < 10}
                              onClick={() => handleAdjustQuantity(comp.id, -10)}
                              className="py-1 bg-surface hover:bg-subtle text-text-main border border-border-subtle rounded-[2px] font-mono text-[11px] disabled:opacity-30"
                              title="减少 10 件"
                            >
                              -10
                            </button>
                            <button
                              disabled={adjustingStock || comp.quantity < 1}
                              onClick={() => handleAdjustQuantity(comp.id, -1)}
                              className="py-1 bg-surface hover:bg-subtle text-text-main border border-border-subtle rounded-[2px] font-mono text-[11px] disabled:opacity-30"
                              title="减少 1 件"
                            >
                              -1
                            </button>
                            <button
                              disabled={adjustingStock}
                              onClick={() => handleAdjustQuantity(comp.id, 1)}
                              className="py-1 bg-surface hover:bg-subtle text-text-main border border-border-subtle rounded-[2px] font-mono text-[11px]"
                              title="增加 1 件"
                            >
                              +1
                            </button>
                            <button
                              disabled={adjustingStock}
                              onClick={() => handleAdjustQuantity(comp.id, 10)}
                              className="py-1 bg-surface hover:bg-subtle text-text-main border border-border-subtle rounded-[2px] font-mono text-[11px]"
                              title="增加 10 件"
                            >
                              +10
                            </button>
                          </div>
                        </div>

                        {/* 查看元器件全生命周期档案 */}
                        <button
                          onClick={() => onSelectComponent(comp)}
                          className="w-full py-2 px-3 bg-accent/10 hover:bg-accent hover:text-white text-accent font-semibold rounded-[2px] border border-accent/20 flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>查看元器件全生命周期档案</span>
                        </button>

                        {/* 移位与清理操作 */}
                        <div className="pt-2 border-t border-border-subtle space-y-2">
                          <button
                            onClick={() => handleClearSlot(comp, true)}
                            className="w-full py-1.5 px-2 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors text-center"
                            title="从当前格子取出，保留在此收纳盒的散料池中"
                          >
                            移入盒内散料区
                          </button>
                          <button
                            onClick={() => handleClearSlot(comp, false)}
                            className="w-full py-1.5 px-2 text-danger hover:bg-danger/10 border border-danger/30 rounded-[2px] transition-colors text-center flex items-center justify-center gap-1"
                            title="彻底移出此收纳盒"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
                <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-[2px]">
                      {assignTargetSlot}
                    </span>
                    <span className="font-semibold text-xs text-text-main">抽屉物料存入</span>
                  </div>
                  <button
                    onClick={() => setAssignTargetSlot(null)}
                    className="p-1 text-text-dim hover:text-text-main rounded hover:bg-subtle"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 p-3.5 space-y-4 overflow-y-auto text-xs">
                  {/* 方式 1：从本盒散料安置 */}
                  {unassigned.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-text-main flex items-center gap-1 text-[11px]">
                        <Inbox className="w-3.5 h-3.5 text-accent" />
                        <span>快捷安置：从本盒待划散料挑选</span>
                      </div>
                      <div className="space-y-1 max-h-44 overflow-y-auto border border-border-subtle rounded-[2px] p-1 bg-canvas">
                        {unassigned.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleAssignToSlot(assignTargetSlot, u)}
                            className="w-full p-2 text-left bg-surface hover:bg-accent/10 rounded-[2px] border border-border-subtle flex items-center justify-between transition-colors group"
                          >
                            <div className="min-w-0 pr-1">
                              <div className="font-bold text-text-main truncate group-hover:text-accent">
                                {u.name}
                              </div>
                              <div className="text-[10px] text-text-dim font-mono truncate">
                                {u.package} {u.value} · {u.quantity}件
                              </div>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 方式 2：全库物料检索放入 */}
                  <div className="space-y-1.5">
                    <div className="font-semibold text-text-main flex items-center gap-1 text-[11px]">
                      <Search className="w-3.5 h-3.5 text-accent" />
                      <span>从工坊全库检索物料存入</span>
                    </div>
                    <input
                      type="text"
                      value={allCompsSearch}
                      onChange={(e) => handleSearchAllComps(e.target.value)}
                      placeholder="搜索阻容/型号/LCSC..."
                      className="w-full px-2.5 py-1.5 font-mono text-xs bg-canvas border border-border-subtle rounded-[2px] text-text-main focus:outline-none focus:border-accent"
                    />

                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {allCompsLoading ? (
                        <div className="text-center py-4 text-text-dim text-[11px]">
                          正在检索工坊物料...
                        </div>
                      ) : allCompsResults.length === 0 ? (
                        allCompsSearch ? (
                          <div className="text-center py-4 text-text-dim text-[11px]">
                            未找到匹配物料
                          </div>
                        ) : null
                      ) : (
                        allCompsResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleAssignToSlot(assignTargetSlot, c)}
                            className="w-full p-2 text-left bg-surface hover:bg-accent/10 rounded-[2px] border border-border-subtle flex items-center justify-between transition-colors group"
                          >
                            <div className="min-w-0 pr-1">
                              <div className="font-bold text-text-main truncate group-hover:text-accent">
                                {c.name}
                              </div>
                              <div className="text-[10px] text-text-dim font-mono truncate">
                                {c.category} · {c.package} · {c.quantity}件
                              </div>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
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

      {/* 4. 底部待分配散料托盘 (Unassigned Tray) */}
      <div className="border-t border-border-subtle bg-surface shrink-0">
        <button
          onClick={() => setIsUnassignedOpen(!isUnassignedOpen)}
          className="w-full px-4 py-2 flex items-center justify-between hover:bg-subtle/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Inbox className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-bold text-text-main">
              盒内待划格散料区 ({unassigned.length} 种)
            </span>
            <span className="text-[10px] text-text-dim hidden sm:inline">
              (存放于此盒但尚未分配具体抽屉坐标的散料)
            </span>
          </div>

          <div className="flex items-center gap-1 text-text-dim text-xs">
            <span>{isUnassignedOpen ? '收起' : '展开'}</span>
            {isUnassignedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </div>
        </button>

        {isUnassignedOpen && (
          <div className="px-4 pb-3 pt-1 border-t border-border-subtle/40 bg-canvas/50">
            {unassigned.length === 0 ? (
              <div className="py-2.5 text-center text-[11px] text-text-dim/80 font-mono">
                ✓ 极佳！当前收纳盒内所有物料均已定位到具体抽屉网格，零散料堆积
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
                {unassigned.map((item) => {
                  const isBeingAssigned = assigningComp?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`p-2 rounded-[2px] border flex items-center justify-between gap-2 transition-all ${
                        isBeingAssigned
                          ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                          : 'border-border-subtle bg-surface hover:border-border-hover'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-text-main truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] text-text-dim font-mono truncate">
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
                        className={`px-2 py-1 text-xs rounded-[2px] font-mono font-medium transition-all flex items-center gap-1 shrink-0 ${
                          isBeingAssigned
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-subtle hover:bg-accent hover:text-white text-text-main border border-border-subtle'
                        }`}
                      >
                        <span>{isBeingAssigned ? '放置中' : '划入格位'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

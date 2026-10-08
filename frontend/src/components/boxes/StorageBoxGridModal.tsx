import React, { useState, useEffect, useMemo } from 'react';
import {
  StorageBoxConfig,
  BoxGridResponseData,
  BoxGridSlot,
  BoxComponentDetail,
} from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { componentApi } from '../../api/componentApi';
import { ComponentItem } from '../../types/component';
import { useToastStore } from '../../store/useToastStore';
import { Modal } from '../ui/Modal';
import {
  Grid,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  ArrowRight,
  Trash2,
  ExternalLink,
  Layers,
  Inbox,
  Sparkles,
  RefreshCw,
  PackageCheck,
  Settings,
  HelpCircle,
} from 'lucide-react';

interface StorageBoxGridModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxSummary: StorageBoxConfig | null;
  onConfigEdit?: () => void;
  onSelectComponent?: (comp: ComponentItem) => void;
}

export const StorageBoxGridModal: React.FC<StorageBoxGridModalProps> = ({
  isOpen,
  onClose,
  boxSummary,
  onConfigEdit,
  onSelectComponent,
}) => {
  const { showToast } = useToastStore();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BoxGridResponseData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  // 待安置散料状态：当选中某散料准备放入格子时
  const [assigningComp, setAssigningComp] = useState<BoxComponentDetail | null>(null);

  // 点击空格入料弹窗
  const [selectedSlotForAdd, setSelectedSlotForAdd] = useState<string | null>(null);
  const [allCompsSearch, setAllCompsSearch] = useState('');
  const [allCompsLoading, setAllCompsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<ComponentItem[]>([]);

  // 选中某格查看详情面板
  const [inspectSlot, setInspectSlot] = useState<BoxGridSlot | null>(null);

  const fetchGridData = async (page: number = currentPage) => {
    if (!boxSummary?.name) return;
    setLoading(true);
    try {
      const res = await boxApi.getBoxGrid(boxSummary.name, page);
      if (res.success && res.data) {
        setData(res.data);
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
    if (isOpen && boxSummary) {
      setCurrentPage(1);
      setSearchQuery('');
      setAssigningComp(null);
      setSelectedSlotForAdd(null);
      setInspectSlot(null);
      fetchGridData(1);
    }
  }, [isOpen, boxSummary?.name]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    fetchGridData(newPage);
  };

  // 分配物料到指定格位
  const handleAssignToSlot = async (slotName: string, comp: BoxComponentDetail | ComponentItem) => {
    if (!boxSummary?.name) return;
    try {
      const res = await boxApi.assignSlot(comp.id, boxSummary.name, slotName);
      if (res.success) {
        showToast(`已成功将【${comp.name}】放入格位 ${slotName}`, 'success');
        setAssigningComp(null);
        setSelectedSlotForAdd(null);
        await fetchGridData(currentPage);
      } else {
        showToast('分配格位失败', 'error');
      }
    } catch (err: any) {
      showToast('分配格位异常: ' + err.message, 'error');
    }
  };

  // 从格位移除物料
  const handleClearSlot = async (comp: BoxComponentDetail, keepInBox: boolean = true) => {
    try {
      const res = await boxApi.clearSlot(comp.id, keepInBox);
      if (res.success) {
        showToast(
          keepInBox
            ? `已移出格位，保留在盒内散料区`
            : `已彻底从该收纳盒移除`,
          'success'
        );
        setInspectSlot(null);
        await fetchGridData(currentPage);
      } else {
        showToast('移出格位失败', 'error');
      }
    } catch (err: any) {
      showToast('操作异常: ' + err.message, 'error');
    }
  };

  // 全库搜索物料放入空格
  const handleSearchAllComponents = async (q: string) => {
    setAllCompsSearch(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setAllCompsLoading(true);
    try {
      const res = await componentApi.getAll({ q: q.trim() });
      if (res.success && res.data) {
        setSearchResults(res.data.slice(0, 10));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAllCompsLoading(false);
    }
  };

  const gridSlots = data?.grid || [];
  const unassigned = data?.unassigned || [];
  const boxConfig = data?.box || boxSummary;

  // 过滤高亮匹配
  const filteredSlotMap = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const map = new Set<string>();
    for (const item of gridSlots) {
      if (item.components.some((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.value && c.value.toLowerCase().includes(q)) ||
        (c.package && c.package.toLowerCase().includes(q)) ||
        item.slot.toLowerCase().includes(q)
      )) {
        map.add(item.slot);
      }
    }
    return map;
  }, [gridSlots, searchQuery]);

  // 计算行与列数
  const cols = boxConfig?.cols || 6;
  const rows = boxConfig?.rows || 4;
  const totalSlots = gridSlots.length;
  const occupiedSlots = gridSlots.filter((s) => s.isOccupied).length;
  const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full inline-block shadow-sm"
            style={{ backgroundColor: boxConfig?.color || '#3B82F6' }}
          />
          <span className="font-bold text-text-main text-base">
            {boxConfig?.name || '物理收纳盒'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-subtle text-text-muted border border-border-subtle font-mono">
            {boxConfig?.box_type === 'BOOK'
              ? `样品本 · 第 ${data?.page || 1}/${data?.totalPages || 1} 页`
              : `${rows}行 × ${cols}列 (${totalSlots}格)`}
          </span>
        </div>
      }
      maxWidth="max-w-6xl"
    >
      <div className="space-y-4">
        {/* 工具栏与状态指标 */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-canvas border border-border-subtle rounded-2xl">
          {/* 左侧：搜索与高亮 */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-text-dim absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索格内阻容/名称/封装 (例: 10k, 0805, B3)"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-border-subtle rounded-xl text-text-main focus:outline-none focus:border-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-dim hover:text-text-main"
                >
                  ✕
                </button>
              )}
            </div>

            {boxConfig?.box_type === 'BOOK' && (
              <div className="flex items-center gap-1 bg-surface border border-border-subtle rounded-xl px-1.5 py-1">
                <button
                  type="button"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="p-1 hover:bg-subtle rounded text-text-main disabled:opacity-30"
                  title="上一页"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono font-bold px-1 text-text-main">
                  P{String(currentPage).padStart(2, '0')} / {data?.totalPages || 1}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= (data?.totalPages || 1) || loading}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="p-1 hover:bg-subtle rounded text-text-main disabled:opacity-30"
                  title="下一页"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 右侧：统计与操作 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-dim">
                占用: <strong className="text-text-main font-mono">{occupiedSlots}</strong>/{totalSlots}
              </span>
              <div className="w-16 h-2 bg-subtle rounded-full overflow-hidden border border-border-subtle">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
              <span className="font-mono text-xs font-bold text-accent">{occupancyRate}%</span>
            </div>

            <button
              onClick={() => fetchGridData(currentPage)}
              disabled={loading}
              className="p-1.5 text-text-muted hover:text-text-main hover:bg-subtle rounded-xl border border-border-subtle transition-all"
              title="刷新网格"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {onConfigEdit && (
              <button
                onClick={onConfigEdit}
                className="px-2.5 py-1.5 text-xs text-text-muted hover:text-text-main hover:bg-subtle rounded-xl border border-border-subtle transition-all flex items-center gap-1"
                title="调整规格配置"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>规格配置</span>
              </button>
            )}
          </div>
        </div>

        {/* 正在分配格位的高亮提示条 */}
        {assigningComp && (
          <div className="p-3 bg-accent/10 border border-accent/30 rounded-2xl flex items-center justify-between text-xs animate-pulse">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="text-text-main">
                正在为【<strong className="text-accent">{assigningComp.name}</strong>】选择物理格位：
                请点击下方任意<strong className="underline ml-1">空白网格</strong>完成放置
              </span>
            </div>
            <button
              onClick={() => setAssigningComp(null)}
              className="text-xs text-text-muted hover:text-danger px-2 py-0.5 rounded-lg border border-border-subtle bg-surface"
            >
              取消分配
            </button>
          </div>
        )}

        {/* 2D 亚克力网格主体 */}
        <div className="relative border border-border-subtle rounded-2xl bg-canvas p-4 overflow-x-auto shadow-inner min-h-[380px]">
          {loading ? (
            <div className="absolute inset-0 bg-surface/50 backdrop-blur-xs flex items-center justify-center text-xs text-text-muted z-10">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                <span>正在投射亚克力零件网格...</span>
              </div>
            </div>
          ) : null}

          {/* 网格容器 */}
          <div
            className="grid gap-2.5 transition-all"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(135px, 1fr))`,
            }}
          >
            {gridSlots.map((slotItem) => {
              const comp = slotItem.components[0];
              const isMatch = filteredSlotMap ? filteredSlotMap.has(slotItem.slot) : false;
              const isDimmed = filteredSlotMap && !isMatch;
              const isAssignTarget = !!assigningComp && !slotItem.isOccupied;

              return (
                <div
                  key={slotItem.slot}
                  onClick={() => {
                    if (assigningComp) {
                      if (!slotItem.isOccupied) {
                        handleAssignToSlot(slotItem.slot, assigningComp);
                      } else {
                        showToast(`该格位 (${slotItem.slot}) 已被占用`, 'info');
                      }
                    } else if (slotItem.isOccupied) {
                      setInspectSlot(slotItem);
                    } else {
                      setSelectedSlotForAdd(slotItem.slot);
                    }
                  }}
                  className={`relative rounded-xl border p-2 flex flex-col justify-between transition-all cursor-pointer min-h-[96px] group select-none ${
                    slotItem.isOccupied
                      ? 'bg-surface border-border-subtle hover:border-accent hover:shadow-md'
                      : 'bg-surface/30 border-dashed border-border-subtle hover:border-accent/60 hover:bg-accent/5'
                  } ${
                    isMatch
                      ? 'ring-2 ring-accent border-accent bg-accent/5 shadow-md'
                      : ''
                  } ${isDimmed ? 'opacity-25' : ''} ${
                    isAssignTarget
                      ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/10 animate-bounce'
                      : ''
                  }`}
                >
                  {/* 顶部：格位标签与数量 */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        slotItem.isOccupied
                          ? 'bg-subtle text-text-muted border border-border-subtle'
                          : 'bg-canvas text-text-dim'
                      }`}
                    >
                      {slotItem.slot}
                    </span>

                    {comp ? (
                      <span className="text-[10px] font-mono font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                        {comp.quantity}件
                      </span>
                    ) : (
                      <span className="text-[9px] text-text-dim">空置</span>
                    )}
                  </div>

                  {/* 中间内容 */}
                  {comp ? (
                    <div className="my-1">
                      <div
                        className="text-xs font-bold text-text-main truncate group-hover:text-accent transition-colors"
                        title={comp.name}
                      >
                        {comp.name}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-text-dim mt-0.5 truncate">
                        {comp.package && (
                          <span className="bg-canvas px-1 py-0.2 rounded border border-border-subtle">
                            {comp.package}
                          </span>
                        )}
                        {comp.value && (
                          <span className="font-mono text-text-muted truncate">
                            {comp.value}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-text-dim py-1">
                      <Plus className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:text-accent transition-all group-hover:scale-125" />
                      <span className="text-[10px] opacity-40 group-hover:opacity-100 mt-0.5">
                        放入物料
                      </span>
                    </div>
                  )}

                  {/* 底部小标识 */}
                  {comp && (
                    <div className="flex items-center justify-between pt-1 border-t border-border-subtle/50 text-[9px] text-text-dim">
                      <span className="truncate max-w-[70px]">{comp.category}</span>
                      {comp.lcsc_part && (
                        <span className="font-mono text-accent/80 truncate">
                          {comp.lcsc_part}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部：待分配散料抽屉区 (Unassigned Pool) */}
        <div className="border border-border-subtle rounded-2xl bg-canvas p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold text-text-main">
                本盒待指定格位散料区 ({unassigned.length} 种)
              </span>
              <span className="text-[11px] text-text-muted">
                （物料当前存放于此盒，但尚未指定物理抽屉网格）
              </span>
            </div>
          </div>

          {unassigned.length === 0 ? (
            <div className="py-4 text-center text-xs text-text-dim bg-surface/50 rounded-xl border border-dashed border-border-subtle">
              🎉 极佳！当前收纳盒内所有物料均已定位到具体抽屉网格，零散料堆积
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
              {unassigned.map((item) => (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                    assigningComp?.id === item.id
                      ? 'border-accent bg-accent/10 ring-1 ring-accent'
                      : 'border-border-subtle bg-surface hover:border-border-hover'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-text-main truncate" title={item.name}>
                      {item.name}
                    </div>
                    <div className="text-[10px] text-text-dim truncate">
                      {item.package || '-'} · {item.value || '-'} · {item.quantity}件
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (assigningComp?.id === item.id) {
                        setAssigningComp(null);
                      } else {
                        setAssigningComp(item);
                        showToast(`已选中【${item.name}】，请在上方网格中点击空格放置`, 'info');
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 shrink-0 ${
                      assigningComp?.id === item.id
                        ? 'bg-accent text-white font-bold'
                        : 'bg-subtle hover:bg-accent hover:text-white text-text-main border border-border-subtle'
                    }`}
                  >
                    <span>{assigningComp?.id === item.id ? '选择中...' : '划入格位'}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 1：点击空格入料选择器 */}
      {selectedSlotForAdd && (
        <Modal
          isOpen={!!selectedSlotForAdd}
          onClose={() => setSelectedSlotForAdd(null)}
          title={`📥 放入物料至格位 [${selectedSlotForAdd}]`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            {/* 优先选项 A：从本盒散料直接挑选 */}
            {unassigned.length > 0 && (
              <div>
                <div className="text-xs font-bold text-text-main mb-1.5 flex items-center gap-1.5">
                  <Inbox className="w-3.5 h-3.5 text-accent" />
                  <span>快捷安置：从本盒待分配散料中挑选</span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border-subtle rounded-xl p-1.5 bg-canvas">
                  {unassigned.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAssignToSlot(selectedSlotForAdd, u)}
                      className="w-full p-2 text-left bg-surface hover:bg-subtle rounded-lg border border-border-subtle flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate">
                        <div className="font-bold text-text-main truncate">{u.name}</div>
                        <div className="text-[10px] text-text-dim">
                          {u.package} {u.value} · {u.quantity}件
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 选项 B：从工坊全库搜索任意物料 */}
            <div>
              <div className="text-xs font-bold text-text-main mb-1.5 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-accent" />
                <span>从全库检索物料放入</span>
              </div>
              <input
                type="text"
                value={allCompsSearch}
                onChange={(e) => handleSearchAllComponents(e.target.value)}
                placeholder="搜索名称、阻容、封装或LCSC编号..."
                className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-xl text-text-main focus:outline-none focus:border-accent"
              />

              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {allCompsLoading ? (
                  <div className="text-center py-4 text-xs text-text-dim">正在检索工坊物料...</div>
                ) : searchResults.length === 0 ? (
                  allCompsSearch ? (
                    <div className="text-center py-3 text-xs text-text-dim">未找到相关元器件</div>
                  ) : null
                ) : (
                  searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAssignToSlot(selectedSlotForAdd, c)}
                      className="w-full p-2 text-left bg-surface hover:bg-accent/10 hover:border-accent rounded-lg border border-border-subtle flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate">
                        <div className="font-bold text-text-main truncate">{c.name}</div>
                        <div className="text-[10px] text-text-dim">
                          {c.category} · {c.package} · {c.quantity}件 · 原位置:{' '}
                          {c.location || '未指定'}
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-accent shrink-0 ml-2" />
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-border-subtle flex justify-end">
              <button
                onClick={() => setSelectedSlotForAdd(null)}
                className="px-3.5 py-1.5 text-xs text-text-muted hover:bg-subtle rounded-xl"
              >
                取消
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 弹窗 2：点击已占格子查看与维护面板 */}
      {inspectSlot && inspectSlot.components[0] && (
        <Modal
          isOpen={!!inspectSlot}
          onClose={() => setInspectSlot(null)}
          title={`📍 格位详情: [${inspectSlot.slot}]`}
          maxWidth="max-w-md"
        >
          {(() => {
            const comp = inspectSlot.components[0];
            return (
              <div className="space-y-4 text-xs">
                {/* 物料卡片概览 */}
                <div className="p-3 bg-canvas border border-border-subtle rounded-xl space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-text-main">{comp.name}</h4>
                      <p className="text-[11px] text-text-dim mt-0.5">
                        {comp.category} · {comp.package || '通用规格'}
                      </p>
                    </div>
                    <span className="font-mono text-base font-black text-accent">
                      {comp.quantity}{' '}
                      <span className="text-[10px] font-normal text-text-dim">件</span>
                    </span>
                  </div>

                  {comp.value && (
                    <div className="flex items-center gap-1.5 text-text-muted">
                      <span className="text-text-dim">规格值:</span>
                      <strong className="font-mono text-text-main">{comp.value}</strong>
                    </div>
                  )}

                  {comp.lcsc_part && (
                    <div className="flex items-center gap-1.5 text-text-muted">
                      <span className="text-text-dim">立创编号:</span>
                      <strong className="font-mono text-accent">{comp.lcsc_part}</strong>
                    </div>
                  )}

                  {comp.notes && (
                    <div className="text-[11px] text-text-dim bg-surface p-2 rounded-lg border border-border-subtle">
                      📝 {comp.notes}
                    </div>
                  )}
                </div>

                {/* 操作按键 */}
                <div className="space-y-2">
                  {onSelectComponent && (
                    <button
                      onClick={() => {
                        onSelectComponent(comp as any);
                        setInspectSlot(null);
                        onClose();
                      }}
                      className="w-full py-2 px-3 bg-accent text-white hover:bg-accent-hover font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>查看元器件全生命周期档案</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleClearSlot(comp, true)}
                      className="py-1.5 px-2 bg-canvas hover:bg-subtle text-text-main border border-border-subtle rounded-xl transition-all text-center"
                      title="移出此网格，仍保留在该收纳盒的散料区"
                    >
                      移至盒内散料区
                    </button>
                    <button
                      onClick={() => handleClearSlot(comp, false)}
                      className="py-1.5 px-2 text-danger hover:bg-danger/10 border border-danger/30 rounded-xl transition-all text-center flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>完全移出此盒</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </Modal>
  );
};

import React, { useEffect, useState, useMemo } from 'react';
import { boxApi } from '../api/boxApi';
import { StorageBoxSummary, StorageBoxConfig, BoxType } from '../types/box';
import { useToastStore } from '../store/useToastStore';
import { useInventoryStore } from '../store/useInventoryStore';
import { StorageBoxConfigModal } from '../components/boxes/StorageBoxConfigModal';
import { StorageBoxLabelModal } from '../components/boxes/StorageBoxLabelModal';
import { BoxWorkspace } from '../components/boxes/BoxWorkspace';
import { ComponentDetailDrawer } from '../components/inventory/ComponentDetailDrawer';
import {
  Layers,
  Box,
  Plus,
  Search,
  Grid,
  BookOpen,
  Archive,
  Settings,
  ChevronRight,
  Inbox,
  Percent,
  Printer,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';

export const BoxesView: React.FC = () => {
  const { showToast } = useToastStore();
  const { setSelectedComponentId } = useInventoryStore();

  const [boxes, setBoxes] = useState<StorageBoxSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | BoxType>('ALL');

  // 当前选中的收纳盒（工作台主焦点）
  const [selectedBoxName, setSelectedBoxName] = useState<string | null>(null);

  // 移动端当前视图模式：'LIST' 列表模式 或 'WORKSPACE' 工作台模式
  const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'WORKSPACE'>('LIST');

  // 配置弹窗状态
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<StorageBoxConfig | null>(null);

  // 独立标签打印弹窗状态
  const [activeLabelBox, setActiveLabelBox] = useState<StorageBoxSummary | null>(null);

  const fetchBoxes = async (maintainSelectedName?: string) => {
    setLoading(true);
    try {
      const res = await boxApi.getStorageBoxes();
      if (res.success && res.data) {
        setBoxes(res.data);
        if (res.data.length > 0) {
          const targetName = maintainSelectedName || selectedBoxName;
          const found = res.data.find((b) => b.name === targetName);
          if (found) {
            setSelectedBoxName(found.name);
          } else if (!targetName) {
            setSelectedBoxName(res.data[0].name);
          }
        }
      }
    } catch (err: any) {
      showToast('获取收纳盒失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoxes();
  }, []);

  // 统计大盘指标
  const metrics = useMemo(() => {
    let totalBoxes = boxes.length;
    let totalSlots = 0;
    let occupiedSlots = 0;
    let unassignedCount = 0;
    let totalComponents = 0;
    let totalPieces = 0;

    for (const b of boxes) {
      if (b.total_slots) totalSlots += b.total_slots;
      occupiedSlots += b.occupied_slots || 0;
      totalComponents += b.item_count || 0;
      totalPieces += b.total_quantity || 0;
      if (b.has_unassigned) {
        unassignedCount += 1;
      }
    }

    const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

    return {
      totalBoxes,
      totalSlots,
      occupiedSlots,
      emptySlots: Math.max(0, totalSlots - occupiedSlots),
      occupancyRate,
      unassignedBoxes: unassignedCount,
      totalComponents,
      totalPieces,
    };
  }, [boxes]);

  // 筛选与搜索
  const filteredBoxes = useMemo(() => {
    return boxes.filter((b) => {
      if (typeFilter !== 'ALL' && b.box_type !== typeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = b.name.toLowerCase().includes(q);
        const matchDesc = b.description?.toLowerCase().includes(q);
        const matchCat = b.categories?.some((c) => c.toLowerCase().includes(q));
        const matchPkg = b.packages?.some((p) => p.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchCat && !matchPkg) {
          return false;
        }
      }
      return true;
    });
  }, [boxes, typeFilter, searchQuery]);

  // 当前主工作台选中的盒子对象
  const activeBox = useMemo(() => {
    return boxes.find((b) => b.name === selectedBoxName) || boxes[0] || null;
  }, [boxes, selectedBoxName]);

  const handleSelectBox = (box: StorageBoxSummary) => {
    setSelectedBoxName(box.name);
    setMobileViewMode('WORKSPACE');
  };

  const handleConfigSaved = async () => {
    await fetchBoxes(editingBox?.name || selectedBoxName || undefined);
  };

  const handleEditConfig = (box: StorageBoxSummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingBox(box);
    setConfigModalOpen(true);
  };

  return (
    <div className="max-w-[1720px] mx-auto px-2 sm:px-4 py-3 h-[calc(100vh-4.5rem)] flex flex-col min-h-0">
      {/* 现代工坊 Master-Detail 分栏工作台容器 */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        {/* 左侧边栏 (Master Panel)：收纳容器导航器 (厚重工坊质感) */}
        <aside
          className={`w-full md:w-84 lg:w-90 xl:w-96 flex flex-col min-h-0 bg-surface border-[1.5px] border-border-subtle rounded-md overflow-hidden shrink-0 transition-all ${
            mobileViewMode === 'WORKSPACE' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* 左侧顶部：标题、计数器、新建按键 */}
          <div className="p-3.5 border-b-[1.5px] border-border-subtle bg-canvas/60 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-accent stroke-[2.2]" />
                <h1 className="font-black text-base text-text-main tracking-tight">物理收纳空间</h1>
                <span className="font-mono text-xs font-black px-2 py-0.5 rounded-[2px] bg-subtle text-text-muted border border-border-subtle">
                  {boxes.length}
                </span>
              </div>

              <button
                onClick={() => {
                  setEditingBox(null);
                  setConfigModalOpen(true);
                }}
                className="px-2.5 py-1.5 text-xs sm:text-sm font-black bg-accent text-white hover:bg-accent-hover rounded-[2px] shadow-xs transition-colors flex items-center gap-1"
                title="新建透明零件柜、样品册或收纳盒"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>新建</span>
              </button>
            </div>

            {/* 紧凑搜索栏 */}
            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 stroke-[2.2]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="过滤盒名/品类/封装..."
                className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm font-mono font-medium bg-canvas border-[1.5px] border-border-subtle rounded-[2px] text-text-main placeholder:text-text-muted/70 focus:outline-none focus:border-accent"
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

            {/* 紧凑形态过滤器胶囊 (清晰硬朗加粗) */}
            <div className="grid grid-cols-4 gap-1.5 text-xs font-mono font-bold">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`py-1.5 text-center rounded-[2px] transition-colors border ${
                  typeFilter === 'ALL'
                    ? 'bg-accent/15 text-accent border-accent/40 font-black'
                    : 'bg-canvas text-text-muted hover:text-text-main border-border-subtle'
                }`}
              >
                全部({boxes.length})
              </button>
              <button
                onClick={() => setTypeFilter('GRID')}
                className={`py-1.5 text-center rounded-[2px] transition-colors border ${
                  typeFilter === 'GRID'
                    ? 'bg-accent/15 text-accent border-accent/40 font-black'
                    : 'bg-canvas text-text-muted hover:text-text-main border-border-subtle'
                }`}
                title="网格抽屉"
              >
                网格柜
              </button>
              <button
                onClick={() => setTypeFilter('BOOK')}
                className={`py-1.5 text-center rounded-[2px] transition-colors border ${
                  typeFilter === 'BOOK'
                    ? 'bg-accent/15 text-accent border-accent/40 font-black'
                    : 'bg-canvas text-text-muted hover:text-text-main border-border-subtle'
                }`}
                title="样品册"
              >
                样品册
              </button>
              <button
                onClick={() => setTypeFilter('BIN')}
                className={`py-1.5 text-center rounded-[2px] transition-colors border ${
                  typeFilter === 'BIN'
                    ? 'bg-accent/15 text-accent border-accent/40 font-black'
                    : 'bg-canvas text-text-muted hover:text-text-main border-border-subtle'
                }`}
                title="随手盒"
              >
                随手盒
              </button>
            </div>
          </div>

          {/* 左侧主体：收纳盒列表 (连续工规列表，无卡片碎片感，无生硬竖色条) */}
          <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
            {loading && boxes.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted flex flex-col items-center gap-2">
                <Layers className="w-6 h-6 text-accent animate-pulse stroke-[2.2]" />
                <span className="font-bold">加载收纳容器中...</span>
              </div>
            ) : filteredBoxes.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted font-bold">未找到匹配容器</div>
            ) : (
              filteredBoxes.map((b) => {
                const isSelected = activeBox?.name === b.name;
                const rate = b.occupancy_rate || 0;

                return (
                  <div
                    key={b.name}
                    onClick={() => handleSelectBox(b)}
                    className={cn(
                      'px-3.5 py-3 transition-colors cursor-pointer select-none group',
                      isSelected
                        ? 'bg-accent/[0.08]'
                        : 'bg-surface hover:bg-subtle/70'
                    )}
                  >
                    {/* 第一行：物理颜色微标 + 容器图标 + 容器名称 + 规格徽章 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* 物理色标微方块 (融入图标，不搞大竖条) */}
                        <span
                          className="w-2.5 h-2.5 rounded-[2px] shrink-0 border border-black/10 shadow-2xs"
                          style={{ backgroundColor: b.color || '#3B82F6' }}
                          title={`物理标识色: ${b.color || '#3B82F6'}`}
                        />

                        {b.box_type === 'BOOK' ? (
                          <BookOpen className="w-3.5 h-3.5 text-text-muted shrink-0 stroke-[2.2]" />
                        ) : b.box_type === 'BIN' ? (
                          <Archive className="w-3.5 h-3.5 text-text-muted shrink-0 stroke-[2.2]" />
                        ) : (
                          <Grid className="w-3.5 h-3.5 text-text-muted shrink-0 stroke-[2.2]" />
                        )}

                        <h3
                          className={cn(
                            'text-sm font-black truncate leading-snug',
                            isSelected ? 'text-accent' : 'text-text-main'
                          )}
                          title={b.name}
                        >
                          {b.name}
                        </h3>
                      </div>

                      {/* 快捷打印与配置 */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveLabelBox(b);
                          }}
                          className="p-1 hover:text-accent hover:bg-subtle rounded text-text-muted"
                          title="打印物理标签纸"
                        >
                          <Printer className="w-3.5 h-3.5 stroke-[2.2]" />
                        </button>
                        <button
                          onClick={(e) => handleEditConfig(b, e)}
                          className="p-1 hover:text-text-main hover:bg-subtle rounded text-text-muted"
                          title="编辑容器规格"
                        >
                          <Settings className="w-3.5 h-3.5 stroke-[2.2]" />
                        </button>
                      </div>
                    </div>

                    {/* 第二行：紧凑规格与容量数据 (高密度工规排版) */}
                    <div className="mt-1.5 pl-4.5 flex items-center justify-between text-xs font-mono font-bold text-text-muted">
                      <div className="flex items-center gap-2 truncate">
                        <span>
                          {b.box_type === 'BIN' ? '随手盒' : `${rate}%`}
                          {b.total_slots ? (
                            <span className="text-[11px] font-normal text-text-muted ml-0.5">
                              ({b.occupied_slots}/{b.total_slots}格)
                            </span>
                          ) : null}
                        </span>
                        <span>·</span>
                        <span>{b.item_count}种 ({b.total_quantity}件)</span>

                        {b.has_unassigned && (
                          <span className="text-amber-600 dark:text-amber-400 font-bold text-[11px] flex items-center gap-0.5" title="含待划格散料">
                            <AlertTriangle className="w-3 h-3 stroke-[2.2]" />
                            <span>散料</span>
                          </span>
                        )}
                      </div>

                      <ChevronRight className={cn(
                        'w-3.5 h-3.5 transition-transform stroke-[2.5] shrink-0',
                        isSelected ? 'text-accent translate-x-0.5' : 'text-text-muted/60 opacity-0 group-hover:opacity-100'
                      )} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 左侧底部：工坊微看板 (指标加粗显眼) */}
          <div className="p-3 border-t-[1.5px] border-border-subtle bg-canvas/60 shrink-0 font-mono text-xs text-text-muted">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="block text-text-muted text-xs font-bold mb-0.5">总格位</span>
                <strong className="text-sm font-black text-text-main">{metrics.totalSlots}</strong>
              </div>
              <div>
                <span className="block text-text-muted text-xs font-bold mb-0.5">饱和度</span>
                <strong className="text-sm font-black text-accent">{metrics.occupancyRate}%</strong>
              </div>
              <div>
                <span className="block text-text-muted text-xs font-bold mb-0.5">总物料</span>
                <strong className="text-sm font-black text-text-main">{metrics.totalPieces}件</strong>
              </div>
            </div>
          </div>
        </aside>

        {/* 右侧主舞台 (Detail Workspace)：常驻 2D 亚克力网格与就地巡检抽屉 */}
        <main
          className={`flex-1 flex flex-col min-h-0 ${
            mobileViewMode === 'LIST' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <BoxWorkspace
            box={activeBox}
            onConfigEdit={(box) => {
              setEditingBox(box);
              setConfigModalOpen(true);
            }}
            onOpenLabelPrint={(box) => {
              setActiveLabelBox(box);
            }}
            onSelectComponent={(comp) => {
              setSelectedComponentId(comp.id);
            }}
            onBoxUpdated={() => {
              fetchBoxes(activeBox?.name);
            }}
            onBackToList={() => {
              setMobileViewMode('LIST');
            }}
          />
        </main>
      </div>

      {/* 配置弹窗 (层级 z-80) */}
      <StorageBoxConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        box={editingBox}
        onSaved={handleConfigSaved}
        zIndex={80}
      />

      {/* 独立标签打印工作台 (层级 z-85) */}
      <StorageBoxLabelModal
        isOpen={!!activeLabelBox}
        onClose={() => setActiveLabelBox(null)}
        boxSummary={activeLabelBox}
        zIndex={85}
      />

      {/* 元器件全生命周期档案抽屉 */}
      <ComponentDetailDrawer />
    </div>
  );
};

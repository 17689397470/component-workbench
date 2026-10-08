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
        // 如果当前没有选中盒子或指定了保持选中，默认选中第一个
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
        {/* 左侧边栏 (Master Panel)：收纳容器导航器 */}
        <aside
          className={`w-full md:w-80 lg:w-84 xl:w-88 flex flex-col min-h-0 bg-surface border border-border-subtle rounded-md overflow-hidden shrink-0 transition-all ${
            mobileViewMode === 'WORKSPACE' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* 左侧顶部：标题、计数器、新建按键 */}
          <div className="p-3 border-b border-border-subtle bg-canvas/40 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                <h1 className="font-bold text-sm text-text-main tracking-tight">物理收纳空间</h1>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-[2px] bg-subtle text-text-muted border border-border-subtle">
                  {boxes.length}
                </span>
              </div>

              <button
                onClick={() => {
                  setEditingBox(null);
                  setConfigModalOpen(true);
                }}
                className="px-2 py-1 text-xs font-semibold bg-accent text-white hover:bg-accent-hover rounded-[2px] shadow-2xs transition-colors flex items-center gap-1"
                title="新建透明零件柜、样品册或收纳盒"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建</span>
              </button>
            </div>

            {/* 紧凑搜索栏 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-dim absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="过滤盒名/品类/封装..."
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

            {/* 紧凑形态过滤器胶囊 */}
            <div className="grid grid-cols-4 gap-1 text-[11px] font-mono">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`py-1 text-center rounded-[2px] transition-colors ${
                  typeFilter === 'ALL'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-dim hover:text-text-main border border-border-subtle/60'
                }`}
              >
                全部({boxes.length})
              </button>
              <button
                onClick={() => setTypeFilter('GRID')}
                className={`py-1 text-center rounded-[2px] transition-colors ${
                  typeFilter === 'GRID'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-dim hover:text-text-main border border-border-subtle/60'
                }`}
                title="网格抽屉"
              >
                网格柜
              </button>
              <button
                onClick={() => setTypeFilter('BOOK')}
                className={`py-1 text-center rounded-[2px] transition-colors ${
                  typeFilter === 'BOOK'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-dim hover:text-text-main border border-border-subtle/60'
                }`}
                title="样品册"
              >
                样品册
              </button>
              <button
                onClick={() => setTypeFilter('BIN')}
                className={`py-1 text-center rounded-[2px] transition-colors ${
                  typeFilter === 'BIN'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-dim hover:text-text-main border border-border-subtle/60'
                }`}
                title="随手盒"
              >
                随手盒
              </button>
            </div>
          </div>

          {/* 左侧主体：收纳盒列表 (高信息密度工业列表) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-border-subtle/40">
            {loading && boxes.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-dim flex flex-col items-center gap-2">
                <Layers className="w-5 h-5 text-accent animate-pulse" />
                <span>加载收纳容器中...</span>
              </div>
            ) : filteredBoxes.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-dim">未找到匹配容器</div>
            ) : (
              filteredBoxes.map((b) => {
                const isSelected = activeBox?.name === b.name;
                const rate = b.occupancy_rate || 0;

                return (
                  <div
                    key={b.name}
                    onClick={() => handleSelectBox(b)}
                    className={`pt-1.5 first:pt-0 cursor-pointer select-none group`}
                  >
                    <div
                      className={`p-2.5 rounded-[3px] border transition-all flex flex-col justify-between relative ${
                        isSelected
                          ? 'border-accent bg-accent/[0.08] shadow-2xs'
                          : 'border-border-subtle bg-surface hover:border-border-hover hover:bg-surface-hover'
                      }`}
                    >
                      {/* 左侧物理色条 */}
                      <span
                        className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-[1px] transition-all"
                        style={{ backgroundColor: b.color || '#3B82F6' }}
                      />

                      {/* 标题与类型 */}
                      <div className="flex items-start justify-between gap-1.5 pl-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {b.box_type === 'BOOK' ? (
                              <BookOpen className="w-3.5 h-3.5 text-text-dim shrink-0" />
                            ) : b.box_type === 'BIN' ? (
                              <Archive className="w-3.5 h-3.5 text-text-dim shrink-0" />
                            ) : (
                              <Grid className="w-3.5 h-3.5 text-text-dim shrink-0" />
                            )}
                            <h3
                              className={`text-xs font-bold truncate ${
                                isSelected ? 'text-accent' : 'text-text-main'
                              }`}
                              title={b.name}
                            >
                              {b.name}
                            </h3>
                          </div>

                          <div className="text-[10px] text-text-dim font-mono mt-0.5 truncate">
                            {b.box_type === 'BOOK'
                              ? `样品册 · ${b.pages || 1}页 (${b.total_slots || 0}格)`
                              : b.box_type === 'BIN'
                              ? '随手盒 / 散料池'
                              : `${b.rows || 4}行×${b.cols || 6}列 (${b.total_slots || 24}格)`}
                          </div>
                        </div>

                        {/* 快捷按钮 */}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveLabelBox(b);
                            }}
                            className="p-1 hover:text-accent hover:bg-subtle rounded text-text-dim"
                            title="打印物理标签纸"
                          >
                            <Printer className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleEditConfig(b, e)}
                            className="p-1 hover:text-text-main hover:bg-subtle rounded text-text-dim"
                            title="编辑容器规格"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* 容量指示微条 */}
                      {b.box_type !== 'BIN' && (b.total_slots || 0) > 0 && (
                        <div className="mt-2 pl-1.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-text-dim">
                              {b.occupied_slots}/{b.total_slots} 格
                            </span>
                            <span className="font-bold text-accent">{rate}%</span>
                          </div>
                          <div className="w-full h-1 bg-canvas rounded-full overflow-hidden border border-border-subtle/50">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${rate}%`,
                                backgroundColor: b.color || '#3B82F6',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 散料待划格微标签 */}
                      {b.has_unassigned && (
                        <div className="mt-1.5 pl-1.5 flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                          <span>含有待划入抽屉的散料</span>
                        </div>
                      )}

                      {/* 底部数量微标 */}
                      <div className="mt-1.5 pl-1.5 pt-1 border-t border-border-subtle/40 flex items-center justify-between text-[10px] text-text-dim font-mono">
                        <span>{b.item_count} 种元器件</span>
                        <div className="flex items-center gap-1">
                          <strong className="text-text-main">{b.total_quantity} 件</strong>
                          <ChevronRight className="w-3 h-3 text-text-dim group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 左侧底部：工坊微看板 (指标收纳) */}
          <div className="p-2.5 border-t border-border-subtle bg-canvas/30 shrink-0 font-mono text-[10px] text-text-dim">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="block text-text-dim/80 scale-90">总格位</span>
                <strong className="text-xs text-text-main font-bold">{metrics.totalSlots}</strong>
              </div>
              <div>
                <span className="block text-text-dim/80 scale-90">饱和度</span>
                <strong className="text-xs text-accent font-bold">{metrics.occupancyRate}%</strong>
              </div>
              <div>
                <span className="block text-text-dim/80 scale-90">总物料</span>
                <strong className="text-xs text-text-main font-bold">{metrics.totalPieces}件</strong>
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

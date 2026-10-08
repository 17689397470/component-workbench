import React, { useEffect, useState, useMemo } from 'react';
import { boxApi } from '../api/boxApi';
import { StorageBoxSummary, StorageBoxConfig, BoxType } from '../types/box';
import { useToastStore } from '../store/useToastStore';
import { useInventoryStore } from '../store/useInventoryStore';
import { StorageBoxConfigModal } from '../components/boxes/StorageBoxConfigModal';
import { StorageBoxGridModal } from '../components/boxes/StorageBoxGridModal';
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
  Sparkles,
  Inbox,
  Percent,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const BoxesView: React.FC = () => {
  const { showToast } = useToastStore();
  const { setSelectedComponentId } = useInventoryStore();

  const [boxes, setBoxes] = useState<StorageBoxSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | BoxType>('ALL');

  // 配置弹窗状态
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<StorageBoxConfig | null>(null);

  // 2D 网格工作台弹窗状态
  const [gridModalOpen, setGridModalOpen] = useState(false);
  const [activeBox, setActiveBox] = useState<StorageBoxConfig | null>(null);

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      const res = await boxApi.getStorageBoxes();
      if (res.success && res.data) {
        setBoxes(res.data);
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
    let unassignedItems = 0;
    let totalComponents = 0;
    let totalPieces = 0;

    for (const b of boxes) {
      if (b.total_slots) totalSlots += b.total_slots;
      occupiedSlots += b.occupied_slots || 0;
      totalComponents += b.item_count || 0;
      totalPieces += b.total_quantity || 0;
      if (b.has_unassigned) {
        unassignedItems += 1;
      }
    }

    const occupancyRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

    return {
      totalBoxes,
      totalSlots,
      occupiedSlots,
      emptySlots: Math.max(0, totalSlots - occupiedSlots),
      occupancyRate,
      unassignedBoxes: unassignedItems,
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

  const handleOpenGrid = (box: StorageBoxSummary) => {
    setActiveBox(box);
    setGridModalOpen(true);
  };

  const handleEditConfig = (box: StorageBoxSummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingBox(box);
    setConfigModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-6">
      {/* 顶部标题栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-main flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" />
            <span>物理收纳空间 2.0 (Boxes 2.0)</span>
          </h1>
          <p className="text-xs text-text-muted mt-1">
            工坊透明亚克力零件柜、阻容样品册与物料盒 2D 网格立体透视。点击卡片开启网格工作台。
          </p>
        </div>

        <button
          onClick={() => {
            setEditingBox(null);
            setConfigModalOpen(true);
          }}
          className="px-3.5 py-2 text-xs font-semibold bg-accent text-white hover:bg-accent-hover rounded-xl shadow-sm transition-all flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>新建物理收纳盒</span>
        </button>
      </div>

      {/* 工坊物理收纳大盘指标 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-surface border border-border-subtle rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-bold">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-text-dim">收纳容器总数</div>
            <div className="text-lg font-black font-mono text-text-main mt-0.5">
              {metrics.totalBoxes}{' '}
              <span className="text-xs font-normal text-text-dim">个</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-surface border border-border-subtle rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
            <Grid className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-text-dim">总网格仓位数</div>
            <div className="text-lg font-black font-mono text-emerald-500 mt-0.5">
              {metrics.totalSlots}{' '}
              <span className="text-xs font-normal text-text-dim">格</span>
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-surface border border-border-subtle rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-text-dim">空间饱和度</div>
            <div className="text-lg font-black font-mono text-amber-500 mt-0.5">
              {metrics.occupancyRate}%{' '}
              <span className="text-[11px] font-normal text-text-dim">
                ({metrics.occupiedSlots}在用/{metrics.emptySlots}空余)
              </span>
            </div>
          </div>
        </div>

        <div className="p-3.5 bg-surface border border-border-subtle rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] text-text-dim">容纳元器件总量</div>
            <div className="text-lg font-black font-mono text-purple-500 mt-0.5">
              {metrics.totalComponents}{' '}
              <span className="text-xs font-normal text-text-dim">种 ({metrics.totalPieces}件)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索与形态筛选栏 */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* 类型 Tab */}
        <div className="flex p-1 bg-canvas border border-border-subtle rounded-xl text-xs w-full sm:w-auto">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              typeFilter === 'ALL'
                ? 'bg-surface text-accent font-bold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            全部形态 ({boxes.length})
          </button>
          <button
            onClick={() => setTypeFilter('GRID')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ${
              typeFilter === 'GRID'
                ? 'bg-surface text-accent font-bold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            网格抽屉
          </button>
          <button
            onClick={() => setTypeFilter('BOOK')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ${
              typeFilter === 'BOOK'
                ? 'bg-surface text-accent font-bold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            样品册
          </button>
          <button
            onClick={() => setTypeFilter('BIN')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ${
              typeFilter === 'BIN'
                ? 'bg-surface text-accent font-bold shadow-sm'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            随手盒
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-text-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索盒名、说明、品类或封装..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas border border-border-subtle rounded-xl text-text-main focus:outline-none focus:border-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-dim hover:text-text-main"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 收纳盒卡片网格 */}
      {loading ? (
        <div className="py-24 text-center text-xs text-text-dim flex flex-col items-center gap-2">
          <Layers className="w-8 h-8 text-accent animate-pulse" />
          <span>正在透视工坊物理收纳网格...</span>
        </div>
      ) : filteredBoxes.length === 0 ? (
        <div className="py-16 text-center text-xs text-text-dim bg-surface border border-dashed border-border-subtle rounded-2xl">
          未找到匹配的物理收纳空间
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredBoxes.map((box) => {
            const hasGrid = box.box_type !== 'BIN' && (box.total_slots || 0) > 0;
            const rate = box.occupancy_rate || 0;

            return (
              <div
                key={box.name}
                onClick={() => handleOpenGrid(box)}
                className="bg-surface border border-border-subtle hover:border-accent rounded-2xl p-4 shadow-sm hover:shadow-lg cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                {/* 顶部色彩饰条 */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 transition-all group-hover:h-1.5"
                  style={{ backgroundColor: box.color || '#3B82F6' }}
                />

                <div>
                  {/* 头部标题与类型 */}
                  <div className="flex items-start justify-between gap-2 mb-2 pt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 transition-transform group-hover:scale-105"
                        style={{
                          backgroundColor: `${box.color || '#3B82F6'}15`,
                          color: box.color || '#3B82F6',
                        }}
                      >
                        {box.box_type === 'BOOK' ? (
                          <BookOpen className="w-4 h-4" />
                        ) : box.box_type === 'BIN' ? (
                          <Archive className="w-4 h-4" />
                        ) : (
                          <Grid className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className="font-bold text-sm text-text-main truncate group-hover:text-accent transition-colors"
                          title={box.name}
                        >
                          {box.name}
                        </div>
                        <div className="text-[10px] text-text-dim mt-0.5 truncate">
                          {box.box_type === 'BOOK'
                            ? `样品本 · ${box.pages || 1}页 (${box.total_slots}格)`
                            : box.box_type === 'BIN'
                            ? '随手料盒 / 散料袋'
                            : `${box.rows || 4}行 × ${box.cols || 6}列 (${box.total_slots || 24}格)`}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleEditConfig(box, e)}
                      className="p-1 text-text-dim hover:text-text-main hover:bg-subtle rounded-lg opacity-40 group-hover:opacity-100 transition-all shrink-0"
                      title="编辑收纳盒规格"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 饱和度进度条 */}
                  {hasGrid ? (
                    <div className="my-2.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-text-dim">饱和度</span>
                        <span className="font-mono font-bold text-accent">
                          {rate}%{' '}
                          <span className="text-[10px] font-normal text-text-dim">
                            ({box.occupied_slots}/{box.total_slots}格)
                          </span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-canvas rounded-full overflow-hidden border border-border-subtle">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${rate}%`,
                            backgroundColor: box.color || '#3B82F6',
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* 散料待划格警示 */}
                  {box.has_unassigned && (
                    <div className="my-2 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>含有待划分网格的散料物料</span>
                    </div>
                  )}

                  {/* 盒内主营品类 */}
                  <div className="flex flex-wrap gap-1 my-2">
                    {box.categories?.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="px-1.5 py-0.5 bg-canvas border border-border-subtle rounded text-[10px] text-text-muted truncate max-w-[80px]"
                      >
                        {cat}
                      </span>
                    ))}
                    {box.packages?.slice(0, 2).map((pkg) => (
                      <span
                        key={pkg}
                        className="px-1.5 py-0.5 bg-canvas border border-border-subtle rounded font-mono text-[9px] text-text-dim truncate max-w-[70px]"
                      >
                        {pkg}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 底部指标栏 */}
                <div className="pt-3 border-t border-dashed border-border-subtle flex items-center justify-between text-xs mt-1">
                  <div>
                    <span className="text-text-dim text-[11px]">品类:</span>{' '}
                    <strong className="font-mono text-text-main">{box.item_count}</strong> 种
                  </div>
                  <div className="flex items-center gap-1">
                    <div>
                      <span className="text-text-dim text-[11px]">存量:</span>{' '}
                      <strong className="font-mono text-accent font-bold">
                        {box.total_quantity}
                      </strong>{' '}
                      件
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-text-dim group-hover:translate-x-0.5 group-hover:text-accent transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 配置弹窗 */}
      <StorageBoxConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        box={editingBox}
        onSaved={fetchBoxes}
      />

      {/* 2D 亚克力网格工作台 */}
      <StorageBoxGridModal
        isOpen={gridModalOpen}
        onClose={() => setGridModalOpen(false)}
        boxSummary={activeBox}
        onConfigEdit={() => {
          setEditingBox(activeBox);
          setConfigModalOpen(true);
        }}
        onSelectComponent={(comp) => {
          setSelectedComponentId(comp.id);
        }}
      />

      {/* 元器件全生命周期档案抽屉 */}
      <ComponentDetailDrawer />
    </div>
  );
};

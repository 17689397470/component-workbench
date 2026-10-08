import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StorageBoxSummary, BoxGridResponseData, BoxGridSlot } from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { AcrylicDrawerCell } from '../boxes/AcrylicDrawerCell';
import { useToastStore } from '../../store/useToastStore';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Maximize2,
  RefreshCw,
  Box,
  ShoppingCart,
  X,
  Target,
  ArrowRight,
  ArrowLeft,
  CheckSquare,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { KittingMaterial } from './KittingBoxSandbox';

interface ImmersiveKittingModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  targetQty?: number;
  materials: KittingMaterial[];
  checkedPicks: Record<string, boolean>;
  onTogglePick: (materialId: string | number, nextPicked?: boolean) => void;
  onBatchPickAll?: () => void;
}

export const ImmersiveKittingModal: React.FC<ImmersiveKittingModalProps> = ({
  isOpen,
  onClose,
  projectName,
  targetQty = 1,
  materials,
  checkedPicks,
  onTogglePick,
  onBatchPickAll,
}) => {
  const { showToast } = useToastStore();

  const [boxes, setBoxes] = useState<StorageBoxSummary[]>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [activeBoxName, setActiveBoxName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [gridData, setGridData] = useState<BoxGridResponseData | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  // 当前导引聚焦的物料索引与抽屉
  const [currentGuideIndex, setCurrentGuideIndex] = useState<number>(0);
  const [inspectedSlot, setInspectedSlot] = useState<BoxGridSlot | null>(null);

  // 1. 获取所有收纳盒
  const fetchBoxes = async () => {
    setLoadingBoxes(true);
    try {
      const res = await boxApi.getStorageBoxes();
      if (res.success && res.data) {
        setBoxes(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingBoxes(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBoxes();
    }
  }, [isOpen]);

  // 2. 统计各收纳盒的本工程用料分布
  const boxStats = useMemo(() => {
    const stats: Record<
      string,
      { totalDemandItems: number; pickedCount: number; matchedMaterials: KittingMaterial[] }
    > = {};

    for (const b of boxes) {
      stats[b.name] = { totalDemandItems: 0, pickedCount: 0, matchedMaterials: [] };
    }

    materials.forEach((mat) => {
      const loc = (mat.location || '').trim();
      if (!loc) return;

      const matchedBox = boxes.find(
        (b) => loc.startsWith(b.name) || loc.includes(b.name) || boxes.length === 1
      );

      const targetBoxName = matchedBox ? matchedBox.name : boxes[0]?.name;
      if (targetBoxName) {
        if (!stats[targetBoxName]) {
          stats[targetBoxName] = { totalDemandItems: 0, pickedCount: 0, matchedMaterials: [] };
        }
        stats[targetBoxName].totalDemandItems++;
        if (checkedPicks[String(mat.id)]) {
          stats[targetBoxName].pickedCount++;
        }
        stats[targetBoxName].matchedMaterials.push(mat);
      }
    });

    return stats;
  }, [boxes, materials, checkedPicks]);

  // 3. 初始自动选中用料最多的收纳盒
  useEffect(() => {
    if (boxes.length > 0 && !activeBoxName) {
      let bestBox = boxes[0].name;
      let maxCount = -1;
      for (const [boxName, s] of Object.entries(boxStats)) {
        if (s.totalDemandItems > maxCount) {
          maxCount = s.totalDemandItems;
          bestBox = boxName;
        }
      }
      setActiveBoxName(bestBox);
    }
  }, [boxes, boxStats, activeBoxName]);

  // 4. 加载当前收纳盒网格数据
  const fetchGrid = async (boxName: string, page: number) => {
    if (!boxName) return;
    setLoadingGrid(true);
    try {
      const res = await boxApi.getBoxGrid(boxName, page);
      if (res.success && res.data) {
        setGridData(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    if (activeBoxName && isOpen) {
      fetchGrid(activeBoxName, currentPage);
    }
  }, [activeBoxName, currentPage, isOpen]);

  const currentBoxConfig = useMemo(() => {
    return boxes.find((b) => b.name === activeBoxName) || boxes[0] || null;
  }, [boxes, activeBoxName]);

  // 5. 建立格位 -> 物料映射
  const slotToMaterialMap = useMemo(() => {
    const map = new Map<string, KittingMaterial>();
    if (!gridData) return map;

    materials.forEach((mat) => {
      // 匹配方式一：基于元器件 ID
      if (mat.componentId) {
        for (const slotItem of gridData.grid) {
          if (slotItem.components.some((c) => c.id === mat.componentId)) {
            map.set(slotItem.slot, mat);
            return;
          }
        }
      }

      // 匹配方式二：基于 location 文本中包含的 slot 编号
      const loc = (mat.location || '').trim();
      if (loc) {
        for (const slotItem of gridData.grid) {
          if (
            loc.endsWith(slotItem.slot) ||
            loc.includes(` ${slotItem.slot}`) ||
            loc.includes(`-${slotItem.slot}`)
          ) {
            map.set(slotItem.slot, mat);
            return;
          }
        }
      }
    });

    return map;
  }, [materials, gridData]);

  // 6. 待取的物料巡航队列
  const guideQueue = useMemo(() => {
    return materials.filter((m) => !!m.location);
  }, [materials]);

  const currentGuideMaterial = guideQueue[currentGuideIndex] || guideQueue[0] || null;

  // 自动将沙盘对齐到当前导引物料所在的收纳盒
  const syncToGuideMaterial = useCallback(
    (mat: KittingMaterial | null) => {
      if (!mat || !mat.location || boxes.length === 0) return;
      const loc = mat.location.trim();
      const targetBox = boxes.find((b) => loc.startsWith(b.name) || loc.includes(b.name));
      if (targetBox && targetBox.name !== activeBoxName) {
        setActiveBoxName(targetBox.name);
        setCurrentPage(1);
      }
    },
    [boxes, activeBoxName]
  );

  useEffect(() => {
    if (currentGuideMaterial) {
      syncToGuideMaterial(currentGuideMaterial);
    }
  }, [currentGuideIndex, currentGuideMaterial, syncToGuideMaterial]);

  // 切换到下一个待取抽屉
  const handleNextGuide = () => {
    if (guideQueue.length === 0) return;
    // 优先寻找下一个未打卡的
    const nextUnpickedIndex = guideQueue.findIndex(
      (m, idx) => idx > currentGuideIndex && !checkedPicks[String(m.id)]
    );
    if (nextUnpickedIndex !== -1) {
      setCurrentGuideIndex(nextUnpickedIndex);
      return;
    }
    // 循环或顺序下一个
    const nextIdx = (currentGuideIndex + 1) % guideQueue.length;
    setCurrentGuideIndex(nextIdx);
  };

  const handlePrevGuide = () => {
    if (guideQueue.length === 0) return;
    const prevIdx = (currentGuideIndex - 1 + guideQueue.length) % guideQueue.length;
    setCurrentGuideIndex(prevIdx);
  };

  // 打卡当前导引物料
  const handleToggleCurrentGuide = () => {
    if (!currentGuideMaterial) return;
    const isCurrentlyPicked = !!checkedPicks[String(currentGuideMaterial.id)];
    onTogglePick(currentGuideMaterial.id, !isCurrentlyPicked);
    if (!isCurrentlyPicked) {
      showToast(`✔ [${currentGuideMaterial.location}] ${currentGuideMaterial.name} 已取料！`, 'success');
      // 自动顺延到下一个未取项
      setTimeout(() => {
        handleNextGuide();
      }, 200);
    } else {
      showToast(`已撤销打卡标记`, 'info');
    }
  };

  // 抽屉单元格点击
  const handleSlotClick = (slotItem: BoxGridSlot) => {
    setInspectedSlot(slotItem);
    const matchedMat = slotToMaterialMap.get(slotItem.slot);
    if (matchedMat) {
      const idx = guideQueue.findIndex((m) => String(m.id) === String(matchedMat.id));
      if (idx !== -1) {
        setCurrentGuideIndex(idx);
      }
    }
  };

  // 键盘快捷键支持 (空格打卡, 左右箭头切换, ESC退出)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleCurrentGuide();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNextGuide();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrevGuide();
      } else if (e.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentGuideMaterial, checkedPicks]);

  if (!isOpen) return null;

  const cols = currentBoxConfig?.cols || 5;
  const totalPages = currentBoxConfig?.pages || 1;

  const totalDemandCount = materials.length;
  const totalPickedCount = materials.filter((m) => checkedPicks[String(m.id)]).length;
  const isAllPicked = totalDemandCount > 0 && totalPickedCount === totalDemandCount;
  const isCurrentPicked = currentGuideMaterial
    ? !!checkedPicks[String(currentGuideMaterial.id)]
    : false;

  return (
    <div className="fixed inset-0 z-50 bg-canvas/95 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200 select-none">
      {/* 1. 顶部全局状态栏：工程标牌 + 配料进度 + 关闭按键 */}
      <div className="h-14 px-4 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-accent text-white flex items-center justify-center font-bold">
            <Target className="w-4 h-4" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-text-main truncate">
                现场配料寻料工作台: {projectName}
              </h2>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] bg-accent/15 text-accent border border-accent/30">
                x{targetQty}套 (板)
              </span>
            </div>
            <div className="text-[11px] font-mono text-text-muted mt-0.5">
              提示：可按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">空格</kbd> 快速打卡，按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">← / →</kbd> 切换抽屉，按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">ESC</kbd> 退出
            </div>
          </div>
        </div>

        {/* 中间：总体配料进度仪表 */}
        <div className="hidden md:flex items-center gap-3 font-mono">
          <div className="text-right">
            <div className="text-xs font-bold text-text-muted">
              配料进度:{' '}
              <strong className={cn('text-sm font-black', isAllPicked ? 'text-emerald-600' : 'text-text-main')}>
                {totalPickedCount} / {totalDemandCount}
              </strong>
            </div>
          </div>
          <div className="w-36 h-2 bg-subtle border border-border-subtle rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                isAllPicked ? 'bg-emerald-600' : 'bg-accent'
              )}
              style={{
                width: `${totalDemandCount > 0 ? (totalPickedCount / totalDemandCount) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* 右侧：退出与关闭 */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] flex items-center gap-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>退出配料沙盘 (ESC)</span>
          </button>
        </div>
      </div>

      {/* 2. 核心现场导引大型标牌 (HUD Navigator) - 气势磅礴的大字牌 */}
      {currentGuideMaterial && (
        <div className="px-4 py-3 bg-surface/90 border-b-2 border-accent/40 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            {/* 目标抽屉超大工牌 */}
            <div className="px-3.5 py-1.5 bg-accent text-white font-mono font-black text-xl sm:text-2xl rounded-[2px] shadow-sm tracking-tight flex items-center gap-1.5 shrink-0">
              <Box className="w-5 h-5" />
              <span>{currentGuideMaterial.location || '待指定抽屉'}</span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-black text-text-main truncate">
                  {currentGuideMaterial.name}
                </span>
                {currentGuideMaterial.package && (
                  <span className="px-2 py-0.5 bg-canvas border border-border-subtle text-xs font-mono font-bold text-text-muted rounded-[2px]">
                    {currentGuideMaterial.package}
                  </span>
                )}
                {currentGuideMaterial.designators && (
                  <span className="text-xs font-mono font-bold text-accent px-2 py-0.5 bg-accent/10 border border-accent/25 rounded-[2px] truncate max-w-xs">
                    位号: {currentGuideMaterial.designators}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs font-mono text-text-muted">
                <span>
                  本次需取:{' '}
                  <strong className="text-base text-accent font-black">
                    {currentGuideMaterial.demandQty} 件
                  </strong>
                </span>
                <span>·</span>
                <span>
                  抽屉存量:{' '}
                  <strong className="text-text-main font-bold">
                    {currentGuideMaterial.stockQty ?? 0} 件
                  </strong>
                </span>
                <span>·</span>
                <span className="text-text-muted">
                  序号: {currentGuideIndex + 1} / {guideQueue.length}
                </span>
              </div>
            </div>
          </div>

          {/* 右侧核心大操作组 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrevGuide}
              className="p-2 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
              title="上一件 (←)"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* 超大取料打卡主行动按钮 */}
            <button
              onClick={handleToggleCurrentGuide}
              className={cn(
                'px-5 py-2.5 text-sm font-black rounded-[2px] shadow-sm flex items-center gap-2 transition-all active:scale-95 border',
                isCurrentPicked
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-accent text-white border-accent hover:bg-accent-hover'
              )}
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>{isCurrentPicked ? '✔ 此项已取 (按空格撤销)' : '抽屉取料打卡 (按空格)'}</span>
            </button>

            <button
              onClick={handleNextGuide}
              className="p-2 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
              title="下一件 (→)"
            >
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* 3. 中间多柜药丸切换条 */}
      <div className="px-4 py-2 bg-surface/50 border-b border-border-subtle flex items-center justify-between gap-2 overflow-x-auto shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-text-muted mr-1">收纳柜透视:</span>
          {boxes.map((b) => {
            const stat = boxStats[b.name];
            const demandCount = stat?.totalDemandItems || 0;
            const isSelected = b.name === activeBoxName;
            return (
              <button
                key={b.id || b.name}
                onClick={() => {
                  setActiveBoxName(b.name);
                  setCurrentPage(1);
                  setInspectedSlot(null);
                }}
                className={cn(
                  'px-2.5 py-1 text-xs font-mono font-bold rounded-[2px] border transition-all flex items-center gap-1.5 shrink-0',
                  isSelected
                    ? 'bg-text-main text-surface border-text-main shadow-xs'
                    : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main hover:border-border-hover'
                )}
              >
                <Box className="w-3.5 h-3.5" />
                <span>{b.name}</span>
                {demandCount > 0 && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.2 rounded-xs font-black',
                      isSelected ? 'bg-surface/20 text-surface' : 'bg-accent/15 text-accent'
                    )}
                  >
                    {stat.pickedCount}/{demandCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1 font-mono text-xs border border-border-subtle rounded-[2px] px-1.5 py-0.5 bg-canvas">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-0.5 text-text-muted hover:text-text-main disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-bold text-xs">
              {currentPage} / {totalPages} 面
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-0.5 text-text-muted hover:text-text-main disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 4. 主舞台：开阔舒展的 2D 亚克力网格矩阵大沙盘 (独占全屏核心区域) */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 relative">
        {loadingGrid && (
          <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] flex items-center justify-center z-30">
            <div className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle rounded shadow-xs text-xs sm:text-sm text-text-main font-bold">
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
              <span>正在投射亚克力抽屉矩阵...</span>
            </div>
          </div>
        )}

        {gridData && gridData.grid.length > 0 ? (
          <div
            className="grid gap-3 transition-all pb-12 max-w-7xl mx-auto"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(160px, 1fr))`,
            }}
          >
            {gridData.grid.map((slotItem) => {
              const matchedMat = slotToMaterialMap.get(slotItem.slot);
              const isTargetGuide =
                currentGuideMaterial &&
                matchedMat &&
                String(currentGuideMaterial.id) === String(matchedMat.id);

              let kittingStatus: 'SUFFICIENT' | 'SHORTAGE' | 'SUBSTITUTE' | 'FOCUSED' | null = null;
              let kittingDemand = 0;
              let isPicked = false;

              if (matchedMat) {
                kittingDemand = matchedMat.demandQty;
                isPicked = !!checkedPicks[String(matchedMat.id)];
                if (isTargetGuide) {
                  kittingStatus = 'FOCUSED';
                } else if (
                  matchedMat.status === 'SHORTAGE' ||
                  (matchedMat.stockQty || 0) < matchedMat.demandQty
                ) {
                  kittingStatus = 'SHORTAGE';
                } else if (matchedMat.status === 'SUBSTITUTE') {
                  kittingStatus = 'SUBSTITUTE';
                } else {
                  kittingStatus = 'SUFFICIENT';
                }
              }

              const isSearchDimmed = !matchedMat && materials.length > 0;

              return (
                <AcrylicDrawerCell
                  key={slotItem.slot}
                  slotItem={slotItem}
                  isSelected={Boolean(isTargetGuide || inspectedSlot?.slot === slotItem.slot)}
                  isSearchDimmed={isSearchDimmed}
                  kittingStatus={kittingStatus}
                  kittingDemand={kittingDemand}
                  isPicked={isPicked}
                  onClick={() => handleSlotClick(slotItem)}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-sm py-20">
            <Box className="w-12 h-12 stroke-[1.2] mb-3 opacity-40" />
            <span>当前收纳柜暂未配置格位网格</span>
          </div>
        )}
      </div>
    </div>
  );
};

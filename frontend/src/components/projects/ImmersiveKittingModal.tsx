import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StorageBoxSummary, BoxGridResponseData, BoxGridSlot } from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { AcrylicDrawerCell } from '../boxes/AcrylicDrawerCell';
import { useToastStore } from '../../store/useToastStore';
import {
  Check,
  RefreshCw,
  Box,
  X,
  Target,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Compass,
  MapPin,
  Package,
  AlertTriangle,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { KittingMaterial } from './KittingBoxSandbox';

// 解析位置字符串中的收纳盒名与具体抽屉号
export const parseLocationInfo = (location: string | undefined | null) => {
  if (!location) {
    return { boxName: '', slot: null, isLoose: true };
  }
  const clean = location.trim();
  // 1. 优先匹配括号内：如 "桌底收纳箱A (B2)" 或 "A (1-03)"
  const bracketMatch = clean.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (bracketMatch) {
    return {
      boxName: bracketMatch[1].trim(),
      slot: bracketMatch[2].trim(),
      isLoose: false,
    };
  }

  // 2. 匹配 "收纳盒名 抽屉号" 或 "收纳盒名-抽屉号" (如 "默认电阻盒 1-03" 或 "A-1-03")
  const sepMatch = clean.match(/^(.+?)[-\s]+([A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)$/);
  if (sepMatch) {
    return {
      boxName: sepMatch[1].trim(),
      slot: sepMatch[2].trim(),
      isLoose: false,
    };
  }

  // 3. 仅有收纳盒名，无具体抽屉号 (盒内散料)
  return {
    boxName: clean,
    slot: null,
    isLoose: true,
  };
};

export interface KittingItemStep {
  id: string | number;
  index: number;
  material: KittingMaterial;
  boxName: string;
  slot: string | null;
  isLoose: boolean;
  isUnassigned: boolean;
  isPicked: boolean;
}

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

  // 当前在左侧清单中选中的物料序号
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [inspectedSlot, setInspectedSlot] = useState<BoxGridSlot | null>(null);

  // 清单过滤条件: 'ALL' 全部 | 'UNPICKED' 待拣选 | 'PICKED' 已完成
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNPICKED' | 'PICKED'>('ALL');

  // 聚光灯防眩微调: 默认开启 (非焦点抽屉适当压暗，焦点抽屉强烈发光放大)
  const [isSpotlightMode, setIsSpotlightMode] = useState<boolean>(true);

  // 1. 获取所有物理收纳盒
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

  // 2. 构造主流拣料工单任务流 (同柜聚类物理动线优化排序)
  const allSteps = useMemo<KittingItemStep[]>(() => {
    if (!materials || materials.length === 0) return [];

    const mapped = materials.map((mat) => {
      const locInfo = parseLocationInfo(mat.location);
      let matchedBoxName = '';
      let isUnassigned = false;

      if (!mat.location || !locInfo.boxName) {
        isUnassigned = true;
      } else {
        const b = boxes.find(
          (box) =>
            locInfo.boxName.startsWith(box.name) ||
            locInfo.boxName.includes(box.name) ||
            box.name.includes(locInfo.boxName)
        );
        matchedBoxName = b ? b.name : locInfo.boxName;
      }

      return {
        id: mat.id,
        material: mat,
        boxName: matchedBoxName,
        slot: locInfo.slot,
        isLoose: locInfo.isLoose || !locInfo.slot,
        isUnassigned,
        isPicked: !!checkedPicks[String(mat.id)],
      };
    });

    // 物理动线最优排序：
    // 已入库物料优先，按收纳盒名称聚类（同一收纳盒一次性拿完）；同盒内有抽屉号在前；未入库排在末尾
    mapped.sort((a, b) => {
      if (a.isUnassigned && !b.isUnassigned) return 1;
      if (!a.isUnassigned && b.isUnassigned) return -1;

      if (a.boxName !== b.boxName) {
        return a.boxName.localeCompare(b.boxName, 'zh-CN');
      }

      if (!a.isLoose && b.isLoose) return -1;
      if (a.isLoose && !b.isLoose) return 1;

      return (a.slot || '').localeCompare(b.slot || '', undefined, { numeric: true });
    });

    return mapped.map((item, idx) => ({
      ...item,
      index: idx,
    }));
  }, [materials, boxes, checkedPicks]);

  // 按收纳盒对工单物料进行物理分组
  const groupedSteps = useMemo(() => {
    const groups: {
      boxName: string;
      isUnassigned: boolean;
      items: KittingItemStep[];
      pickedCount: number;
    }[] = [];

    allSteps.forEach((step) => {
      const groupKey = step.isUnassigned ? '__UNASSIGNED__' : step.boxName || '默认收纳';
      let grp = groups.find((g) => (g.isUnassigned ? '__UNASSIGNED__' : g.boxName) === groupKey);
      if (!grp) {
        grp = {
          boxName: step.isUnassigned ? '待备料 / 暂无货位' : step.boxName || '默认收纳',
          isUnassigned: step.isUnassigned,
          items: [],
          pickedCount: 0,
        };
        groups.push(grp);
      }
      grp.items.push(step);
      if (step.isPicked) {
        grp.pickedCount++;
      }
    });

    return groups;
  }, [allSteps]);

  // 根据过滤条件筛选左侧显示的物料
  const visibleSteps = useMemo(() => {
    if (filterMode === 'UNPICKED') {
      return allSteps.filter((s) => !s.isPicked);
    }
    if (filterMode === 'PICKED') {
      return allSteps.filter((s) => s.isPicked);
    }
    return allSteps;
  }, [allSteps, filterMode]);

  // 当前正在检视/配料的物料任务
  const activeStep = allSteps[selectedStepIndex] || allSteps[0] || null;

  // 3. 打开模态框时，自动定位到第一个未完成物料，并无缝切到对应收纳盒
  useEffect(() => {
    if (isOpen && allSteps.length > 0) {
      const firstUnpickedIdx = allSteps.findIndex((s) => !s.isPicked);
      const targetIdx = firstUnpickedIdx !== -1 ? firstUnpickedIdx : 0;
      setSelectedStepIndex(targetIdx);

      const step = allSteps[targetIdx];
      if (step?.boxName) {
        setActiveBoxName(step.boxName);
      } else if (boxes.length > 0) {
        setActiveBoxName(boxes[0].name);
      }
    }
  }, [isOpen]);

  // 关闭时清理状态
  useEffect(() => {
    if (!isOpen) {
      setActiveBoxName('');
      setSelectedStepIndex(0);
      setInspectedSlot(null);
    }
  }, [isOpen]);

  // 4. 加载右侧活动收纳盒的 2D 亚克力网格数据
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
      // 方式 1: 元器件 ID 匹配
      if (mat.componentId) {
        for (const slotItem of gridData.grid) {
          if (slotItem.components.some((c) => c.id === mat.componentId)) {
            map.set(slotItem.slot, mat);
            return;
          }
        }
      }

      // 方式 2: 解析出的抽屉号匹配
      const { slot } = parseLocationInfo(mat.location);
      if (slot) {
        for (const slotItem of gridData.grid) {
          if (slotItem.slot.toLowerCase() === slot.toLowerCase()) {
            map.set(slotItem.slot, mat);
            return;
          }
        }
      }
    });

    return map;
  }, [materials, gridData]);

  // 6. 切换活动物料 (自动联动跨柜切换)
  const selectStepByIndex = (index: number) => {
    if (index < 0 || index >= allSteps.length) return;
    setSelectedStepIndex(index);
    setInspectedSlot(null);

    const targetStep = allSteps[index];
    if (targetStep?.boxName && targetStep.boxName !== activeBoxName) {
      setActiveBoxName(targetStep.boxName);
      setCurrentPage(1);
    }
  };

  // 下一个物料任务
  const handleSelectNext = () => {
    if (allSteps.length === 0) return;
    // 优先下一个未完成的
    const nextUnpicked = allSteps.findIndex(
      (s, idx) => idx > selectedStepIndex && !s.isPicked
    );
    if (nextUnpicked !== -1) {
      selectStepByIndex(nextUnpicked);
      return;
    }
    // 否则循环找全局未完成
    const globalUnpicked = allSteps.findIndex((s) => !s.isPicked);
    if (globalUnpicked !== -1 && globalUnpicked !== selectedStepIndex) {
      selectStepByIndex(globalUnpicked);
      return;
    }
    // 自然下一个
    const nextIdx = (selectedStepIndex + 1) % allSteps.length;
    selectStepByIndex(nextIdx);
  };

  // 上一个物料任务
  const handleSelectPrev = () => {
    if (allSteps.length === 0) return;
    const prevIdx = (selectedStepIndex - 1 + allSteps.length) % allSteps.length;
    selectStepByIndex(prevIdx);
  };

  // 7. 取料打卡并自动前进
  const handleToggleActiveStepPick = () => {
    if (!activeStep) return;
    const isCurrentlyPicked = activeStep.isPicked;
    const willPick = !isCurrentlyPicked;

    onTogglePick(activeStep.material.id, willPick);

    if (willPick) {
      const locStr = activeStep.slot
        ? `[${activeStep.boxName} ${activeStep.slot}]`
        : activeStep.boxName
        ? `[${activeStep.boxName}]`
        : '[待备料]';
      showToast(`✔ ${locStr} ${activeStep.material.name} 取料打卡成功！`, 'success');

      // 顺畅前往下一个未拣物料
      setTimeout(() => {
        handleSelectNext();
      }, 200);
    } else {
      showToast(`已撤销打卡标记`, 'info');
    }
  };

  // 点击抽屉格位反选左侧清单对应物料
  const handleSlotClick = (slotItem: BoxGridSlot) => {
    setInspectedSlot(slotItem);
    const matchedMat = slotToMaterialMap.get(slotItem.slot);
    if (matchedMat) {
      const idx = allSteps.findIndex((s) => String(s.material.id) === String(matchedMat.id));
      if (idx !== -1) {
        setSelectedStepIndex(idx);
      }
    }
  };

  // 键盘快捷键响应 (Space 打卡, Up/Down 上下一项, ESC 退出)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleActiveStepPick();
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        handleSelectNext();
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSelectPrev();
      } else if (e.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeStep, selectedStepIndex, allSteps]);

  if (!isOpen) return null;

  const totalDemandCount = allSteps.length;
  const totalPickedCount = allSteps.filter((s) => s.isPicked).length;
  const isAllPicked = totalDemandCount > 0 && totalPickedCount === totalDemandCount;
  const progressPercent =
    totalDemandCount > 0 ? Math.round((totalPickedCount / totalDemandCount) * 100) : 0;

  const cols = currentBoxConfig?.cols || 6;
  const totalPages = currentBoxConfig?.pages || 1;

  return (
    <div className="fixed inset-0 z-50 bg-canvas/95 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-150 select-none">
      {/* ================= 1. 顶部全局控制台 (Header) ================= */}
      <div className="h-14 px-4 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-accent text-white flex items-center justify-center font-bold shadow-xs">
            <Compass className="w-4 h-4 stroke-[2.5]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-text-main truncate">
                智能现场配料工作台: {projectName}
              </h2>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] bg-accent/15 text-accent border border-accent/30">
                x{targetQty}套 (板)
              </span>
            </div>
            <div className="text-[11px] font-mono text-text-muted mt-0.5 hidden sm:block">
              操作提示：按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">空格</kbd> 取料打卡并下一项，按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">↑ / ↓</kbd> 切换物料，按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">ESC</kbd> 退出
            </div>
          </div>
        </div>

        {/* 顶部中央：总体拣料进度看板 */}
        <div className="flex items-center gap-3 font-mono">
          <div className="text-right">
            <div className="text-xs font-bold text-text-muted">
              配料进度:{' '}
              <strong
                className={cn('text-sm font-black', isAllPicked ? 'text-emerald-600' : 'text-text-main')}
              >
                {totalPickedCount} / {totalDemandCount} ({progressPercent}%)
              </strong>
            </div>
          </div>
          <div className="w-28 sm:w-36 h-2.5 bg-subtle border border-border-subtle rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                isAllPicked ? 'bg-emerald-600' : 'bg-accent'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 右侧：全局控制与退出 */}
        <div className="flex items-center gap-2">
          {onBatchPickAll && (
            <button
              onClick={onBatchPickAll}
              className="px-2.5 py-1.5 text-xs font-bold bg-canvas hover:bg-subtle text-text-main border border-border-subtle rounded-[2px] hidden md:flex items-center gap-1.5 transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>一键标记全部完成</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] flex items-center gap-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>退出配料 (ESC)</span>
          </button>
        </div>
      </div>

      {/* ================= 2. 核心双栏联动作业区 (Split-View Workbench) ================= */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* ------------ 左栏：标准拣料任务清单 (Pick List) ------------ */}
        <div className="w-full md:w-[420px] lg:w-[480px] shrink-0 border-r border-border-subtle bg-surface/50 flex flex-col overflow-hidden">
          {/* 清单过滤与批量控制栏 */}
          <div className="p-3 bg-surface border-b border-border-subtle flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-black text-text-main mr-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-accent" />
                <span>拣料清单</span>
              </span>
              <span className="font-mono text-[11px] font-bold text-text-muted bg-canvas px-1.5 py-0.2 rounded border">
                {visibleSteps.length} 项
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs font-mono">
              <button
                onClick={() => setFilterMode('ALL')}
                className={cn(
                  'px-2 py-0.5 rounded-[2px] border text-[11px] font-bold transition-all',
                  filterMode === 'ALL'
                    ? 'bg-text-main text-surface border-text-main shadow-2xs'
                    : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main'
                )}
              >
                全部
              </button>
              <button
                onClick={() => setFilterMode('UNPICKED')}
                className={cn(
                  'px-2 py-0.5 rounded-[2px] border text-[11px] font-bold transition-all',
                  filterMode === 'UNPICKED'
                    ? 'bg-accent text-white border-accent shadow-2xs'
                    : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main'
                )}
              >
                待拣 ({allSteps.filter((s) => !s.isPicked).length})
              </button>
              <button
                onClick={() => setFilterMode('PICKED')}
                className={cn(
                  'px-2 py-0.5 rounded-[2px] border text-[11px] font-bold transition-all',
                  filterMode === 'PICKED'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main'
                )}
              >
                已齐 ({allSteps.filter((s) => s.isPicked).length})
              </button>
            </div>
          </div>

          {/* 清单列表主体 (按收纳盒物理动线分组) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {groupedSteps.map((grp) => {
              const grpItems = grp.items.filter((item) => {
                if (filterMode === 'UNPICKED') return !item.isPicked;
                if (filterMode === 'PICKED') return item.isPicked;
                return true;
              });

              if (grpItems.length === 0) return null;

              const isGrpCompleted = grp.pickedCount === grp.items.length;

              return (
                <div
                  key={grp.boxName}
                  className="border border-border-subtle/80 bg-surface rounded-[2px] overflow-hidden shadow-2xs"
                >
                  {/* 收纳盒分组表头 */}
                  <div className="px-3 py-1.5 bg-subtle/70 border-b border-border-subtle flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 font-bold text-text-main">
                      {grp.isUnassigned ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      ) : (
                        <Box className="w-3.5 h-3.5 text-accent" />
                      )}
                      <span>{grp.boxName}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px]">
                      <span
                        className={cn(
                          'font-black px-1.5 py-0.2 rounded-[2px]',
                          isGrpCompleted
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-accent/10 text-accent'
                        )}
                      >
                        {grp.pickedCount} / {grp.items.length} 齐
                      </span>
                    </div>
                  </div>

                  {/* 分组内具体物料行 */}
                  <div className="divide-y divide-border-subtle/50">
                    {grpItems.map((step) => {
                      const isActive = step.index === selectedStepIndex;
                      const isPicked = step.isPicked;

                      return (
                        <div
                          key={step.id}
                          onClick={() => selectStepByIndex(step.index)}
                          className={cn(
                            'p-2.5 flex items-start gap-2.5 cursor-pointer transition-all border-l-4 text-left',
                            isActive
                              ? 'bg-accent/[0.08] border-l-accent shadow-xs'
                              : isPicked
                              ? 'bg-canvas/50 border-l-emerald-600 opacity-60 hover:opacity-100 hover:bg-canvas'
                              : 'bg-surface border-l-transparent hover:bg-surface-hover'
                          )}
                        >
                          {/* 勾选框 */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePick(step.material.id, !isPicked);
                            }}
                            className={cn(
                              'mt-0.5 w-4 h-4 rounded-[2px] border flex items-center justify-center shrink-0 transition-colors',
                              isPicked
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-border-hover hover:border-accent bg-canvas'
                            )}
                            title={isPicked ? '标记为未取' : '标记为已取'}
                          >
                            {isPicked && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>

                          {/* 物料详情 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* 抽屉编号大工牌药丸 */}
                              {step.slot ? (
                                <span
                                  className={cn(
                                    'font-mono text-xs font-black px-1.5 py-0.2 rounded-[2px] border leading-none',
                                    isActive
                                      ? 'bg-accent text-white border-accent'
                                      : 'bg-canvas text-accent border-accent/40'
                                  )}
                                >
                                  {step.slot}
                                </span>
                              ) : !step.isUnassigned ? (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-[2px] bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                  散料
                                </span>
                              ) : (
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded-[2px] bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30">
                                  待料
                                </span>
                              )}

                              <span
                                className={cn(
                                  'text-sm font-black truncate',
                                  isPicked ? 'line-through text-text-muted' : 'text-text-main'
                                )}
                              >
                                {step.material.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-text-muted flex-wrap">
                              {step.material.package && (
                                <span className="px-1 py-0.2 bg-canvas border rounded-[2px]">
                                  {step.material.package}
                                </span>
                              )}
                              {step.material.designators && (
                                <span className="text-accent font-bold truncate max-w-[130px]">
                                  {step.material.designators}
                                </span>
                              )}
                              <span>存:{step.material.stockQty ?? 0}</span>
                            </div>
                          </div>

                          {/* 需取数量 */}
                          <div className="text-right shrink-0 font-mono">
                            <div className="text-xs text-text-muted font-bold">需取</div>
                            <div
                              className={cn(
                                'text-base font-black',
                                isPicked ? 'text-emerald-600' : 'text-accent'
                              )}
                            >
                              {step.material.demandQty}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ------------ 右栏：精准货位雷达与当前作业指示卡 (Location Radar & HUD) ------------ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
          {/* 1. HUD 正在取料行动卡片 (Current Pick Action Card) */}
          {activeStep && (
            <div className="p-4 bg-surface border-b border-border-subtle flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* 目标抽屉超大工牌 */}
                {activeStep.slot ? (
                  <div className="px-4 py-2 bg-accent text-white font-mono font-black rounded-[2px] shadow-sm tracking-tight flex items-center gap-2.5 shrink-0">
                    <Target className="w-7 h-7 stroke-[3]" />
                    <div className="leading-tight text-left">
                      <div className="text-2xl sm:text-3xl font-black">{activeStep.slot}</div>
                      <div className="text-[10px] font-bold opacity-85">
                        {activeStep.boxName} 抽屉
                      </div>
                    </div>
                  </div>
                ) : !activeStep.isUnassigned ? (
                  <div className="px-4 py-2 bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/40 font-mono font-black rounded-[2px] shadow-sm tracking-tight flex items-center gap-2.5 shrink-0">
                    <Box className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    <div className="leading-tight text-left">
                      <div className="text-xl font-black">盒内散料袋</div>
                      <div className="text-[10px] font-bold text-amber-800/80 dark:text-amber-400/80">
                        {activeStep.boxName}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-2 bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/40 font-mono font-black rounded-[2px] shadow-sm tracking-tight flex items-center gap-2.5 shrink-0">
                    <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                    <div className="leading-tight text-left">
                      <div className="text-xl font-black">暂未分配货位</div>
                      <div className="text-[10px] font-bold text-rose-700/80 dark:text-rose-400/80">
                        请在备料台查找
                      </div>
                    </div>
                  </div>
                )}

                {/* 物料详情与数量 */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-black px-1.5 py-0.2 bg-canvas border rounded-[2px] text-text-muted">
                      第 {selectedStepIndex + 1} / {allSteps.length} 项
                    </span>
                    <span className="text-lg sm:text-xl font-black text-text-main truncate">
                      {activeStep.material.name}
                    </span>
                    {activeStep.material.package && (
                      <span className="px-2 py-0.5 bg-canvas border border-border-subtle text-xs font-mono font-bold text-text-muted rounded-[2px]">
                        {activeStep.material.package}
                      </span>
                    )}
                    {activeStep.material.designators && (
                      <span className="text-xs font-mono font-bold text-accent px-2 py-0.5 bg-accent/10 border border-accent/25 rounded-[2px] truncate max-w-xs">
                        位号: {activeStep.material.designators}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-text-muted">
                    <span>
                      本次需取:{' '}
                      <strong className="text-lg text-accent font-black">
                        {activeStep.material.demandQty} 件
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      抽屉存量:{' '}
                      <strong className="text-text-main font-bold">
                        {activeStep.material.stockQty ?? 0} 件
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      所在收纳盒:{' '}
                      <strong className="text-text-main font-bold">
                        {activeStep.boxName || '待分配'}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* 右侧核心主行动按钮 */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSelectPrev}
                  className="p-2.5 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
                  title="上一项 (↑ / ←)"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>

                {/* 超大取料打卡与顺畅前进主按钮 */}
                <button
                  onClick={handleToggleActiveStepPick}
                  className={cn(
                    'px-5 py-2.5 text-sm font-black rounded-[2px] shadow-sm flex items-center gap-2 transition-all active:scale-95 border',
                    activeStep.isPicked
                      ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                      : 'bg-accent text-white border-accent hover:bg-accent-hover'
                  )}
                >
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>
                    {activeStep.isPicked
                      ? '✔ 此项已取 (按空格跳下一项)'
                      : '✔ 确认取出并下一项 ➔ (空格)'}
                  </span>
                </button>

                <button
                  onClick={handleSelectNext}
                  className="p-2.5 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
                  title="下一项 (↓ / →)"
                >
                  <ArrowDown className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
          )}

          {/* 2. 货位雷达透视条 (当前收纳盒信息与翻面) */}
          <div className="px-4 py-2 bg-surface/60 border-b border-border-subtle flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-muted flex items-center gap-1">
                <Box className="w-3.5 h-3.5" />
                <span>收纳柜货位雷达:</span>
              </span>
              <span className="font-mono text-xs font-black px-2 py-0.5 rounded-[2px] bg-canvas border border-border-subtle text-text-main">
                {activeBoxName || '未选定收纳盒'}
              </span>

              {/* 快速收纳盒切换 */}
              <div className="hidden lg:flex items-center gap-1 ml-2">
                {boxes.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => {
                      setActiveBoxName(b.name);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'px-2 py-0.5 text-[11px] font-mono rounded-[2px] border transition-all',
                      b.name === activeBoxName
                        ? 'bg-text-main text-surface border-text-main font-bold shadow-2xs'
                        : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main'
                    )}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 聚光灯防眩微调切换 */}
              <button
                onClick={() => setIsSpotlightMode(!isSpotlightMode)}
                className={cn(
                  'px-2 py-0.5 text-xs font-bold rounded-[2px] border transition-all flex items-center gap-1',
                  isSpotlightMode
                    ? 'bg-accent/10 border-accent/40 text-accent font-black'
                    : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main'
                )}
                title="开启聚光灯可使目标抽屉极高亮特写，消除大盘格子眩晕"
              >
                <Sparkles className="w-3 h-3" />
                <span className="text-[11px]">{isSpotlightMode ? '聚光灯聚焦 (防眩)' : '全盘亮灯'}</span>
              </button>

              {/* 双面翻转 */}
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
          </div>

          {/* 3. 2D 亚克力网格矩阵与散料特写舞台 */}
          <div className="flex-1 overflow-auto p-4 relative flex flex-col justify-start">
            {loadingGrid && (
              <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] flex items-center justify-center z-30">
                <div className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle rounded shadow-xs text-xs text-text-main font-bold">
                  <RefreshCw className="w-4 h-4 animate-spin text-accent" />
                  <span>正在投射收纳盒物理网格...</span>
                </div>
              </div>
            )}

            {/* 散料或无货位特写卡片 */}
            {activeStep && (activeStep.isLoose || activeStep.isUnassigned) ? (
              <div className="max-w-xl mx-auto my-auto w-full py-8 px-6 bg-surface border-2 border-border-subtle rounded-xs shadow-sm text-center animate-in fade-in zoom-in-95 duration-150">
                <div className="w-14 h-14 mx-auto rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-3 text-accent">
                  {activeStep.isUnassigned ? (
                    <AlertTriangle className="w-7 h-7 stroke-[2.2] text-amber-600" />
                  ) : (
                    <Package className="w-7 h-7 stroke-[2.2] text-accent" />
                  )}
                </div>

                <span className="inline-block px-3 py-1 font-mono text-xs font-black rounded-[2px] bg-subtle text-text-muted border border-border-subtle mb-2">
                  {activeStep.isUnassigned ? '未上架物料' : `收纳盒：${activeStep.boxName}`}
                </span>

                <h3 className="text-xl font-black text-text-main mb-2">
                  {activeStep.material.name}
                </h3>

                <div className="flex items-center justify-center gap-2 mb-5 font-mono text-xs text-text-muted flex-wrap">
                  {activeStep.material.package && (
                    <span className="px-2 py-0.5 bg-canvas border rounded-[2px] font-bold">
                      封装: {activeStep.material.package}
                    </span>
                  )}
                  {activeStep.material.designators && (
                    <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent font-bold rounded-[2px]">
                      位号: {activeStep.material.designators}
                    </span>
                  )}
                  <span className="px-2 py-0.5 bg-canvas border rounded-[2px] font-black text-text-main">
                    需取: <strong className="text-accent text-sm">{activeStep.material.demandQty}</strong> 件
                  </span>
                </div>

                <div className="p-3 bg-canvas border border-dashed border-border-subtle rounded-[2px] text-xs font-mono text-text-muted leading-relaxed max-w-md mx-auto mb-5 text-left">
                  {activeStep.isUnassigned ? (
                    <p className="text-amber-800 dark:text-amber-300 font-bold">
                      ⚠️ 此物料暂未登记具体存放货位。请在备料台查找现货，或记录为待采购缺料。取好后可直接按空格标记进入下一步。
                    </p>
                  ) : (
                    <p className="text-text-main font-bold">
                      💡 此物料存放于 <strong className="text-accent">【{activeStep.boxName}】</strong> 的盒内散料袋（无需拉抽屉）。请直接拉开收纳盒并寻找对应标牌的料袋。
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={handleToggleActiveStepPick}
                    className={cn(
                      'px-5 py-2.5 text-sm font-black rounded-[2px] shadow-sm flex items-center gap-2 transition-all active:scale-95 border',
                      activeStep.isPicked
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : 'bg-accent text-white border-accent hover:bg-accent-hover'
                    )}
                  >
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>
                      {activeStep.isPicked ? '✔ 此项已取 (空格前进)' : '✔ 取出散料并前往下一项 ➔ (空格)'}
                    </span>
                  </button>
                </div>
              </div>
            ) : gridData && gridData.grid.length > 0 ? (
              /* 2D 亚克力网格矩阵：当前工程需要的抽屉全部亮灯，当前物料高亮呼吸放大 */
              <div
                className="grid gap-2.5 transition-all pb-8 max-w-6xl mx-auto w-full"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(140px, 1fr))`,
                }}
              >
                {gridData.grid.map((slotItem) => {
                  const matchedMat = slotToMaterialMap.get(slotItem.slot);
                  const isCurrentActive =
                    activeStep &&
                    matchedMat &&
                    String(activeStep.material.id) === String(matchedMat.id);

                  let kittingStatus: 'SUFFICIENT' | 'SHORTAGE' | 'SUBSTITUTE' | 'FOCUSED' | null = null;
                  let kittingDemand = 0;
                  let isPicked = false;

                  if (matchedMat) {
                    kittingDemand = matchedMat.demandQty;
                    isPicked = !!checkedPicks[String(matchedMat.id)];
                    if (isCurrentActive) {
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

                  // 聚光灯防眩：当开启防眩且当前有焦点抽屉时，非焦点抽屉适当压暗；但属于当前工程的抽屉依然保留彩色光圈识别
                  const isGuidedDimmed = isSpotlightMode && kittingStatus !== 'FOCUSED';

                  return (
                    <AcrylicDrawerCell
                      key={slotItem.slot}
                      slotItem={slotItem}
                      isSelected={Boolean(isCurrentActive || inspectedSlot?.slot === slotItem.slot)}
                      isGuidedDimmed={isGuidedDimmed}
                      kittingStatus={kittingStatus}
                      kittingDemand={kittingDemand}
                      isPicked={isPicked}
                      onClick={() => handleSlotClick(slotItem)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="my-auto flex flex-col items-center justify-center text-text-muted text-sm py-20">
                <Box className="w-12 h-12 stroke-[1.2] mb-3 opacity-40" />
                <span>当前收纳柜暂未配置网格抽屉</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

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
  Check,
  RefreshCw,
  Box,
  ShoppingCart,
  X,
  Target,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Eye,
  Compass,
  MapPin,
  Package,
  RotateCcw,
  CheckSquare,
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

export interface WizardStep {
  id: string | number;
  index: number;
  material: KittingMaterial;
  boxName: string;
  slot: string | null;
  isLoose: boolean;
  isUnassigned: boolean;
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

  // 向导当前步进索引 (0 到 wizardSteps.length - 1)
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [inspectedSlot, setInspectedSlot] = useState<BoxGridSlot | null>(null);

  // 防眩晕模式：默认为 true（聚光灯模式，非目标抽屉压暗虚化）
  const [isSpotlightMode, setIsSpotlightMode] = useState<boolean>(true);

  // 1. 获取所有收纳盒元数据
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

  // 2. 构建最优物理动线配料向导队列 (同柜连续作业，先抽屉再散料，最后未入库)
  const wizardSteps = useMemo<WizardStep[]>(() => {
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
      };
    });

    // 物理动线排序：
    // a. 已分配货位的优先，未分配货位的排在最后
    // b. 按柜名聚类（保证同一柜子的料一次性拿完，不来回跑）
    // c. 同柜内，有具体抽屉的在前，散料在后
    // d. 抽屉编号自然排序
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
  }, [materials, boxes]);

  // 3. 统计各收纳盒用料进度
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

  // 当前激活的向导步骤
  const currentStep = wizardSteps[currentStepIndex] || wizardSteps[0] || null;

  // 4. 打开弹窗或队列加载时，定位到第一个未打卡物料所在的位置
  useEffect(() => {
    if (isOpen && wizardSteps.length > 0) {
      const firstUnpickedIdx = wizardSteps.findIndex((s) => !checkedPicks[String(s.material.id)]);
      const targetIdx = firstUnpickedIdx !== -1 ? firstUnpickedIdx : 0;
      setCurrentStepIndex(targetIdx);

      const step = wizardSteps[targetIdx];
      if (step?.boxName) {
        setActiveBoxName(step.boxName);
      } else if (boxes.length > 0) {
        setActiveBoxName(boxes[0].name);
      }
    }
  }, [isOpen, wizardSteps.length]);

  // 关闭时重置状态
  useEffect(() => {
    if (!isOpen) {
      setActiveBoxName('');
      setCurrentStepIndex(0);
      setInspectedSlot(null);
    }
  }, [isOpen]);

  // 5. 加载当前收纳盒网格数据
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

  // 6. 建立格位 -> 物料映射
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

  // 7. 导航步进跳转（核心：联动自动平滑切柜，杜绝死锁与旧柜停留发懵）
  const jumpToStep = (index: number) => {
    if (index < 0 || index >= wizardSteps.length) return;
    const targetStep = wizardSteps[index];
    setCurrentStepIndex(index);
    setInspectedSlot(null);

    // 检查是否需要跨柜切换
    if (targetStep?.boxName && targetStep.boxName !== activeBoxName) {
      setActiveBoxName(targetStep.boxName);
      setCurrentPage(1);
      showToast(`🚀 已为您自动导航至收纳柜：【${targetStep.boxName}】`, 'info');
    }
  };

  // 下一步向导
  const handleNextStep = () => {
    if (wizardSteps.length === 0) return;

    // 1. 优先寻找后面的下一个未打卡步骤
    const nextUnpicked = wizardSteps.findIndex(
      (s, idx) => idx > currentStepIndex && !checkedPicks[String(s.material.id)]
    );
    if (nextUnpicked !== -1) {
      jumpToStep(nextUnpicked);
      return;
    }

    // 2. 从头查找全局未打卡步骤
    const globalUnpicked = wizardSteps.findIndex((s) => !checkedPicks[String(s.material.id)]);
    if (globalUnpicked !== -1 && globalUnpicked !== currentStepIndex) {
      jumpToStep(globalUnpicked);
      return;
    }

    // 3. 若全部已打卡，则自然顺序循环
    const nextIdx = (currentStepIndex + 1) % wizardSteps.length;
    jumpToStep(nextIdx);
  };

  // 上一步向导
  const handlePrevStep = () => {
    if (wizardSteps.length === 0) return;
    const prevIdx = (currentStepIndex - 1 + wizardSteps.length) % wizardSteps.length;
    jumpToStep(prevIdx);
  };

  // 打卡当前步骤并顺畅前进
  const handleToggleCurrentStep = () => {
    if (!currentStep) return;
    const mat = currentStep.material;
    const isCurrentlyPicked = !!checkedPicks[String(mat.id)];
    const willPick = !isCurrentlyPicked;

    onTogglePick(mat.id, willPick);

    if (willPick) {
      const locDesc = currentStep.slot
        ? `[${currentStep.boxName} ${currentStep.slot}]`
        : currentStep.boxName
        ? `[${currentStep.boxName}]`
        : '[待备料]';
      showToast(`✔ ${locDesc} ${mat.name} 已取料！`, 'success');

      // 自动顺畅前进到下一步，绝不卡顿
      setTimeout(() => {
        handleNextStep();
      }, 220);
    } else {
      showToast(`已撤销打卡标记`, 'info');
    }
  };

  // 点击抽屉格位
  const handleSlotClick = (slotItem: BoxGridSlot) => {
    setInspectedSlot(slotItem);
    const matchedMat = slotToMaterialMap.get(slotItem.slot);
    if (matchedMat) {
      const idx = wizardSteps.findIndex((s) => String(s.material.id) === String(matchedMat.id));
      if (idx !== -1) {
        setCurrentStepIndex(idx);
      }
    }
  };

  // 手动点击收纳盒药丸切换
  const handleSelectBox = (boxName: string) => {
    setActiveBoxName(boxName);
    setCurrentPage(1);
    setInspectedSlot(null);

    // 自动对齐该收纳盒中的第一个物料
    const matchedStepIdx = wizardSteps.findIndex(
      (s) => s.boxName === boxName && !checkedPicks[String(s.material.id)]
    );
    if (matchedStepIdx !== -1) {
      setCurrentStepIndex(matchedStepIdx);
    } else {
      const anyInBox = wizardSteps.findIndex((s) => s.boxName === boxName);
      if (anyInBox !== -1) {
        setCurrentStepIndex(anyInBox);
      }
    }
  };

  // 键盘快捷键 (空格打卡并下一步, 左右箭头切换, ESC退出)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleCurrentStep();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNextStep();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrevStep();
      } else if (e.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, checkedPicks]);

  if (!isOpen) return null;

  const cols = currentBoxConfig?.cols || 6;
  const totalPages = currentBoxConfig?.pages || 1;

  const totalDemandCount = materials.length;
  const totalPickedCount = materials.filter((m) => checkedPicks[String(m.id)]).length;
  const isAllPicked = totalDemandCount > 0 && totalPickedCount === totalDemandCount;
  const isCurrentPicked = currentStep ? !!checkedPicks[String(currentStep.material.id)] : false;

  return (
    <div className="fixed inset-0 z-50 bg-canvas/95 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200 select-none">
      {/* 1. 顶部全局控制条：工程标题 + 总体进度 + 聚光灯防眩开关 + 退出 */}
      <div className="h-14 px-4 bg-surface border-b border-border-subtle flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-accent text-white flex items-center justify-center font-bold">
            <Compass className="w-4 h-4 stroke-[2.5]" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-text-main truncate">
                向导式配料导航: {projectName}
              </h2>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] bg-accent/15 text-accent border border-accent/30">
                x{targetQty}套
              </span>
            </div>
            <div className="text-[11px] font-mono text-text-muted mt-0.5 hidden sm:block">
              按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">空格</kbd> 取料打卡并下一步，按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">← / →</kbd> 切换步骤，按 <kbd className="px-1 py-0.2 bg-canvas border rounded text-text-main font-bold">ESC</kbd> 退出
            </div>
          </div>
        </div>

        {/* 顶部中央：总体配料进度仪表 */}
        <div className="hidden md:flex items-center gap-3 font-mono">
          <div className="text-right">
            <div className="text-xs font-bold text-text-muted">
              配料进度:{' '}
              <strong className={cn('text-sm font-black', isAllPicked ? 'text-emerald-600' : 'text-text-main')}>
                {totalPickedCount} / {totalDemandCount}
              </strong>
            </div>
          </div>
          <div className="w-32 h-2 bg-subtle border border-border-subtle rounded-full overflow-hidden">
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

        {/* 右侧：聚光灯防眩模式切换 + 退出 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSpotlightMode(!isSpotlightMode)}
            className={cn(
              'px-2.5 py-1 text-xs font-bold rounded-[2px] border transition-all flex items-center gap-1.5',
              isSpotlightMode
                ? 'bg-accent/10 border-accent/40 text-accent font-black shadow-xs'
                : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main'
            )}
            title="开启聚光灯模式可大幅压暗无关抽屉，消除大盘格子带来的视觉眩晕"
          >
            <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">{isSpotlightMode ? '🎯 聚光灯防眩 (已开启)' : '🌐 全局鸟瞰模式'}</span>
            <span className="sm:hidden">{isSpotlightMode ? '聚光灯' : '鸟瞰'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-bold bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] flex items-center gap-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">退出 (ESC)</span>
          </button>
        </div>
      </div>

      {/* 2. 核心向导流水线横向指示条 (Wizard Route Stepper Bar) */}
      <div className="px-4 py-2 bg-canvas border-b border-border-subtle flex items-center gap-2 overflow-x-auto shrink-0 shadow-2xs">
        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider shrink-0 flex items-center gap-1">
          <MapPin className="w-3 h-3 text-accent" />
          <span>路线向导:</span>
        </span>

        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {wizardSteps.map((step, idx) => {
            const isCurrent = idx === currentStepIndex;
            const isPicked = !!checkedPicks[String(step.material.id)];

            return (
              <button
                key={step.id}
                onClick={() => jumpToStep(idx)}
                className={cn(
                  'px-2.5 py-1 text-xs font-mono font-bold rounded-[2px] border transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap',
                  isCurrent
                    ? 'bg-accent text-white border-accent shadow-xs scale-102 z-10'
                    : isPicked
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-surface text-text-muted border-border-subtle hover:text-text-main hover:border-border-hover'
                )}
                title={`第 ${idx + 1} 步: [${step.boxName || '待备料'}] ${step.material.name}`}
              >
                <span className={cn('text-[10px]', isCurrent ? 'text-white' : 'opacity-70')}>
                  {idx + 1}.
                </span>
                {isPicked ? (
                  <Check className="w-3 h-3 stroke-[3] text-emerald-600 dark:text-emerald-400" />
                ) : step.slot ? (
                  <span className={cn('font-black', isCurrent ? 'text-white' : 'text-text-main')}>
                    {step.slot}
                  </span>
                ) : (
                  <span className="text-[10px] opacity-80">{step.boxName || '待料'}</span>
                )}
                <span className={cn('truncate max-w-[90px] text-[11px]', isCurrent ? 'text-white' : 'text-text-muted')}>
                  {step.material.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 巨幅任务聚焦看板 (Big Spotlight HUD Card) */}
      {currentStep && (
        <div className="px-4 py-3 bg-surface/95 border-b-2 border-accent/40 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* 目标抽屉超大工牌 */}
            {currentStep.slot ? (
              <div className="px-4 py-2 bg-accent text-white font-mono font-black rounded-[2px] shadow-sm tracking-tight flex items-center gap-2.5 shrink-0">
                <Target className="w-7 h-7 stroke-[3]" />
                <div className="leading-tight text-left">
                  <div className="text-2xl sm:text-3xl font-black">{currentStep.slot}</div>
                  <div className="text-[11px] font-bold opacity-85">{currentStep.boxName} 抽屉</div>
                </div>
              </div>
            ) : !currentStep.isUnassigned ? (
              <div className="px-4 py-2 bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/40 font-mono font-black rounded-[2px] shadow-sm tracking-tight flex items-center gap-2.5 shrink-0">
                <Box className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                <div className="leading-tight text-left">
                  <div className="text-lg sm:text-xl font-black">盒内散料袋</div>
                  <div className="text-[10px] font-bold text-amber-800/80 dark:text-amber-400/80">
                    {currentStep.boxName}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/40 font-mono font-black rounded-[2px] shadow-sm tracking-tight flex items-center gap-2.5 shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                <div className="leading-tight text-left">
                  <div className="text-lg font-black">暂未分配货位</div>
                  <div className="text-[10px] font-bold text-rose-700/80 dark:text-rose-400/80">
                    请到备料台/采购
                  </div>
                </div>
              </div>
            )}

            {/* 物料详情与操作提示 */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-black px-1.5 py-0.2 bg-canvas border rounded-[2px] text-text-muted">
                  第 {currentStepIndex + 1} / {wizardSteps.length} 步
                </span>
                <span className="text-lg sm:text-xl font-black text-text-main truncate">
                  {currentStep.material.name}
                </span>
                {currentStep.material.package && (
                  <span className="px-2 py-0.5 bg-canvas border border-border-subtle text-xs font-mono font-bold text-text-muted rounded-[2px]">
                    {currentStep.material.package}
                  </span>
                )}
                {currentStep.material.designators && (
                  <span className="text-xs font-mono font-bold text-accent px-2 py-0.5 bg-accent/10 border border-accent/25 rounded-[2px] truncate max-w-xs">
                    位号: {currentStep.material.designators}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-xs font-mono text-text-muted">
                <span>
                  本次需取:{' '}
                  <strong className="text-lg text-accent font-black">
                    {currentStep.material.demandQty} 件
                  </strong>
                </span>
                <span>·</span>
                <span>
                  存量:{' '}
                  <strong className="text-text-main font-bold">
                    {currentStep.material.stockQty ?? 0} 件
                  </strong>
                </span>
                <span>·</span>
                <span>
                  位置:{' '}
                  <strong className="text-text-main font-bold">
                    {currentStep.boxName || '待分配'} {currentStep.slot ? `(${currentStep.slot})` : ''}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* 右侧核心向导操作组 (大号主行动按钮) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrevStep}
              className="p-2.5 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
              title="上一步 (←)"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
            </button>

            {/* 超大向导打卡与自动下一步行动按钮 */}
            <button
              onClick={handleToggleCurrentStep}
              className={cn(
                'px-5 py-2.5 text-sm font-black rounded-[2px] shadow-sm flex items-center gap-2 transition-all active:scale-95 border',
                isCurrentPicked
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-accent text-white border-accent hover:bg-accent-hover'
              )}
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>
                {isCurrentPicked
                  ? '✔ 此项已取 (按空格前往下一步)'
                  : '✔ 取料打卡并前往下一步 ➔ (空格)'}
              </span>
            </button>

            <button
              onClick={handleNextStep}
              className="p-2.5 bg-canvas hover:bg-subtle text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] transition-colors"
              title="下一步 (→)"
            >
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* 4. 收纳柜切换药丸栏 (支持多柜手动切换与面数翻转) */}
      <div className="px-4 py-1.5 bg-surface/50 border-b border-border-subtle flex items-center justify-between gap-2 overflow-x-auto shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-text-muted mr-1">收纳柜:</span>
          {boxes.map((b) => {
            const stat = boxStats[b.name];
            const demandCount = stat?.totalDemandItems || 0;
            const isSelected = b.name === activeBoxName;
            return (
              <button
                key={b.id || b.name}
                onClick={() => handleSelectBox(b.name)}
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

      {/* 5. 核心沙盘主舞台：根据当前向导类型自适应展示 (防眩晕特写) */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 relative flex flex-col justify-start">
        {loadingGrid && (
          <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] flex items-center justify-center z-30">
            <div className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle rounded shadow-xs text-xs sm:text-sm text-text-main font-bold">
              <RefreshCw className="w-4 h-4 animate-spin text-accent" />
              <span>正在投射收纳柜网格...</span>
            </div>
          </div>
        )}

        {/* 模式 A：如果是盒内散料袋或未上架，呈现清爽利落的特写特展工牌，绝不展示空网格 */}
        {currentStep && (currentStep.isLoose || currentStep.isUnassigned) ? (
          <div className="max-w-2xl mx-auto my-auto w-full py-8 px-6 bg-surface border-2 border-border-subtle rounded-xs shadow-sm text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 text-accent">
              {currentStep.isUnassigned ? (
                <AlertTriangle className="w-8 h-8 stroke-[2.2] text-amber-600" />
              ) : (
                <Package className="w-8 h-8 stroke-[2.2] text-accent" />
              )}
            </div>

            <span className="inline-block px-3 py-1 font-mono text-xs font-black rounded-[2px] bg-subtle text-text-muted border border-border-subtle mb-3">
              {currentStep.isUnassigned ? '未上架物料' : `收纳盒：${currentStep.boxName}`}
            </span>

            <h3 className="text-xl sm:text-2xl font-black text-text-main mb-2">
              {currentStep.material.name}
            </h3>

            <div className="flex items-center justify-center gap-2 mb-6 font-mono text-sm text-text-muted flex-wrap">
              {currentStep.material.package && (
                <span className="px-2 py-0.5 bg-canvas border rounded-[2px] font-bold">
                  封装: {currentStep.material.package}
                </span>
              )}
              {currentStep.material.designators && (
                <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent font-bold rounded-[2px]">
                  位号: {currentStep.material.designators}
                </span>
              )}
              <span className="px-2 py-0.5 bg-canvas border rounded-[2px] font-black text-text-main">
                需取: <strong className="text-accent text-base">{currentStep.material.demandQty}</strong> 件
              </span>
            </div>

            <div className="p-4 bg-canvas border border-dashed border-border-subtle rounded-[2px] text-xs font-mono text-text-muted leading-relaxed max-w-md mx-auto mb-6 text-left">
              {currentStep.isUnassigned ? (
                <p className="text-amber-800 dark:text-amber-300 font-bold">
                  ⚠️ 此物料暂未登记具体存放货位。请在备料台查找现货，或记录为待采购缺料。取好后可直接按空格标记进入下一步。
                </p>
              ) : (
                <p className="text-text-main font-bold">
                  💡 此物料存放于 <strong className="text-accent">【{currentStep.boxName}】</strong> 的盒内散料袋（无需拉抽屉）。请直接拉开收纳盒并寻找对应标牌的料袋。
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleToggleCurrentStep}
                className={cn(
                  'px-6 py-3 text-sm font-black rounded-[2px] shadow-sm flex items-center gap-2 transition-all active:scale-95 border',
                  isCurrentPicked
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                    : 'bg-accent text-white border-accent hover:bg-accent-hover'
                )}
              >
                <Check className="w-5 h-5 stroke-[3]" />
                <span>
                  {isCurrentPicked ? '✔ 此项已取 (按空格前进)' : '✔ 取出散料并前往下一步 ➔ (空格)'}
                </span>
              </button>
            </div>
          </div>
        ) : gridData && gridData.grid.length > 0 ? (
          /* 模式 B：抽屉网格矩阵 (带有聚光灯防眩压暗与目标呼吸高亮) */
          <div
            className="grid gap-3 transition-all pb-12 max-w-7xl mx-auto w-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(160px, 1fr))`,
            }}
          >
            {gridData.grid.map((slotItem) => {
              const matchedMat = slotToMaterialMap.get(slotItem.slot);
              const isTargetStep =
                currentStep &&
                matchedMat &&
                String(currentStep.material.id) === String(matchedMat.id);

              let kittingStatus: 'SUFFICIENT' | 'SHORTAGE' | 'SUBSTITUTE' | 'FOCUSED' | null = null;
              let kittingDemand = 0;
              let isPicked = false;

              if (matchedMat) {
                kittingDemand = matchedMat.demandQty;
                isPicked = !!checkedPicks[String(matchedMat.id)];
                if (isTargetStep) {
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

              // 核心聚光灯防眩晕模式：非焦点抽屉一律深度虚化压暗
              const isGuidedDimmed = isSpotlightMode && kittingStatus !== 'FOCUSED';
              const isSearchDimmed = !isSpotlightMode && !matchedMat && materials.length > 0;

              return (
                <AcrylicDrawerCell
                  key={slotItem.slot}
                  slotItem={slotItem}
                  isSelected={Boolean(isTargetStep || inspectedSlot?.slot === slotItem.slot)}
                  isGuidedDimmed={isGuidedDimmed}
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
          <div className="my-auto flex flex-col items-center justify-center text-text-muted text-sm py-20">
            <Box className="w-12 h-12 stroke-[1.2] mb-3 opacity-40" />
            <span>当前收纳柜暂未配置网格抽屉</span>
          </div>
        )}
      </div>
    </div>
  );
};

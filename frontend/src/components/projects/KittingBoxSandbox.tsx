import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface KittingMaterial {
  id: string | number;
  componentId?: number | null;
  name: string;
  package?: string;
  value?: string;
  location?: string;
  demandQty: number;
  stockQty?: number;
  status?: 'SUFFICIENT' | 'SHORTAGE' | 'SUBSTITUTE' | 'READY' | 'PARTIAL' | string;
  designators?: string;
  isPicked?: boolean;
}

export interface KittingShortageItem {
  name: string;
  package?: string;
  shortageQty: number;
  lcsc?: string;
}

interface KittingBoxSandboxProps {
  materials: KittingMaterial[];
  focusedMaterialId?: string | number | null;
  onSelectMaterial?: (materialId: string | number) => void;
  onTogglePicked?: (materialId: string | number, nextPicked: boolean) => void;
  shortages?: KittingShortageItem[];
  onNavigateToBoxManagement?: (boxName: string) => void;
}

export const KittingBoxSandbox: React.FC<KittingBoxSandboxProps> = ({
  materials,
  focusedMaterialId,
  onSelectMaterial,
  onTogglePicked,
  shortages = [],
  onNavigateToBoxManagement,
}) => {
  const { showToast } = useToastStore();

  const [boxes, setBoxes] = useState<StorageBoxSummary[]>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [activeBoxName, setActiveBoxName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [gridData, setGridData] = useState<BoxGridResponseData | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  // 就地抽屉打卡卡片状态
  const [inspectedSlot, setInspectedSlot] = useState<BoxGridSlot | null>(null);
  const [copiedLcsc, setCopiedLcsc] = useState(false);
  const [shortageTrayOpen, setShortageTrayOpen] = useState(false);

  // 1. 获取所有物理收纳盒
  const fetchBoxes = async () => {
    setLoadingBoxes(true);
    try {
      const res = await boxApi.getStorageBoxes();
      if (res.success && res.data && res.data.length > 0) {
        setBoxes(res.data);
      }
    } catch (err: any) {
      console.error('获取收纳盒列表失败:', err);
    } finally {
      setLoadingBoxes(false);
    }
  };

  useEffect(() => {
    fetchBoxes();
  }, []);

  // 2. 统计每个收纳盒在当前物料清单中的需求数量及分布
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

      // 匹配是哪个盒子
      const matchedBox = boxes.find(
        (b) => loc.startsWith(b.name) || loc.includes(b.name) || (boxes.length === 1)
      );

      const targetBoxName = matchedBox ? matchedBox.name : boxes[0]?.name;
      if (targetBoxName) {
        if (!stats[targetBoxName]) {
          stats[targetBoxName] = { totalDemandItems: 0, pickedCount: 0, matchedMaterials: [] };
        }
        stats[targetBoxName].totalDemandItems++;
        if (mat.isPicked) {
          stats[targetBoxName].pickedCount++;
        }
        stats[targetBoxName].matchedMaterials.push(mat);
      }
    });

    return stats;
  }, [boxes, materials]);

  // 3. 初始自动选中最活跃的收纳盒（需求最多的那个，或者第一个）
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

  // 4. 当外部聚焦物料变化时，沙盘智能联动切换收纳盒与抽屉
  useEffect(() => {
    if (!focusedMaterialId || materials.length === 0 || boxes.length === 0) return;

    const focusedMat = materials.find((m) => String(m.id) === String(focusedMaterialId));
    if (!focusedMat || !focusedMat.location) return;

    const loc = focusedMat.location.trim();
    const targetBox = boxes.find((b) => loc.startsWith(b.name) || loc.includes(b.name));
    if (targetBox && targetBox.name !== activeBoxName) {
      setActiveBoxName(targetBox.name);
      setCurrentPage(1);
    }
  }, [focusedMaterialId, materials, boxes]);

  // 5. 加载当前收纳盒的网格数据
  const fetchGrid = async (boxName: string, page: number) => {
    if (!boxName) return;
    setLoadingGrid(true);
    try {
      const res = await boxApi.getBoxGrid(boxName, page);
      if (res.success && res.data) {
        setGridData(res.data);
      }
    } catch (err: any) {
      console.error('加载收纳柜沙盘网格失败:', err);
    } finally {
      setLoadingGrid(false);
    }
  };

  useEffect(() => {
    if (activeBoxName) {
      fetchGrid(activeBoxName, currentPage);
    }
  }, [activeBoxName, currentPage]);

  // 6. 获取当前盒子配置
  const currentBoxConfig = useMemo(() => {
    return boxes.find((b) => b.name === activeBoxName) || boxes[0] || null;
  }, [boxes, activeBoxName]);

  // 7. 建立快速抽屉映射表：格位 -> 物料列表
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
          if (loc.endsWith(slotItem.slot) || loc.includes(` ${slotItem.slot}`) || loc.includes(`-${slotItem.slot}`)) {
            map.set(slotItem.slot, mat);
            return;
          }
        }
      }
    });

    return map;
  }, [materials, gridData]);

  // 8. 当前聚焦的物料信息
  const focusedMat = useMemo(() => {
    return materials.find((m) => String(m.id) === String(focusedMaterialId)) || null;
  }, [materials, focusedMaterialId]);

  // 9. 抽屉点击处理
  const handleCellClick = (slotItem: BoxGridSlot) => {
    setInspectedSlot(slotItem);
    const matchedMat = slotToMaterialMap.get(slotItem.slot);
    if (matchedMat && onSelectMaterial) {
      onSelectMaterial(matchedMat.id);
    }
  };

  // 10. 取料打卡切换
  const handleTogglePickCurrent = () => {
    if (!inspectedSlot) return;
    const matchedMat = slotToMaterialMap.get(inspectedSlot.slot);
    if (!matchedMat || !onTogglePicked) return;

    const nextPicked = !matchedMat.isPicked;
    onTogglePicked(matchedMat.id, nextPicked);
    showToast(nextPicked ? `✔ 已在抽屉 [${inspectedSlot.slot}] 取料打卡！` : `已撤销 [${inspectedSlot.slot}] 取料打卡`, 'info');
  };

  // 11. 快速寻料向导：定位下一个未取的抽屉
  const handleJumpToNextUnpicked = () => {
    if (!gridData) return;
    for (const slotItem of gridData.grid) {
      const mat = slotToMaterialMap.get(slotItem.slot);
      if (mat && !mat.isPicked) {
        setInspectedSlot(slotItem);
        if (onSelectMaterial) onSelectMaterial(mat.id);
        showToast(`已平滑定位到待取抽屉：[${slotItem.slot}] ${mat.name}`, 'info');
        return;
      }
    }
    showToast('🎉 当前柜所需元器件已全部取料打卡完成！', 'success');
  };

  // 12. 复制缺料立创编号
  const handleCopyLcscCodes = () => {
    const lcscList = shortages.map((s) => s.lcsc).filter(Boolean);
    if (lcscList.length === 0) {
      showToast('暂无立创商城编号可复制', 'info');
      return;
    }
    navigator.clipboard.writeText(lcscList.join('\n'));
    setCopiedLcsc(true);
    showToast(`已复制 ${lcscList.length} 条立创编号到剪贴板`, 'success');
    setTimeout(() => setCopiedLcsc(false), 2000);
  };

  const cols = currentBoxConfig?.cols || 5;
  const totalPages = currentBoxConfig?.pages || 1;

  // 计算当前柜的取料概况
  const currentBoxStat = boxStats[activeBoxName] || { totalDemandItems: 0, pickedCount: 0 };

  return (
    <div className="h-full flex flex-col bg-canvas border border-border-subtle rounded-none select-none relative overflow-hidden">
      {/* 1. 顶部控制栏：收纳柜药丸切换 + 寻料打卡进度 */}
      <div className="px-3 py-2 bg-surface border-b border-border-subtle flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <div className="flex items-center gap-1 text-xs font-black text-text-main tracking-tight uppercase shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>2D 实体寻料沙盘</span>
          </div>

          {/* 收纳盒分段标签 */}
          <div className="flex items-center gap-1">
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
                    'px-2 py-0.5 text-xs font-mono font-bold rounded-[2px] border transition-all flex items-center gap-1 shrink-0',
                    isSelected
                      ? 'bg-text-main text-surface border-text-main shadow-xs'
                      : 'bg-canvas text-text-muted border-border-subtle hover:text-text-main hover:border-border-hover'
                  )}
                >
                  <Box className="w-3 h-3" />
                  <span>{b.name}</span>
                  {demandCount > 0 && (
                    <span
                      className={cn(
                        'text-[10px] px-1 rounded-xs font-black',
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
        </div>

        {/* 右侧：下一件寻料与物理收纳跳转 */}
        <div className="flex items-center gap-1.5 ml-auto">
          {currentBoxStat.totalDemandItems > 0 && (
            <button
              onClick={handleJumpToNextUnpicked}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded-[2px] transition-colors"
              title="自动寻料：平滑聚焦到下一个未打卡抽屉"
            >
              <Sparkles className="w-3 h-3 text-accent" />
              <span>下个待取</span>
            </button>
          )}

          {totalPages > 1 && (
            <div className="flex items-center gap-1 font-mono text-xs border border-border-subtle rounded-[2px] px-1 bg-canvas">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-0.5 text-text-muted hover:text-text-main disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="font-bold text-[11px]">
                {currentPage}/{totalPages}面
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

          {onNavigateToBoxManagement && (
            <button
              onClick={() => onNavigateToBoxManagement(activeBoxName)}
              className="p-1 text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] hover:bg-surface-hover"
              title="在物理收纳中全屏管理"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. 主区域：2D 亚克力网格矩阵 */}
      <div className="flex-1 overflow-auto p-3 relative flex flex-col justify-between">
        {loadingGrid && (
          <div className="absolute inset-0 bg-surface/50 backdrop-blur-[1px] flex items-center justify-center z-30">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border-subtle rounded shadow-xs text-xs text-text-main font-bold">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
              <span>透视亚克力抽屉矩阵...</span>
            </div>
          </div>
        )}

        {gridData && gridData.grid.length > 0 ? (
          <div
            className="grid gap-2 transition-all pb-24"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(130px, 1fr))`,
            }}
          >
            {gridData.grid.map((slotItem) => {
              const matchedMat = slotToMaterialMap.get(slotItem.slot);
              const isFocused =
                inspectedSlot?.slot === slotItem.slot ||
                (focusedMat && matchedMat && String(focusedMat.id) === String(matchedMat.id));

              let kittingStatus: 'SUFFICIENT' | 'SHORTAGE' | 'SUBSTITUTE' | 'FOCUSED' | null = null;
              let kittingDemand = 0;
              let isPicked = false;

              if (matchedMat) {
                kittingDemand = matchedMat.demandQty;
                isPicked = !!matchedMat.isPicked;
                if (isFocused) {
                  kittingStatus = 'FOCUSED';
                } else if (matchedMat.status === 'SHORTAGE' || (matchedMat.stockQty || 0) < matchedMat.demandQty) {
                  kittingStatus = 'SHORTAGE';
                } else if (matchedMat.status === 'SUBSTITUTE') {
                  kittingStatus = 'SUBSTITUTE';
                } else {
                  kittingStatus = 'SUFFICIENT';
                }
              }

              // 未被此 BOM/工程用到的格子做轻微置灰，衬托出亮灯效果
              const isSearchDimmed = !matchedMat && materials.length > 0;

              return (
                <AcrylicDrawerCell
                  key={slotItem.slot}
                  slotItem={slotItem}
                  isSelected={Boolean(isFocused)}
                  isSearchDimmed={isSearchDimmed}
                  kittingStatus={kittingStatus}
                  kittingDemand={kittingDemand}
                  isPicked={isPicked}
                  onClick={() => handleCellClick(slotItem)}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-xs p-6">
            <Box className="w-8 h-8 stroke-[1.5] mb-2 opacity-40" />
            <span>当前收纳柜暂未配置格位网格</span>
          </div>
        )}

        {/* 3. 悬浮底卡：就地抽屉打卡与取件卡片 (点击抽屉即弹出) */}
        {inspectedSlot && (
          <div className="absolute bottom-2 left-2 right-2 bg-surface border-2 border-border-hover rounded-[2px] shadow-lg p-3 z-40 animate-in slide-in-from-bottom duration-150">
            {(() => {
              const comp = inspectedSlot.components[0];
              const matchedMat = slotToMaterialMap.get(inspectedSlot.slot);

              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="px-2 py-1 bg-accent/15 text-accent border border-accent/30 font-mono font-black text-sm rounded-[2px] shrink-0">
                      {inspectedSlot.slot}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-text-main truncate">
                          {comp ? comp.name : '空抽屉'}
                        </span>
                        {comp?.package && (
                          <span className="px-1.5 py-0.2 bg-canvas border border-border-subtle text-[11px] font-mono text-text-muted rounded-[2px]">
                            {comp.package}
                          </span>
                        )}
                        {comp?.value && (
                          <span className="font-mono text-xs font-bold text-text-muted">
                            {comp.value}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1 text-xs font-mono text-text-muted">
                        <span>
                          盒内存量:{' '}
                          <strong className="text-text-main font-bold">
                            {comp ? comp.quantity : 0} 件
                          </strong>
                        </span>
                        {matchedMat && (
                          <>
                            <span className="text-border-subtle">|</span>
                            <span>
                              本次工程需:{' '}
                              <strong className="text-accent font-black">
                                {matchedMat.demandQty} 件
                              </strong>
                            </span>
                            {matchedMat.designators && (
                              <>
                                <span className="text-border-subtle">|</span>
                                <span className="truncate max-w-[140px]" title={matchedMat.designators}>
                                  位号: {matchedMat.designators}
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 核心操作按钮 */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    {matchedMat ? (
                      <button
                        onClick={handleTogglePickCurrent}
                        className={cn(
                          'px-3.5 py-1.5 text-xs font-black rounded-[2px] border transition-all flex items-center gap-1.5 shadow-xs',
                          matchedMat.isPicked
                            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                            : 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                        )}
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>{matchedMat.isPicked ? '✔ 已取件打卡' : '抽屉取料打卡'}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted px-2 py-1">非本项目所需器件</span>
                    )}

                    <button
                      onClick={() => setInspectedSlot(null)}
                      className="px-2 py-1 text-xs text-text-muted hover:text-text-main border border-border-subtle rounded-[2px] bg-canvas"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 4. 底部常驻待购托盘 (Shortage Tray) */}
      {shortages.length > 0 && (
        <div className="border-t border-amber-500/30 bg-amber-500/[0.04] shrink-0">
          <div
            onClick={() => setShortageTrayOpen((o) => !o)}
            className="px-3 py-1.5 flex items-center justify-between cursor-pointer hover:bg-amber-500/[0.08] transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2.2]" />
              <span className="text-xs font-black text-amber-700 dark:text-amber-400">
                缺料待购托盘: 共有 {shortages.length} 种物料不足
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyLcscCodes();
                }}
                className="px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 border border-amber-500/40 rounded-[2px] bg-surface hover:bg-amber-500/10 flex items-center gap-1"
                title="复制所有缺料的立创商城编号"
              >
                {copiedLcsc ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>复制立创编号</span>
              </button>

              <button className="text-amber-600 dark:text-amber-400 p-0.5">
                {shortageTrayOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {shortageTrayOpen && (
            <div className="px-3 pb-2.5 max-h-36 overflow-y-auto space-y-1 divide-y divide-amber-500/20 text-xs font-mono">
              {shortages.map((s, idx) => (
                <div key={idx} className="pt-1 flex items-center justify-between text-text-main">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold truncate">{s.name}</span>
                    {s.package && <span className="text-text-muted text-[11px]">{s.package}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.lcsc && (
                      <span className="text-[10px] bg-surface px-1.5 py-0.2 border border-border-subtle rounded-[2px] text-text-muted">
                        {s.lcsc}
                      </span>
                    )}
                    <span className="text-amber-700 dark:text-amber-400 font-black">
                      缺 {s.shortageQty} 件
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

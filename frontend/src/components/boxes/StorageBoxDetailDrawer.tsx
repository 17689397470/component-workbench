import React, { useState, useEffect, useMemo } from 'react';
import { StorageBoxSummary, BoxGridResponseData, BoxComponentDetail } from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { componentApi } from '../../api/componentApi';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { Drawer } from '../ui/Drawer';
import {
  Archive,
  Grid,
  BookOpen,
  Printer,
  Plus,
  Search,
  ExternalLink,
  Layers,
  Sparkles,
  Package,
  Settings,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface StorageBoxDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  box: StorageBoxSummary | null;
  onEditConfig?: (box: StorageBoxSummary) => void;
  onOpenLabelPrint?: (box: StorageBoxSummary) => void;
  onDeleteBox?: (box: StorageBoxSummary) => void;
  onBoxUpdated?: () => void;
}

export const StorageBoxDetailDrawer: React.FC<StorageBoxDetailDrawerProps> = ({
  isOpen,
  onClose,
  box,
  onEditConfig,
  onOpenLabelPrint,
  onDeleteBox,
  onBoxUpdated,
}) => {
  const { setSelectedComponentId, setEntryDrawerOpen } = useInventoryStore();
  const { showToast } = useToastStore();

  const [loading, setLoading] = useState(false);
  const [gridData, setGridData] = useState<BoxGridResponseData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 加载盒内详情与完整物料列表
  const fetchDetail = async () => {
    if (!box?.name) return;
    setLoading(true);
    try {
      const res = await boxApi.getBoxGrid(box.name, 1);
      if (res.success && res.data) {
        setGridData(res.data);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && box?.name) {
      setSearchQuery('');
      fetchDetail();
    }
  }, [isOpen, box?.name]);

  // 监听全局数据变更自动静默重拉
  useEffect(() => {
    const handleGlobalChange = () => {
      if (isOpen && box?.name) {
        fetchDetail();
      }
    };
    window.addEventListener('GLOBAL_INVENTORY_DATA_CHANGED', handleGlobalChange);
    return () => window.removeEventListener('GLOBAL_INVENTORY_DATA_CHANGED', handleGlobalChange);
  }, [isOpen, box?.name]);

  // 汇总盒内全部物料清单
  const allComponents = useMemo(() => {
    if (!gridData) return [];
    const list: Array<BoxComponentDetail & { slotDisplay: string }> = [];

    // 来自网格格位的物料
    if (gridData.grid) {
      for (const slot of gridData.grid) {
        for (const comp of slot.components) {
          list.push({
            ...comp,
            slotDisplay: slot.slot,
          });
        }
      }
    }

    // 来自待划格散料
    if (gridData.unassigned) {
      for (const comp of gridData.unassigned) {
        list.push({
          ...comp,
          slotDisplay: '散料 (未划格)',
        });
      }
    }

    return list;
  }, [gridData]);

  // 过滤物料
  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return allComponents;
    const q = searchQuery.toLowerCase().trim();
    return allComponents.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.value && c.value.toLowerCase().includes(q)) ||
        (c.package && c.package.toLowerCase().includes(q)) ||
        (c.category && c.category.toLowerCase().includes(q)) ||
        (c.lcsc_part && c.lcsc_part.toLowerCase().includes(q)) ||
        c.slotDisplay.toLowerCase().includes(q)
    );
  }, [allComponents, searchQuery]);

  // 就地数量微调
  const handleQuickAdjust = async (id: number, delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await componentApi.adjustQuantity(id, delta);
      showToast(`数量已调整 ${delta > 0 ? '+' + delta : delta}`, 'success');
      fetchDetail();
      if (onBoxUpdated) onBoxUpdated();
      window.dispatchEvent(new CustomEvent('GLOBAL_INVENTORY_DATA_CHANGED'));
    } catch (err: any) {
      showToast('调整失败: ' + err.message, 'error');
    }
  };

  if (!box) return null;

  const totalTypes = allComponents.length;
  const totalPieces = allComponents.reduce((sum, c) => sum + (c.quantity || 0), 0);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-[2px] shrink-0 border border-black/10 shadow-2xs"
            style={{ backgroundColor: box.color || '#3B82F6' }}
          />
          <span className="truncate">{box.name}</span>
          <span className="text-xs font-mono font-bold px-1.5 py-0.2 bg-subtle text-text-muted rounded-[2px] border border-border-subtle">
            {box.box_type === 'BOOK'
              ? '样品册'
              : box.box_type === 'BIN'
              ? '随手盒 / 静电袋'
              : '网格抽屉柜'}
          </span>
        </div>
      }
      subtitle={box.description || '物理收纳容器详情档案与盒内全量物料清单'}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center justify-between w-full text-xs">
          <div className="flex items-center gap-3">
            <div className="text-text-muted font-mono">
              共计 <strong className="text-text-main font-bold">{totalTypes}</strong> 种物料 /{' '}
              <strong className="text-accent font-bold">{totalPieces}</strong> 件
            </div>
            {onDeleteBox && (
              <button
                type="button"
                onClick={() => {
                  onDeleteBox(box);
                }}
                className="px-2 py-1 text-danger hover:bg-danger/10 border border-danger/20 rounded-[2px] font-bold flex items-center gap-1 transition-colors"
                title={`彻底删除收纳盒【${box.name}】`}
              >
                <Trash2 className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>删除此盒</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEntryDrawerOpen(true, box.name);
              }}
              className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-[2px] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>存入新物料</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-subtle hover:bg-surface border border-border-subtle text-text-main font-bold rounded-[2px] transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* 1. 顶部工坊资产摘要卡片 */}
        <div className="p-3.5 bg-canvas rounded-md border border-border-subtle space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center font-mono">
            <div className="p-2 bg-surface rounded-[2px] border border-border-subtle/60">
              <span className="block text-[11px] text-text-muted font-sans font-medium mb-0.5">
                在库物料种类
              </span>
              <strong className="text-base font-black text-text-main">{totalTypes}</strong>
              <span className="text-[10px] text-text-muted ml-0.5">种</span>
            </div>
            <div className="p-2 bg-surface rounded-[2px] border border-border-subtle/60">
              <span className="block text-[11px] text-text-muted font-sans font-medium mb-0.5">
                库存现货总量
              </span>
              <strong className="text-base font-black text-accent">{totalPieces}</strong>
              <span className="text-[10px] text-text-muted ml-0.5">件</span>
            </div>
            <div className="p-2 bg-surface rounded-[2px] border border-border-subtle/60">
              <span className="block text-[11px] text-text-muted font-sans font-medium mb-0.5">
                {box.box_type === 'BIN' ? '容器规格' : '网格饱和度'}
              </span>
              <strong className="text-base font-black text-text-main">
                {box.box_type === 'BIN' ? '散料仓' : `${box.occupancy_rate || 0}%`}
              </strong>
            </div>
          </div>

          {/* 快捷操作栏 */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-border-subtle/50">
            {onOpenLabelPrint && (
              <button
                type="button"
                onClick={() => {
                  onOpenLabelPrint(box);
                }}
                className="px-2.5 py-1 text-xs font-bold text-text-muted hover:text-text-main bg-surface hover:bg-subtle border border-border-subtle rounded-[2px] flex items-center gap-1.5 transition-colors"
                title="打印该容器标签纸与二维码"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>打印物理标签纸</span>
              </button>
            )}

            {onEditConfig && (
              <button
                type="button"
                onClick={() => {
                  onEditConfig(box);
                }}
                className="px-2.5 py-1 text-xs font-bold text-text-muted hover:text-text-main bg-surface hover:bg-subtle border border-border-subtle rounded-[2px] flex items-center gap-1.5 transition-colors"
                title="编辑容器形态与行列参数"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>修改规格配置</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. 盒内物料清单搜索栏 */}
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="在盒内搜索型号、阻值、封装、立创编号或格位..."
              className="w-full pl-8 pr-7 py-1.5 text-xs font-mono bg-canvas border border-border-subtle rounded-[2px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 3. 盒内物料清单主体表格 */}
        <div className="border border-border-subtle rounded-md overflow-hidden bg-surface">
          {loading ? (
            <div className="py-12 text-center text-xs text-text-muted flex flex-col items-center gap-2">
              <Layers className="w-5 h-5 text-accent animate-pulse" />
              <span>正在加载盒内物料明细...</span>
            </div>
          ) : filteredComponents.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-muted flex flex-col items-center justify-center p-4">
              <Archive className="w-8 h-8 text-border-hover mb-2 opacity-60" />
              <div className="font-bold text-text-main mb-1">
                {searchQuery ? '未找到符合条件的物料' : '此收纳盒内暂无任何元器件'}
              </div>
              <p className="text-[11px] text-text-muted max-w-xs mb-3">
                {searchQuery
                  ? '请尝试更换搜索关键字'
                  : '点击下方按钮，录入并归置您的第一批元器件到此盒子。'}
              </p>
              {!searchQuery && (
                <button
                  type="button"
                  onClick={() => setEntryDrawerOpen(true, box.name)}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-white font-bold text-xs rounded-[2px] transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>＋ 立即录入器件到此盒</span>
                </button>
              )}
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto divide-y divide-border-subtle/60">
              {filteredComponents.map((item) => (
                <div
                  key={`${item.id}-${item.slotDisplay}`}
                  onClick={() => setSelectedComponentId(item.id)}
                  className="p-3 hover:bg-subtle/60 transition-colors cursor-pointer select-none flex items-center justify-between gap-3 group"
                >
                  {/* 左侧：分类标 + 名称 + 规格参数 + 格位 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 bg-canvas text-text-muted border border-border-subtle rounded-[2px] shrink-0">
                        {item.category || '未分类'}
                      </span>
                      <h4 className="font-bold text-xs text-text-main group-hover:text-accent truncate">
                        {item.name}
                      </h4>
                      {item.lcsc_part && (
                        <span className="text-[10px] font-mono text-accent bg-accent/10 px-1 py-0.2 rounded-[2px]">
                          {item.lcsc_part}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono text-text-muted">
                      <span>{item.package || '-'}</span>
                      {item.value && <span>· {item.value}</span>}
                      <span>·</span>
                      <span className="text-text-main font-semibold flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent/70" />
                        <span>位置: {item.slotDisplay}</span>
                      </span>
                    </div>
                  </div>

                  {/* 右侧：数量步进微调与详情箭头 */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 bg-canvas border border-border-subtle rounded-[2px] p-0.5 font-mono text-xs">
                      <button
                        type="button"
                        onClick={(e) => handleQuickAdjust(item.id, -1, e)}
                        className="w-5 h-5 flex items-center justify-center hover:bg-subtle text-text-muted hover:text-text-main rounded-[2px]"
                        title="减少 1 件"
                      >
                        -
                      </button>
                      <strong className="px-1.5 min-w-[32px] text-center text-text-main font-black">
                        {item.quantity}
                      </strong>
                      <button
                        type="button"
                        onClick={(e) => handleQuickAdjust(item.id, 1, e)}
                        className="w-5 h-5 flex items-center justify-center hover:bg-subtle text-text-muted hover:text-text-main rounded-[2px]"
                        title="增加 1 件"
                      >
                        +
                      </button>
                    </div>

                    <ChevronRight className="w-4 h-4 text-text-muted/60 group-hover:text-accent group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};

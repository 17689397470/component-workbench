import React from 'react';
import { BoxGridSlot, BoxComponentDetail } from '../../types/box';
import { Plus, Target } from 'lucide-react';

interface AcrylicDrawerCellProps {
  slotItem: BoxGridSlot;
  isSelected?: boolean;
  isSearchMatch?: boolean;
  isSearchDimmed?: boolean;
  isAssignTarget?: boolean;
  onClick: () => void;
}

export const AcrylicDrawerCell: React.FC<AcrylicDrawerCellProps> = ({
  slotItem,
  isSelected = false,
  isSearchMatch = false,
  isSearchDimmed = false,
  isAssignTarget = false,
  onClick,
}) => {
  const comp: BoxComponentDetail | undefined = slotItem.components[0];
  const isOccupied = slotItem.isOccupied && !!comp;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      title={
        isOccupied
          ? `[${slotItem.slot}] ${comp.name} (${comp.value || ''} ${comp.package || ''}) - ${comp.quantity}件`
          : `[${slotItem.slot}] 空抽屉 - 点击入料`
      }
      className={`group relative flex flex-col justify-between p-2.5 min-h-[120px] rounded-xs select-none cursor-pointer transition-all duration-150 border-[1.5px] text-left ${
        // 基础材质与边框质感 (加粗硬朗卡槽)
        isOccupied
          ? 'bg-surface hover:bg-surface-hover border-border-subtle shadow-xs hover:border-border-hover'
          : 'bg-canvas/80 hover:bg-surface border-dashed border-border-subtle hover:border-accent'
      } ${
        // 激活选中态
        isSelected
          ? 'ring-2 ring-accent border-accent bg-accent/[0.08] shadow-sm z-10'
          : ''
      } ${
        // 搜索高亮与置灰
        isSearchMatch
          ? 'ring-2 ring-accent border-accent bg-accent/20 shadow-sm'
          : ''
      } ${
        isSearchDimmed ? 'opacity-40 hover:opacity-100' : ''
      } ${
        // 散料划入格位靶标态
        isAssignTarget
          ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/20 animate-pulse z-10'
          : ''
      }`}
    >
      {/* 顶部亚克力拉手微槽模拟 (加粗饱满，凸显物理手感) */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-border-hover/60 group-hover:bg-accent/60 transition-colors pointer-events-none" />

      {/* 第一行：坐标工牌 + 数量标尺 (加粗大字号，对比鲜明) */}
      <div className="flex items-center justify-between gap-1 pt-1 mb-1">
        {/* 坐标标识 */}
        <span
          className={`font-mono text-xs font-black px-2 py-0.5 rounded-[2px] tracking-tight leading-none border shadow-2xs ${
            isOccupied
              ? 'bg-canvas text-text-main border-border-subtle'
              : 'bg-subtle text-text-muted border-border-subtle/80'
          } ${isSelected ? 'text-accent border-accent/60 bg-white dark:bg-canvas' : ''}`}
        >
          {slotItem.slot}
        </span>

        {/* 数量标尺 */}
        {isOccupied ? (
          <span className="font-mono text-xs font-black text-accent bg-accent/15 px-2 py-0.5 rounded-[2px] leading-none shrink-0 border border-accent/30">
            {comp.quantity}
            <span className="text-[10px] font-bold text-text-muted ml-0.5">件</span>
          </span>
        ) : isAssignTarget ? (
          <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-[2px] flex items-center gap-1 border border-emerald-500/40">
            <Target className="w-3.5 h-3.5" /> 存入
          </span>
        ) : (
          <span className="text-[11px] text-text-muted font-mono font-bold tracking-tight">空仓</span>
        )}
      </div>

      {/* 中间信息区：粗体黑体，绝不发虚 */}
      {isOccupied ? (
        <div className="flex-1 my-1 min-w-0">
          {/* 物料主名称 (14px 粗体黑体，字重 800) */}
          <div
            className="text-sm font-black text-text-main truncate group-hover:text-accent transition-colors leading-snug"
            title={comp.name}
          >
            {comp.name}
          </div>

          {/* 参数规格与封装（13px 等宽粗体，高对比度浓郁黑） */}
          <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-text-main truncate">
            {comp.value && (
              <span className="font-black text-text-main truncate">
                {comp.value}
              </span>
            )}
            {comp.package && (
              <span className="px-1.5 py-0.5 bg-canvas border border-border-subtle rounded-[2px] text-xs text-text-muted font-bold shrink-0">
                {comp.package}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* 空抽屉物理十字槽质感 (加大加粗) */
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted py-2">
          <div className="w-8 h-8 rounded-full border-2 border-dashed border-border-hover/80 flex items-center justify-center group-hover:border-accent group-hover:bg-accent/10 transition-all">
            <Plus className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:text-accent group-hover:scale-110 transition-all stroke-[2.5]" />
          </div>
          <span className="text-xs text-text-muted font-mono mt-1.5 group-hover:text-accent transition-colors font-bold">
            {isAssignTarget ? '点击放入' : '空仓待放'}
          </span>
        </div>
      )}

      {/* 底部微行：品类与立创编号 (清晰加粗) */}
      {isOccupied && (
        <div className="pt-1.5 mt-1 border-t border-border-subtle flex items-center justify-between text-xs font-mono">
          <span className="truncate max-w-[85px] font-sans text-text-muted font-bold">{comp.category}</span>
          {comp.lcsc_part ? (
            <span className="text-accent font-black truncate tracking-tight" title={comp.lcsc_part}>
              {comp.lcsc_part}
            </span>
          ) : (
            <span className="text-text-muted/40 font-bold">-</span>
          )}
        </div>
      )}
    </div>
  );
};

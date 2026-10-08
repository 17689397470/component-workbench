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
      className={`group relative flex flex-col justify-between p-2.5 min-h-[118px] rounded-xs select-none cursor-pointer transition-all duration-150 border text-left ${
        // 基础材质与边框质感
        isOccupied
          ? 'bg-surface hover:bg-surface-hover border-border-subtle shadow-xs hover:border-border-hover'
          : 'bg-canvas/70 hover:bg-surface border-dashed border-border-subtle hover:border-accent/60'
      } ${
        // 激活选中态
        isSelected
          ? 'ring-2 ring-accent border-accent bg-accent/[0.08] shadow-sm z-10'
          : ''
      } ${
        // 搜索高亮与置灰
        isSearchMatch
          ? 'ring-2 ring-accent border-accent bg-accent/15 shadow-sm'
          : ''
      } ${
        isSearchDimmed ? 'opacity-35 hover:opacity-100' : ''
      } ${
        // 散料划入格位靶标态
        isAssignTarget
          ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/15 animate-pulse z-10'
          : ''
      }`}
    >
      {/* 顶部亚克力拉手微槽模拟 (Physical Grip Line) */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-border-subtle group-hover:bg-accent/50 transition-colors pointer-events-none" />

      {/* 第一行：坐标工牌 + 数量标尺 (字号 12px 粗体) */}
      <div className="flex items-center justify-between gap-1 pt-1 mb-1">
        {/* 坐标标识 */}
        <span
          className={`font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] tracking-tight leading-none ${
            isOccupied
              ? 'bg-canvas text-text-muted border border-border-subtle'
              : 'bg-subtle text-text-muted border border-transparent'
          } ${isSelected ? 'text-accent border-accent/40 bg-white dark:bg-canvas' : ''}`}
        >
          {slotItem.slot}
        </span>

        {/* 数量标尺 */}
        {isOccupied ? (
          <span className="font-mono text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-[2px] leading-none shrink-0 border border-accent/20">
            {comp.quantity}
            <span className="text-[10px] font-normal text-text-muted ml-0.5">件</span>
          </span>
        ) : isAssignTarget ? (
          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-[2px] flex items-center gap-1 border border-emerald-500/30">
            <Target className="w-3 h-3" /> 存入
          </span>
        ) : (
          <span className="text-[10px] text-text-muted/80 font-mono tracking-tight">空置</span>
        )}
      </div>

      {/* 中间信息区：舒适大字号清晰显示 */}
      {isOccupied ? (
        <div className="flex-1 my-1 min-w-0">
          {/* 物料主名称 (13px~14px 粗体黑体，绝不发虚) */}
          <div
            className="text-[13px] sm:text-sm font-bold text-text-main truncate group-hover:text-accent transition-colors leading-snug"
            title={comp.name}
          >
            {comp.name}
          </div>

          {/* 参数规格与封装（12px 等宽粗体，高对比度） */}
          <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-text-main truncate">
            {comp.value && (
              <span className="font-bold text-text-main truncate">
                {comp.value}
              </span>
            )}
            {comp.package && (
              <span className="px-1.5 py-0.5 bg-canvas border border-border-subtle rounded-[2px] text-[11px] text-text-muted font-medium shrink-0">
                {comp.package}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* 空抽屉物理十字槽质感 (加大易读) */
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted py-2">
          <div className="w-7 h-7 rounded-full border border-dashed border-border-subtle flex items-center justify-center group-hover:border-accent/60 group-hover:bg-accent/5 transition-all">
            <Plus className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:text-accent group-hover:scale-110 transition-all" />
          </div>
          <span className="text-xs text-text-muted font-mono mt-1.5 group-hover:text-accent transition-colors font-medium">
            {isAssignTarget ? '点击放入' : '空仓'}
          </span>
        </div>
      )}

      {/* 底部微行：品类与立创编号 (12px 清晰高对比度) */}
      {isOccupied && (
        <div className="pt-1.5 mt-1 border-t border-border-subtle flex items-center justify-between text-xs font-mono">
          <span className="truncate max-w-[85px] font-sans text-text-muted font-medium">{comp.category}</span>
          {comp.lcsc_part ? (
            <span className="text-accent font-bold truncate tracking-tight" title={comp.lcsc_part}>
              {comp.lcsc_part}
            </span>
          ) : (
            <span className="text-text-muted/40">-</span>
          )}
        </div>
      )}
    </div>
  );
};

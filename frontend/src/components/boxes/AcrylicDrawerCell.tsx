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
      className={`group relative flex flex-col justify-between p-2 min-h-[92px] rounded-xs select-none cursor-pointer transition-all duration-150 border text-left ${
        // 基础材质与边框质感
        isOccupied
          ? 'bg-surface hover:bg-surface-hover border-border-subtle shadow-xs hover:border-border-hover'
          : 'bg-canvas/60 hover:bg-surface border-dashed border-border-subtle hover:border-accent/60'
      } ${
        // 激活选中态
        isSelected
          ? 'ring-2 ring-accent border-accent bg-accent/[0.07] shadow-sm z-10'
          : ''
      } ${
        // 搜索高亮与置灰
        isSearchMatch
          ? 'ring-2 ring-accent border-accent bg-accent/10 shadow-sm'
          : ''
      } ${
        isSearchDimmed ? 'opacity-20 hover:opacity-100' : ''
      } ${
        // 散料划入格位靶标态
        isAssignTarget
          ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/10 animate-pulse z-10'
          : ''
      }`}
    >
      {/* 顶部亚克力拉手微槽模拟 (Physical Grip Line) */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-border-subtle/80 group-hover:bg-accent/40 transition-colors pointer-events-none" />

      {/* 第一行：坐标工牌 + 数量标尺 */}
      <div className="flex items-center justify-between gap-1 pt-0.5 mb-1">
        {/* 坐标标识 */}
        <span
          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] tracking-tight leading-none ${
            isOccupied
              ? 'bg-canvas text-text-muted border border-border-subtle/60'
              : 'bg-subtle text-text-dim border border-transparent'
          } ${isSelected ? 'text-accent border-accent/40 bg-white dark:bg-canvas' : ''}`}
        >
          {slotItem.slot}
        </span>

        {/* 数量标尺 */}
        {isOccupied ? (
          <span className="font-mono text-[11px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-[2px] leading-none shrink-0">
            {comp.quantity}
            <span className="text-[9px] font-normal text-text-dim ml-0.5">件</span>
          </span>
        ) : isAssignTarget ? (
          <span className="font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded-[2px] flex items-center gap-0.5">
            <Target className="w-2.5 h-2.5" /> 存入
          </span>
        ) : (
          <span className="text-[9px] text-text-dim/70 font-mono tracking-tighter">EMPTY</span>
        )}
      </div>

      {/* 中间信息区 */}
      {isOccupied ? (
        <div className="flex-1 my-0.5 min-w-0">
          {/* 物料主名称 */}
          <div
            className="text-xs font-semibold text-text-main truncate group-hover:text-accent transition-colors leading-tight"
            title={comp.name}
          >
            {comp.name}
          </div>

          {/* 参数规格与封装（等宽字体） */}
          <div className="flex items-center gap-1 mt-1 text-[10px] font-mono text-text-dim truncate">
            {comp.value && (
              <span className="text-text-muted font-bold truncate">
                {comp.value}
              </span>
            )}
            {comp.package && (
              <span className="px-1 py-[1px] bg-canvas border border-border-subtle/80 rounded-[2px] text-[9px] text-text-dim shrink-0">
                {comp.package}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* 空抽屉物理十字槽质感 */
        <div className="flex-1 flex flex-col items-center justify-center text-text-dim py-1.5">
          <div className="w-6 h-6 rounded-full border border-dashed border-border-subtle flex items-center justify-center group-hover:border-accent/60 group-hover:bg-accent/5 transition-all">
            <Plus className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:text-accent group-hover:scale-110 transition-all" />
          </div>
          <span className="text-[9px] text-text-dim/60 font-mono mt-1 group-hover:text-accent/80 transition-colors">
            {isAssignTarget ? '点击放置' : '空置'}
          </span>
        </div>
      )}

      {/* 底部微行：品类与立创编号 (硬核刻字感) */}
      {isOccupied && (
        <div className="pt-1 mt-0.5 border-t border-border-subtle/50 flex items-center justify-between text-[9px] text-text-dim font-mono">
          <span className="truncate max-w-[65px] font-sans text-text-dim/80">{comp.category}</span>
          {comp.lcsc_part ? (
            <span className="text-accent/80 truncate font-semibold" title={comp.lcsc_part}>
              {comp.lcsc_part}
            </span>
          ) : (
            <span className="text-text-dim/40">-</span>
          )}
        </div>
      )}
    </div>
  );
};

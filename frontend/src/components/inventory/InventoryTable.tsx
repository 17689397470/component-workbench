import React from 'react';
import { ComponentItem } from '../../types/component';
import { useInventoryStore } from '../../store/useInventoryStore';
import { getCategoryIcon, formatSpec, cn } from '../../lib/utils';
import { ExternalLink, Plus, Minus } from 'lucide-react';

interface InventoryTableProps {
  components: ComponentItem[];
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ components }) => {
  const { setSelectedComponentId, setLocationFilter, adjustQuantity } = useInventoryStore();

  if (components.length === 0) {
    return (
      <div className="py-16 text-center text-text-dim text-sm bg-surface border border-dashed border-border-subtle rounded-2xl">
        未找到匹配的元器件，可尝试清空搜索词或点击右上角「＋ 记一笔」入库
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-canvas border-b border-border-subtle text-text-muted font-semibold select-none">
              <th className="py-3 px-4 w-[28%]">型号 / 品名</th>
              <th className="py-3 px-3 w-[12%]">分类</th>
              <th className="py-3 px-3 w-[12%]">封装</th>
              <th className="py-3 px-3 w-[18%]">规格参数</th>
              <th className="py-3 px-3 w-[16%]">存放盒位</th>
              <th className="py-3 px-4 w-[14%] text-right">现有库存</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {components.map((item) => {
              const icon = getCategoryIcon(item.category);
              const spec = formatSpec(item);
              const isLow = !!item.is_low_stock;
              const cNum = item.lcsc_part ? item.lcsc_part.toUpperCase().trim() : null;

              return (
                <tr
                  key={item.id}
                  onClick={() => setSelectedComponentId(item.id)}
                  className="hover:bg-surface-hover/80 cursor-pointer transition-colors group"
                >
                  {/* 品名 */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base flex-shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-text-main truncate group-hover:text-accent transition-colors">
                          {item.name}
                        </div>
                        {cNum && (
                          <div className="text-[11px] font-mono text-text-dim flex items-center gap-1 mt-0.5">
                            <span>{cNum}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 分类 */}
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[11px] font-medium text-text-muted">
                      {item.category || '-'}
                    </span>
                  </td>

                  {/* 封装 */}
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[11px] font-mono font-semibold text-text-main">
                      {item.package || '-'}
                    </span>
                  </td>

                  {/* 规格 */}
                  <td className="py-3 px-3 text-text-muted font-mono">{spec}</td>

                  {/* 盒位 */}
                  <td className="py-3 px-3">
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocationFilter(item.location || '');
                      }}
                      className="px-2 py-0.5 bg-subtle hover:bg-accent/10 hover:text-accent hover:border-accent/30 border border-border-subtle rounded-md text-[11px] text-text-muted transition-colors"
                      title="点击按该盒位筛选"
                    >
                      📦 {item.location || '随手存放处'}
                    </span>
                  </td>

                  {/* 就地步进器与数量 */}
                  <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1.5 bg-subtle/80 border border-border-subtle rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(item.id, -10)}
                        title="减少 10 件"
                        className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 shadow-none transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className={cn(
                          'w-10 text-center font-mono font-bold text-xs tabular-nums',
                          isLow ? 'text-amber-600' : 'text-text-main'
                        )}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustQuantity(item.id, 10)}
                        title="增加 10 件"
                        className="w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 shadow-none transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

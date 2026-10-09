import React from 'react';
import { ComponentItem } from '../../types/component';
import { useInventoryStore } from '../../store/useInventoryStore';
import { getCategoryIcon, formatSpec, cn } from '../../lib/utils';
import { ExternalLink, Plus, Minus, Layers } from 'lucide-react';

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
    <div className="bg-surface border border-border-subtle rounded-[3px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-canvas border-b border-border-subtle text-text-muted font-mono font-bold select-none text-[11px]">
              <th className="py-2.5 px-3.5 w-[28%]">型号 / 品名</th>
              <th className="py-2.5 px-3 w-[12%]">分类</th>
              <th className="py-2.5 px-3 w-[12%]">封装</th>
              <th className="py-2.5 px-3 w-[18%]">规格参数</th>
              <th className="py-2.5 px-3 w-[16%]">存放盒位</th>
              <th className="py-2.5 px-3.5 w-[14%] text-right">现有库存</th>
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
                  className="hover:bg-subtle/80 cursor-pointer transition-colors group select-none"
                >
                  {/* 品名 */}
                  <td className="py-2 px-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm shrink-0">{icon}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-text-main truncate group-hover:text-accent transition-colors">
                          {item.name}
                        </div>
                        {cNum && (
                          <div className="text-[10px] font-mono font-bold text-text-muted/80 flex items-center gap-1 mt-0.5">
                            <span className="px-1 py-0.2 bg-canvas border border-border-subtle rounded-[2px]">{cNum}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 分类 */}
                  <td className="py-2 px-3">
                    <span className="text-[11px] font-medium text-text-muted">
                      {item.category || '-'}
                    </span>
                  </td>

                  {/* 封装 */}
                  <td className="py-2 px-3 whitespace-nowrap">
                    {item.package ? (
                      <span
                        className="inline-block whitespace-nowrap max-w-[120px] truncate align-middle px-1.5 py-0.5 bg-canvas border border-border-subtle rounded-[2px] text-[11px] font-mono font-bold text-text-main"
                        title={item.package}
                      >
                        {item.package}
                      </span>
                    ) : (
                      <span className="text-text-muted/60 font-mono">-</span>
                    )}
                  </td>

                  {/* 规格 */}
                  <td className="py-2 px-3 text-text-muted font-mono font-medium">{spec}</td>

                  {/* 盒位 */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocationFilter(item.location || '');
                        }}
                        className="px-1.5 py-0.5 bg-canvas hover:bg-accent/10 hover:text-accent hover:border-accent/40 border border-border-subtle rounded-[2px] text-[11px] font-mono text-text-muted font-bold transition-colors cursor-pointer"
                        title="点击按该盒位筛选表格"
                      >
                        📦 {item.location || '随手存放处'}
                      </span>
                      {item.location && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(
                              new CustomEvent('GLOBAL_NAVIGATE_TO_BOX', {
                                detail: { location: item.location, componentId: item.id },
                              })
                            );
                          }}
                          className="p-1 text-accent hover:bg-accent/15 border border-accent/30 rounded-[2px] transition-colors"
                          title="在 2D 亚克力收纳柜中透视定位此抽屉"
                        >
                          <Layers className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 就地步进器与数量 */}
                  <td className="py-2 px-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1 bg-canvas border border-border-subtle rounded-[2px] p-0.5">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(item.id, -10)}
                        title="减少 10 件"
                        className="w-4 h-4 rounded-[2px] flex items-center justify-center text-text-muted hover:text-text-main hover:bg-subtle active:scale-95 transition-all"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </button>
                      <span
                        className={cn(
                          'w-9 text-center font-mono font-black text-xs tabular-nums',
                          isLow ? 'text-amber-600' : 'text-text-main'
                        )}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => adjustQuantity(item.id, 10)}
                        title="增加 10 件"
                        className="w-4 h-4 rounded-[2px] flex items-center justify-center text-text-muted hover:text-text-main hover:bg-subtle active:scale-95 transition-all"
                      >
                        <Plus className="w-2.5 h-2.5" />
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

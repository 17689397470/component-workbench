import React from 'react';
import { ComponentItem, GridDensity } from '../../types/component';
import { ShowcaseCard } from './ShowcaseCard';
import { cn } from '../../lib/utils';

interface InventoryGridProps {
  components: ComponentItem[];
  density: GridDensity;
}

export const InventoryGrid: React.FC<InventoryGridProps> = ({ components, density }) => {
  if (components.length === 0) {
    return (
      <div className="py-16 text-center text-text-dim text-sm bg-surface border border-dashed border-border-subtle rounded-2xl">
        未找到匹配的元器件，可尝试清空搜索词或点击右上角「＋ 记一笔」入库
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-4 transition-all duration-200',
        density === 'double'
          ? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
      )}
    >
      {components.map((item) => (
        <ShowcaseCard key={item.id} item={item} />
      ))}
    </div>
  );
};

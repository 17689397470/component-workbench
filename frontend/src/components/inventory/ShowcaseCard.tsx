import React from 'react';
import { ComponentItem } from '../../types/component';
import { useInventoryStore } from '../../store/useInventoryStore';
import { getCategoryIcon, formatSpec, cn } from '../../lib/utils';
import { ExternalLink, Box, Compass } from 'lucide-react';
import { LocationLocatorModal } from '../boxes/LocationLocatorModal';

interface ShowcaseCardProps {
  item: ComponentItem;
}

export const ShowcaseCard: React.FC<ShowcaseCardProps> = ({ item }) => {
  const { setSelectedComponentId, setLocationFilter } = useInventoryStore();
  const [imgError, setImgError] = React.useState(false);
  const [isLocatorOpen, setIsLocatorOpen] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [item.image_url]);

  const icon = getCategoryIcon(item.category);
  const spec = formatSpec(item);
  const isLow = !!item.is_low_stock;
  const cNum = item.lcsc_part ? item.lcsc_part.toUpperCase().trim() : null;
  const lcscUrl =
    item.datasheet_url || (cNum ? `https://item.szlcsc.com/${cNum.replace('C', '')}.html` : null);

  const hasValidImg = Boolean(item.image_url && !imgError);

  return (
    <div
      onClick={() => setSelectedComponentId(item.id)}
      className="group bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-border-hover transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      {/* 顶部图片与角标区 */}
      <div className="relative h-36 bg-canvas border-b border-border-subtle flex items-center justify-center p-3 overflow-hidden">
        {hasValidImg ? (
          <img
            src={item.image_url!}
            alt={item.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-text-dim gap-1">
            <span className="text-3xl opacity-75">{icon}</span>
            <span className="text-[11px] font-medium">{item.category || '元件'}</span>
          </div>
        )}

        {/* 分类徽标 */}
        <span className="absolute top-2.5 left-2.5 bg-surface/90 backdrop-blur-md border border-border-subtle px-2 py-0.5 rounded-full text-[11px] font-medium text-text-main flex items-center gap-1 shadow-sm">
          <span>{icon}</span>
          <span>{item.category || '其他'}</span>
        </span>

        {/* 立创 C 编号直达外链 */}
        {cNum && lcscUrl && (
          <a
            href={lcscUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2.5 right-2.5 bg-surface/90 backdrop-blur-md border border-border-subtle hover:border-accent text-accent px-2 py-0.5 rounded-full text-[11px] font-mono font-medium flex items-center gap-1 shadow-sm"
            title="查看立创原厂规格书"
          >
            <span>{cNum}</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>

      {/* 中部信息主体 */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* 主标题 */}
          <div className="text-sm font-bold text-text-main leading-tight line-clamp-1 mb-1" title={item.name}>
            {item.value || item.name}
          </div>

          {/* 厂商 / 别名 */}
          <div className="text-xs text-text-muted truncate mb-2.5">
            {item.manufacturer || (item.name !== item.value ? item.name : '-')}
          </div>

          {/* 参数胶囊群 */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {item.package && (
              <span className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[11px] font-mono font-semibold text-text-main">
                {item.package}
              </span>
            )}
            {item.tolerance && (
              <span className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[11px] font-medium text-text-muted">
                {item.tolerance}
              </span>
            )}
            {item.voltage && (
              <span className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[11px] font-medium text-text-muted">
                {item.voltage}V
              </span>
            )}
            {spec && spec !== item.value && (
              <span className="px-2 py-0.5 bg-subtle border border-border-subtle rounded-md text-[11px] font-medium text-text-muted truncate max-w-[120px]">
                {spec}
              </span>
            )}
          </div>
        </div>

        {/* 所在收纳盒 (可点击过滤，或点击罗盘透视) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setLocationFilter(item.location || '');
          }}
          className="text-xs text-text-muted flex items-center justify-between pt-2 border-t border-dashed border-border-subtle hover:text-accent transition-colors"
          title="点击按该盒位筛选"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Box className="w-3.5 h-3.5 text-text-dim flex-shrink-0" />
            <span className="truncate">{item.location || '随手存放处'}</span>
          </div>

          {item.location && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLocatorOpen(true);
              }}
              className="p-1 hover:bg-subtle text-text-dim hover:text-accent rounded-md transition-colors"
              title="透视现实物理格位"
            >
              <Compass className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 底部余量与呼吸灯 */}
      <div className="px-4 py-2.5 bg-subtle/50 border-t border-border-subtle flex items-center justify-between text-xs">
        <div className="flex items-baseline gap-1">
          <span className="text-[11px] text-text-dim">现存:</span>
          <span className={cn('text-base font-bold font-mono', isLow ? 'text-amber-600' : 'text-text-main')}>
            {item.quantity}
          </span>
          <span className="text-[11px] text-text-dim">件</span>
        </div>

        {/* 状态徽标 */}
        {isLow ? (
          <span className="text-[11px] font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            ⚠️ 待补料
          </span>
        ) : (
          <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>充足</span>
          </span>
        )}
      </div>

      <LocationLocatorModal
        isOpen={isLocatorOpen}
        onClose={() => setIsLocatorOpen(false)}
        componentId={item.id}
        locationStr={item.location}
        componentName={item.name}
      />
    </div>
  );
};

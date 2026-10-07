import React, { useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { componentApi } from '../../api/componentApi';
import { Drawer } from '../ui/Drawer';
import { Sparkles, Plus, Check } from 'lucide-react';

export const ComponentEntryDrawer: React.FC = () => {
  const { isEntryDrawerOpen, setEntryDrawerOpen, fetchComponents, fetchStats } =
    useInventoryStore();
  const { showToast } = useToastStore();

  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // 表单状态
  const [name, setName] = useState('');
  const [category, setCategory] = useState('电阻');
  const [pkg, setPkg] = useState('0805');
  const [value, setValue] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [location, setLocation] = useState('默认电阻盒');
  const [notes, setNotes] = useState('');
  const [lcscPart, setLcscPart] = useState('');

  // 触发智能文本解析
  const handleParseText = async (textToParse = rawText) => {
    if (!textToParse.trim()) return;
    setIsParsing(true);
    try {
      const res = await componentApi.parseText(textToParse);
      if (res.success && res.data) {
        const d = res.data;
        if (d.name) setName(d.name);
        if (d.category) setCategory(d.category);
        if (d.package) setPkg(d.package);
        if (d.value) setValue(d.value);
        if (d.quantity) setQuantity(d.quantity);
        if (d.location) setLocation(d.location);
        if (d.lcsc_part) setLcscPart(d.lcsc_part);
        if (d.notes) setNotes(d.notes);
        showToast('已智能提取规格参数', 'info');
      }
    } catch (err: any) {
      showToast('智能解析异常: ' + err.message, 'warn');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('请输入物料名称或型号', 'warn');
      return;
    }

    try {
      await componentApi.create({
        name,
        category,
        package: pkg,
        value,
        quantity,
        location,
        notes,
        lcsc_part: lcscPart,
      });

      showToast(`✔ 成功录入: ${name} x${quantity}`, 'success');
      fetchComponents();
      fetchStats();

      // 重置并关闭
      setRawText('');
      setName('');
      setValue('');
      setEntryDrawerOpen(false);
    } catch (err: any) {
      showToast('入库失败: ' + err.message, 'error');
    }
  };

  return (
    <Drawer
      isOpen={isEntryDrawerOpen}
      onClose={() => setEntryDrawerOpen(false)}
      title="＋ 录入元器件"
      subtitle="支持自然语言智能识别与多参数精准调优"
      footer={
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-2.5 bg-text-main text-surface font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-all"
        >
          <Check className="w-4 h-4" />
          <span>确认存入元器件库</span>
        </button>
      }
    >
      <div className="space-y-4 text-xs">
        {/* 自然语言智能解析输入框 */}
        <div className="p-3 bg-canvas border border-border-subtle rounded-xl space-y-2">
          <label className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>极速点录：粘贴品名、立创条码或描述</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleParseText()}
              placeholder="例如: 0805 10k 1% 100只 / C2057 50pcs"
              className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={isParsing}
              onClick={() => handleParseText()}
              className="px-3 py-1.5 bg-accent text-white font-medium rounded-lg text-xs hover:opacity-90 disabled:opacity-50"
            >
              {isParsing ? '解析中' : '解析'}
            </button>
          </div>
          {/* 快捷示例 */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] text-text-dim no-scrollbar">
            <span>示例:</span>
            {['0805 10k 100只', '0603 100nF 50V', 'AMS1117-3.3 10片'].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setRawText(ex);
                  handleParseText(ex);
                }}
                className="px-2 py-0.5 bg-subtle hover:bg-surface-hover rounded-md border border-border-subtle"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* 表单输入区 */}
        <div>
          <label className="block text-text-dim mb-1 font-medium">型号 / 品名 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
            placeholder="例如: 0805 10kΩ ±1%"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-text-dim mb-1 font-medium">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
            >
              {['电阻', '电容', '芯片', '二极管', '三极管/MOS', '接插件', '模块', '电感', '其他'].map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                )
              )}
            </select>
          </div>

          <div>
            <label className="block text-text-dim mb-1 font-medium">封装</label>
            <input
              type="text"
              value={pkg}
              onChange={(e) => setPkg(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none focus:border-accent"
              placeholder="0805 / SOP-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-text-dim mb-1 font-medium">阻值 / 参数值</label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none focus:border-accent"
              placeholder="10kΩ / 100nF"
            />
          </div>

          <div>
            <label className="block text-text-dim mb-1 font-medium">入库件数</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main font-mono font-bold focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-text-dim mb-1 font-medium">存放收纳盒</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
              placeholder="默认电阻盒"
            />
          </div>

          <div>
            <label className="block text-text-dim mb-1 font-medium">立创物料号 (可选)</label>
            <input
              type="text"
              value={lcscPart}
              onChange={(e) => setLcscPart(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none focus:border-accent"
              placeholder="C2057"
            />
          </div>
        </div>

        <div>
          <label className="block text-text-dim mb-1 font-medium">备注</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-surface border border-border-subtle rounded-xl p-3 text-xs text-text-main focus:outline-none focus:border-accent resize-none"
            placeholder="例如: 常用LED限流, I2C总线上拉电阻..."
          />
        </div>
      </div>
    </Drawer>
  );
};

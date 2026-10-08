import React, { useState, useEffect, useRef } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { componentApi } from '../../api/componentApi';
import { boxApi } from '../../api/boxApi';
import { ComponentItem } from '../../types/component';
import { StorageBox } from '../../types/box';
import { Drawer } from '../ui/Drawer';
import {
  Sparkles,
  Plus,
  Check,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ClipboardPaste,
  Box,
  Layers,
  ArrowRight,
  Database,
  Search,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';

export const ComponentEntryDrawer: React.FC = () => {
  const { isEntryDrawerOpen, setEntryDrawerOpen, fetchComponents, fetchStats, components } =
    useInventoryStore();
  const { showToast } = useToastStore();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // 模式切换: 'single' (单件连续流) | 'batch' (多行批量流)
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');

  // ---------- 单件流表单状态 ----------
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('电阻');
  const [pkg, setPkg] = useState('0805');
  const [value, setValue] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [location, setLocation] = useState('默认电阻盒');
  const [notes, setNotes] = useState('');
  const [lcscPart, setLcscPart] = useState('');
  const [saving, setSaving] = useState(false);

  // 官方立创反查数据
  const [officialData, setOfficialData] = useState<any>(null);
  const [isQueryingOfficial, setIsQueryingOfficial] = useState(false);

  // 同款物料查重检测状态
  const [duplicateMatch, setDuplicateMatch] = useState<ComponentItem | null>(null);

  // 已有收纳盒列表
  const [boxes, setBoxes] = useState<StorageBox[]>([]);

  // ---------- 批量流状态 ----------
  const [batchRawText, setBatchRawText] = useState('');
  const [batchParsing, setBatchParsing] = useState(false);
  const [batchItems, setBatchItems] = useState<any[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);

  // 加载收纳盒列表
  useEffect(() => {
    if (isEntryDrawerOpen) {
      loadBoxes();
    }
  }, [isEntryDrawerOpen]);

  const loadBoxes = async () => {
    try {
      const res = await boxApi.getAllBoxes();
      if (res.success && res.data) {
        setBoxes(res.data);
      }
    } catch {
      // 忽略
    }
  };

  // 根据分类自动推荐收纳盒
  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    if (newCat === '电阻') setLocation('默认电阻盒');
    else if (newCat === '电容') setLocation('默认电容盒');
    else if (newCat === '芯片') setLocation('默认芯片盒');
    else if (newCat === '二极管' || newCat === '三极管/MOS') setLocation('半导体二极管盒');
    else if (newCat === '接插件') setLocation('接插件与模块盒');
  };

  // 实时检测同款查重
  useEffect(() => {
    if (!name.trim() && !lcscPart.trim()) {
      setDuplicateMatch(null);
      return;
    }

    const cleanLcsc = lcscPart.trim().toUpperCase();
    const cleanName = name.trim().toLowerCase();
    const cleanPkg = pkg.trim().toLowerCase();

    const match = components.find((c) => {
      if (cleanLcsc && c.lcsc_part && c.lcsc_part.trim().toUpperCase() === cleanLcsc) {
        return true;
      }
      if (cleanName && c.name && c.name.trim().toLowerCase() === cleanName) {
        if (cleanPkg && c.package) {
          return c.package.trim().toLowerCase() === cleanPkg;
        }
        return true;
      }
      return false;
    });

    setDuplicateMatch(match || null);
  }, [name, lcscPart, pkg, components]);

  // 立创官方参数秒拉
  const handleQueryOfficial = async (textToQuery?: string) => {
    const q = textToQuery || lcscPart || name;
    if (!q || !q.trim()) return;
    setIsQueryingOfficial(true);
    try {
      const res = await componentApi.queryOfficial(q.trim());
      if (res.success && res.data) {
        const off = res.data;
        setOfficialData(off);
        if (off.name) setName(off.name);
        if (off.category) setCategory(off.category);
        if (off.package) setPkg(off.package);
        if (off.value) setValue(off.value);
        if (off.lcsc_part) setLcscPart(off.lcsc_part);
        showToast(`✔ 已从立创官方库匹配: ${off.name}`, 'success');
      } else {
        showToast('立创官方库暂未直接命中，已保留本地输入', 'info');
      }
    } catch (err: any) {
      showToast('立创查询失败: ' + err.message, 'warn');
    } finally {
      setIsQueryingOfficial(false);
    }
  };

  // 极速点录文本智能解析
  const handleParseText = async (textToParse = rawText) => {
    if (!textToParse.trim()) return;
    setIsParsing(true);
    try {
      const res = await componentApi.parseText(textToParse);
      if (res.success && res.data) {
        const d = res.data;
        if (d.name) setName(d.name);
        if (d.category) handleCategoryChange(d.category);
        if (d.package) setPkg(d.package);
        if (d.value) setValue(d.value);
        if (d.quantity) setQuantity(d.quantity);
        if (d.location) setLocation(d.location);
        if (d.lcsc_part) {
          setLcscPart(d.lcsc_part);
          // 自动触发官方反查
          handleQueryOfficial(d.lcsc_part);
        }
        if (d.notes) setNotes(d.notes);
        showToast('已智能提取规格参数', 'info');
      }
    } catch (err: any) {
      showToast('智能解析异常: ' + err.message, 'warn');
    } finally {
      setIsParsing(false);
    }
  };

  // 单件保存逻辑 (keepNext 表示是否继续下一笔)
  const handleSaveSingle = async (keepNext = false) => {
    if (!name.trim()) {
      showToast('请输入物料名称或型号', 'warn');
      return;
    }
    setSaving(true);
    try {
      await componentApi.create({
        name,
        category,
        package: pkg,
        value,
        quantity,
        location: location.trim() || '随手存放处',
        notes,
        lcsc_part: lcscPart,
      });

      showToast(`✔ 成功录入: ${name} x${quantity}`, 'success');
      fetchComponents();
      fetchStats();

      if (keepNext) {
        // 保留 location 和 category，清空具体物料
        setName('');
        setValue('');
        setLcscPart('');
        setNotes('');
        setRawText('');
        setOfficialData(null);
        setDuplicateMatch(null);
        nameInputRef.current?.focus();
      } else {
        setEntryDrawerOpen(false);
      }
    } catch (err: any) {
      showToast('入库失败: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 直接在现有同款库存上追加数量
  const handleMergeDuplicate = async () => {
    if (!duplicateMatch) return;
    setSaving(true);
    try {
      await componentApi.adjustQuantity(
        duplicateMatch.id,
        quantity,
        `由「记一笔」防重合并追加入库 +${quantity}`
      );
      showToast(`✔ 已为「${duplicateMatch.name}」追加 +${quantity} 件 (新余量: ${duplicateMatch.quantity + quantity})`, 'success');
      fetchComponents();
      fetchStats();
      setEntryDrawerOpen(false);
    } catch (err: any) {
      showToast('追加失败: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---------- 批量流处理逻辑 ----------
  const handleParseBatchText = async () => {
    if (!batchRawText.trim()) {
      showToast('请先粘贴批量文本', 'warn');
      return;
    }
    setBatchParsing(true);
    try {
      const res = await componentApi.parseBatch(batchRawText);
      if (res.success && res.items) {
        setBatchItems(res.items);
        showToast(`✔ 成功拆解 ${res.items.length} 种物料并完成全库查重！`, 'success');
      }
    } catch (err: any) {
      showToast('批量拆解失败: ' + err.message, 'error');
    } finally {
      setBatchParsing(false);
    }
  };

  const handleSaveBatch = async () => {
    if (batchItems.length === 0) return;
    setBatchSaving(true);
    try {
      const itemsToPost = batchItems.map((item) => ({
        name: item.name,
        category: item.category || '其他',
        package: item.package || '',
        value: item.value || '',
        quantity: item.quantity || 100,
        location: item.location || '批量入库处',
        lcsc_part: item.lcsc_part || '',
        duplicateTargetId: item.duplicate?.exists ? item.duplicate.id : null,
      }));

      await componentApi.batchAdd(itemsToPost);
      showToast(`✔ 成功将 ${batchItems.length} 种物料批量入库并合并！`, 'success');
      fetchComponents();
      fetchStats();
      setBatchItems([]);
      setBatchRawText('');
      setEntryDrawerOpen(false);
    } catch (err: any) {
      showToast('批量入库失败: ' + err.message, 'error');
    } finally {
      setBatchSaving(false);
    }
  };

  return (
    <Drawer
      isOpen={isEntryDrawerOpen}
      onClose={() => setEntryDrawerOpen(false)}
      title="＋ 录入元器件"
      subtitle="单件连续流水记账 / 立创官方秒拉 / 实时防重合并 / 批量多行导入"
      footer={
        entryMode === 'single' ? (
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveSingle(true)}
              className="flex-1 py-2.5 bg-subtle hover:bg-surface-hover border border-border-subtle text-text-main font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
              title="保存当前物料并保留收纳盒，继续记下一笔"
            >
              <RefreshCw className="w-3.5 h-3.5 text-accent" />
              <span>保存并记下一笔</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveSingle(false)}
              className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <Check className="w-4 h-4" />
              <span>确认存入并关闭</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={batchSaving || batchItems.length === 0}
            onClick={handleSaveBatch}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <Check className="w-4 h-4" />
            <span>确认批量存入库中 ({batchItems.length} 项)</span>
          </button>
        )
      }
    >
      <div className="space-y-4 text-xs">
        {/* 顶部单件 / 批量模式切换 */}
        <div className="flex items-center gap-1 p-1 bg-subtle rounded-xl">
          <button
            type="button"
            onClick={() => setEntryMode('single')}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all',
              entryMode === 'single'
                ? 'bg-surface text-accent shadow-sm'
                : 'text-text-muted hover:text-text-main'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>⚡ 单件极速记账</span>
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('batch')}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all',
              entryMode === 'batch'
                ? 'bg-surface text-accent shadow-sm'
                : 'text-text-muted hover:text-text-main'
            )}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>📋 多行批量表格导入</span>
          </button>
        </div>

        {/* ================= 模式 1: 单件极速记账 ================= */}
        {entryMode === 'single' && (
          <div className="space-y-4">
            {/* 自然语言极速点录框 */}
            <div className="p-3 bg-canvas border border-border-subtle rounded-xl space-y-2">
              <label className="text-[11px] font-semibold text-text-muted flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  <span>一句话极速识别：品名、立创号、封装、数量</span>
                </span>
                <span className="text-[10px] text-text-dim">支持按回车解析</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleParseText()}
                  placeholder="如: 0805 10k 100只 / C2057 50pcs / AMS1117 10片"
                  className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-main focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  disabled={isParsing || !rawText.trim()}
                  onClick={() => handleParseText()}
                  className="px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg text-xs disabled:opacity-50 transition-colors"
                >
                  {isParsing ? '解析中' : '解析'}
                </button>
              </div>

              {/* 快捷示例药丸 */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] text-text-dim no-scrollbar pt-0.5">
                <span>示例:</span>
                {['0805 10k 100只', '0603 100nF 50V', 'C2057 50只', 'AMS1117-3.3 10片'].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setRawText(ex);
                      handleParseText(ex);
                    }}
                    className="px-2 py-0.5 bg-subtle hover:bg-surface-hover rounded-md border border-border-subtle transition-colors shrink-0"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* 同款物料查重提示卡片 */}
            {duplicateMatch && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-amber-800">
                  <span className="font-semibold flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>检测到在库已有同款物料</span>
                  </span>
                  <span className="text-[11px] font-mono font-bold">
                    现存: {duplicateMatch.quantity} 件
                  </span>
                </div>
                <div className="text-[11px] text-text-muted flex items-center justify-between">
                  <span>
                    「<strong className="text-text-main">{duplicateMatch.name}</strong>」位于 📦 {duplicateMatch.location || '未标注'}
                  </span>
                  <button
                    type="button"
                    onClick={handleMergeDuplicate}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>直接追加 (+{quantity}件)</span>
                  </button>
                </div>
              </div>
            )}

            {/* 立创官方认证参数卡片 */}
            {officialData && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-emerald-800">
                  <span className="font-semibold flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>立创官方库直连认证物料</span>
                  </span>
                  {officialData.manufacturer && (
                    <span className="text-[10px] text-emerald-700 font-mono">
                      原厂: {officialData.manufacturer}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-text-muted">
                  官方品名: <strong className="text-text-main">{officialData.name}</strong>
                  {officialData.package && <span className="ml-1 font-mono">[{officialData.package}]</span>}
                </div>
              </div>
            )}

            {/* 表单字段详细维护 */}
            <div className="space-y-3">
              {/* 型号与立创物料号 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-text-dim mb-1 font-medium">型号 / 品名 *</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如: 0805 10kΩ ±1%"
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-text-dim mb-1 font-medium flex items-center justify-between">
                    <span>立创C编号</span>
                    <button
                      type="button"
                      disabled={isQueryingOfficial || !lcscPart.trim()}
                      onClick={() => handleQueryOfficial(lcscPart)}
                      className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                      title="向立创商城官方拉取原厂参数"
                    >
                      <Search className="w-2.5 h-2.5" />
                      <span>{isQueryingOfficial ? '查询中' : '反查'}</span>
                    </button>
                  </label>
                  <input
                    type="text"
                    value={lcscPart}
                    onChange={(e) => setLcscPart(e.target.value)}
                    onBlur={() => lcscPart.trim() && handleQueryOfficial(lcscPart)}
                    placeholder="如: C2057"
                    className="w-full bg-surface border border-border-subtle rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-text-main focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* 分类与封装 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-text-dim mb-1 font-medium">分类</label>
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
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
                    placeholder="0805 / SOP-8"
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* 参数值与数量快捷步进 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-text-dim mb-1 font-medium">阻值 / 参数值</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="10kΩ / 100nF"
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main font-mono focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-text-dim mb-1 font-medium flex items-center justify-between">
                    <span>入库数量 (件)</span>
                    <div className="flex gap-1 text-[10px]">
                      {[10, 50, 100].map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setQuantity((q) => q + step)}
                          className="px-1 py-0.2 bg-subtle hover:bg-surface-hover rounded text-text-dim hover:text-accent font-mono"
                        >
                          +{step}
                        </button>
                      ))}
                    </div>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-main focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* 存放收纳盒与下拉联想 */}
              <div>
                <label className="block text-text-dim mb-1 font-medium flex items-center justify-between">
                  <span>存放物理收纳盒 *</span>
                  <span className="text-[10px] text-text-dim">输入新名字自动新建</span>
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="输入或选择收纳盒，如: 默认电阻盒"
                    className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                  />

                  {/* 常用已有收纳盒快速药丸 */}
                  {boxes.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] text-text-dim no-scrollbar pt-0.5">
                      <span className="shrink-0 flex items-center gap-0.5">
                        <Box className="w-2.5 h-2.5" />
                        <span>已有盒:</span>
                      </span>
                      {boxes.map((b) => (
                        <button
                          key={b.name}
                          type="button"
                          onClick={() => setLocation(b.name)}
                          className={cn(
                            'px-2 py-0.5 rounded-md border transition-colors shrink-0 font-medium',
                            location === b.name
                              ? 'bg-accent/10 border-accent text-accent'
                              : 'bg-subtle hover:bg-surface-hover border-border-subtle text-text-muted'
                          )}
                        >
                          {b.name} ({b.totalTypes}种)
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-text-dim mb-1 font-medium">备注说明 (选填)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="记录进货渠道、用途或特殊耐压温漂特性..."
                  className="w-full bg-surface border border-border-subtle rounded-xl p-2.5 text-xs text-text-main focus:outline-none focus:border-accent resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= 模式 2: 多行批量表格导入 ================= */}
        {entryMode === 'batch' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-muted flex items-center justify-between">
                <span>粘贴多行元器件文本 (每行一件物料)</span>
                <button
                  type="button"
                  onClick={() => {
                    const sample = `0805 10k 1% 100只\n0805 1k 1% 100只\n0603 100nF 50V 50只\nAMS1117-3.3 SOT-223 10片\nC2057 20只`;
                    setBatchRawText(sample);
                  }}
                  className="text-[10px] text-accent hover:underline"
                >
                  填入批量示例
                </button>
              </label>
              <textarea
                rows={7}
                value={batchRawText}
                onChange={(e) => setBatchRawText(e.target.value)}
                placeholder={`支持粘贴从立创订单、Excel、记事本复制的多行数据：\n0805 10k 100只\n0603 100nF 50V 50只\nAMS1117-3.3 SOT-223 10片\nC2057 50只`}
                className="w-full font-mono text-xs p-3 rounded-xl border border-border-subtle bg-canvas/40 text-text-main focus:outline-none focus:border-accent"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={batchParsing || !batchRawText.trim()}
                  onClick={handleParseBatchText}
                  className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{batchParsing ? '正在智能拆解与查重...' : '拆解并比对库存'}</span>
                </button>
              </div>
            </div>

            {/* 批量解析结果表格预览 */}
            {batchItems.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border-subtle">
                <div className="flex items-center justify-between text-[11px] text-text-dim">
                  <span>已拆解 {batchItems.length} 项物料预览:</span>
                  <span className="text-accent font-semibold">支持自动合并库存</span>
                </div>

                <div className="bg-canvas border border-border-subtle rounded-xl max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle text-text-muted font-semibold bg-surface/50">
                        <th className="py-2 px-3">品名规格</th>
                        <th className="py-2 px-2">封装</th>
                        <th className="py-2 px-2 text-center">数量</th>
                        <th className="py-2 px-3 text-right">在库状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-[11px]">
                      {batchItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-surface-hover/50">
                          <td className="py-2 px-3 font-semibold text-text-main truncate max-w-[120px]">
                            {item.name}
                          </td>
                          <td className="py-2 px-2 font-mono text-text-muted">
                            {item.package || '-'}
                          </td>
                          <td className="py-2 px-2 text-center font-mono font-bold text-accent">
                            {item.quantity || 1}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {item.duplicate?.exists ? (
                              <span className="text-[10px] text-amber-700 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-medium">
                                追加现有 (现{item.duplicate.current_quantity})
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-medium">
                                新建入库
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};

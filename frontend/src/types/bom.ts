import { ComponentItem } from './component';

export type BomMatchStatus =
  | 'EXACT_MATCH'            // 现货免买 (绿)
  | 'SUBSTITUTE_AVAILABLE'   // 建议替代 (蓝)
  | 'LOW_STOCK'              // 需补库存 (黄)
  | 'LACK';                  // 必须采购 (红)

export interface BomColumnMapping {
  partCol: number;        // 型号/规格列
  footprintCol: number;   // 封装列
  designatorCol: number;  // 位号列
  quantityCol: number;    // 数量列
  lcscCol: number;        // 立创编号列
}

export interface BomParsedData {
  headers: string[];
  headerIndex: number;
  preview: any[][];
  totalRows: number;
  autoMapping: BomColumnMapping;
  detectedTemplate: string;
  dataRows: any[][];
}

export interface BomRawItemRow {
  rowIndex: number;
  designator: string;
  quantity: number;
  unitQty?: number;
}

export interface BomSubstituteOption {
  component: ComponentItem;
  reason: string;
  isFullSubstitute: boolean;
  ruleId?: number;
}

export interface BomMatchResult {
  rowIndex: number;
  partName: string;
  footprint: string;
  designators: string;
  unitQty: number;
  qtyNeeded: number;
  multiplier: number;
  shortageQty: number;
  lcscPart?: string;
  status: BomMatchStatus;
  parsed?: { category?: string; [key: string]: any };
  matchedStock?: ComponentItem | null;
  substituteOption?: BomSubstituteOption | null;
  isAdoptedSubstitute?: boolean;
  customSubstitute?: ComponentItem | null; // 用户手动指定的替代料
  rawRows?: BomRawItemRow[];
}

export interface BomSummary {
  exactMatchCount: number;
  substituteCount: number;
  lowStockCount: number;
  lackCount: number;
  totalItems: number;
  totalQtyNeeded?: number;
  totalShortageQty?: number;
}

export interface PickListEntry {
  id: number;
  name: string;
  package?: string;
  location: string;
  box_name?: string;
  takeQty: number;
  availableQty: number;
  designators?: string;
  partName?: string;
  isSubstitute?: boolean;
  substituteReason?: string;
}

export interface ShortageItem {
  rowIndex: number;
  partName: string;
  footprint: string;
  designators: string;
  qtyNeeded: number;
  missingQty: number;
  lcscPart?: string;
  reason: string;
}

export interface SubstituteRule {
  id: number;
  target_part: string;
  substitute_part_id?: number | null;
  substitute_name: string;
  note?: string;
  created_at?: string;
}

// 兼容旧组件的类型别名
export interface BomRow {
  rowIndex: number;
  designator: string;
  comment: string;
  footprint: string;
  quantity: number;
  lcscPart?: string;
}

export interface PickListItem {
  componentId?: number;
  name: string;
  location: string;
  package?: string;
  value?: string;
  quantity: number;
  designators: string[];
}

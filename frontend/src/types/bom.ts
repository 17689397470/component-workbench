import { ComponentItem } from './component';

export type BomMatchStatus =
  | 'EXACT_MATCH'            // 现货免买
  | 'SUBSTITUTE_AVAILABLE'   // 建议替代
  | 'LOW_STOCK'              // 需补库存 (差额)
  | 'LACK';                  // 必须采购

export interface BomRow {
  rowIndex: number;
  designator: string; // 位号 (如 R1, R2, C1)
  comment: string;    // 型号/阻值/规格
  footprint: string;  // 封装 (如 0805, 0603)
  quantity: number;   // 用量
  lcscPart?: string;  // 立创编号
}

export interface BomMatchResult {
  bomItem: BomRow;
  status: BomMatchStatus;
  matchedComponent?: ComponentItem;
  stockQuantity: number;
  neededQuantity: number;
  shortageQuantity: number;
  substituteCandidates?: ComponentItem[];
  selectedSubstituteId?: number;
}

export interface BomSummary {
  totalItems: number;
  exactMatchCount: number;
  substituteCount: number;
  lowStockCount: number;
  lackCount: number;
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

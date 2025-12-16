
export enum UserRole {
  ADMIN = 'ADMIN',
  SUB_UNIT = 'SUB_UNIT',
  QC = 'QC',
  MATERIALS = 'MATERIALS',
  INVENTORY = 'INVENTORY',
  SALES = 'SALES'
}

export interface AppUser {
  id: string | number;
  username: string;
  role: UserRole;
  full_name: string;
}

export enum OrderStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS', // Renamed from STARTED
  QC = 'QC',
  QC_APPROVED = 'QC_APPROVED', 
  PACKED = 'PACKED',
  COMPLETED = 'COMPLETED'
}

export enum BarcodeStatus {
  GENERATED = 'GENERATED',
  DETAILS_FILLED = 'DETAILS_FILLED',
  PUSHED_OUT_OF_SUBUNIT = 'PUSHED_OUT_OF_SUBUNIT',
  QC_APPROVED = 'QC_APPROVED',
  COMMITTED_TO_STOCK = 'COMMITTED_TO_STOCK',
  SOLD = 'SOLD'
}

export enum MaterialStatus {
  PENDING = 'PENDING',
  PARTIALLY_APPROVED = 'PARTIALLY_APPROVED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface Unit {
  id: number;
  name: string;
  is_main: boolean;
}

export interface SizeBreakdown {
  color: string;
  s: number;
  m: number;
  l: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

export interface Attachment {
  name: string;
  url: string;
  type: 'image' | 'document';
}

export interface Order {
  id: string;
  order_no: string;
  unit_id: number;
  style_number: string;
  quantity: number;
  box_count?: number; // Planned boxes
  actual_box_count?: number; // Actual boxes at completion
  last_barcode_serial?: number; // Tracks the last serial used for this specific order
  attachments?: Attachment[]; // Array of attachments
  attachment_url?: string; // Legacy: Single URL
  attachment_name?: string; // Legacy: Single Filename
  qc_attachment_url?: string; // URL to QC evidence/report file
  size_breakdown?: SizeBreakdown[]; // Planned Breakdown
  completion_breakdown?: SizeBreakdown[]; // Actual Breakdown
  description: string;
  qc_notes?: string; 
  target_delivery_date: string; // ISO Date
  status: OrderStatus;
  created_at?: string;
  size_format?: 'standard' | 'numeric'; // 'standard' = S,M,L... | 'numeric' = 65,70,75...
}

export interface MaterialRequest {
  id: string;
  order_id: string;
  requested_by_name?: string; 
  material_content: string;
  quantity_requested: number;
  quantity_approved: number;
  unit: string; // New field for Unit (Nos, Kgs, etc.)
  attachments?: Attachment[]; // Array of attachments
  status: MaterialStatus;
  created_at: string;
}

export interface MaterialApproval {
    id: number;
    request_id: string;
    qty_approved: number;
    created_at: string;
    approved_by_name?: string;
}

export interface OrderLog {
    id: number;
    order_id: string;
    log_type: 'STATUS_CHANGE' | 'MANUAL_UPDATE' | 'CREATION';
    message: string;
    created_at: string;
    created_by_name?: string;
}

export interface StockCommit {
  id: number;
  created_at: string;
  total_items: number;
  note?: string;
}

export interface Barcode {
  id: string;
  barcode_serial: string;
  order_id: string;
  style_number: string;
  size?: string;
  status: BarcodeStatus;
  invoice_id?: string; // Linked Invoice
  commit_id?: number; // Linked Stock Commit
}

export interface Invoice {
  id: string;
  invoice_no: string;
  customer_name: string;
  total_amount: number;
  created_at: string;
}

// --- FABRIC MANAGEMENT TYPES ---

export interface FabricLot {
    id: number;
    date: string; // Arrival Date
    dc_no: string;
    source_from: string;
    lot_no: string;
    fabric_color: string;
    dia: string;
    roll_count: number;
    total_kg: number;
    plan_to: string; // Editable
    review_notes?: string;
    created_at?: string;
    // Calculated fields (Frontend only, computed from logs)
    used_fabric?: number;
    balance_fabric?: number;
}

export interface FabricUsageLog {
    id: number;
    fabric_lot_id: number;
    date_time: string;
    used_kg: number;
    order_style_ref: string;
    action_type: 'ADD' | 'EDIT' | 'DELETE';
    previous_value?: number;
    new_value?: number;
    remarks?: string;
    updated_by?: string;
}

// Helper to determine next status for Order
export const getNextOrderStatus = (current: OrderStatus): OrderStatus | null => {
  switch (current) {
    case OrderStatus.ASSIGNED: return OrderStatus.IN_PROGRESS;
    case OrderStatus.IN_PROGRESS: return OrderStatus.QC;
    case OrderStatus.QC: return OrderStatus.QC_APPROVED;
    case OrderStatus.QC_APPROVED: return OrderStatus.COMPLETED; // Logic handled by modal now
    case OrderStatus.PACKED: return OrderStatus.COMPLETED;
    default: return null;
  }
};

// Helper to determine next status for Barcode
export const getNextBarcodeStatus = (current: BarcodeStatus): BarcodeStatus | null => {
  switch (current) {
    case BarcodeStatus.GENERATED: return BarcodeStatus.DETAILS_FILLED;
    case BarcodeStatus.DETAILS_FILLED: return BarcodeStatus.PUSHED_OUT_OF_SUBUNIT;
    case BarcodeStatus.PUSHED_OUT_OF_SUBUNIT: return BarcodeStatus.QC_APPROVED;
    case BarcodeStatus.QC_APPROVED: return BarcodeStatus.COMMITTED_TO_STOCK;
    case BarcodeStatus.COMMITTED_TO_STOCK: return BarcodeStatus.SOLD;
    default: return null;
  }
};

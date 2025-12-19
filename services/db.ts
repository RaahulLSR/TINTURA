
import { supabase } from './supabase';
import { Order, OrderStatus, MaterialRequest, Barcode, BarcodeStatus, Unit, MaterialStatus, Invoice, SizeBreakdown, AppUser, UserRole, StockCommit, MaterialApproval, OrderLog, Attachment, FabricLot, FabricUsageLog } from '../types';

// --- MOCK DATA FALLBACKS ---
const MOCK_USERS: AppUser[] = [
    { id: 1, username: 'admin', role: UserRole.ADMIN, full_name: 'Mock Admin' },
    { id: 2, username: 'unit', role: UserRole.SUB_UNIT, full_name: 'Mock Unit Head' },
    { id: 3, username: 'mat', role: UserRole.MATERIALS, full_name: 'Mock Materials' },
    { id: 4, username: 'stock', role: UserRole.INVENTORY, full_name: 'Mock Stock Mgr' },
    { id: 5, username: 'qc', role: UserRole.QC, full_name: 'Mock QC Officer' },
];

const MOCK_UNITS: Unit[] = [
  { id: 1, name: 'Main HQ (Branch 1)', is_main: true },
  { id: 2, name: 'Sewing Subunit (Branch 2)', is_main: false },
  { id: 3, name: 'Finishing Subunit', is_main: false },
];

let MOCK_ORDERS: Order[] = [
  { 
    id: '1', 
    order_no: 'ORD-10001', 
    unit_id: 2, 
    style_number: 'ST-500', 
    quantity: 100, 
    box_count: 5,
    last_barcode_serial: 0,
    description: 'Summer Shirts', 
    target_delivery_date: '2023-12-01', 
    status: OrderStatus.IN_PROGRESS,
    size_format: 'standard',
    size_breakdown: [
      { color: 'Red', s: 10, m: 20, l: 20, xl: 0, xxl: 0, xxxl: 0 },
      { color: 'Blue', s: 10, m: 20, l: 20, xl: 0, xxl: 0, xxxl: 0 }
    ],
    attachments: []
  },
  { id: '2', order_no: 'ORD-10002', unit_id: 3, style_number: 'ST-600', quantity: 50, box_count: 2, last_barcode_serial: 0, description: 'Denim Jackets', target_delivery_date: '2023-11-20', status: OrderStatus.ASSIGNED, size_format: 'standard', attachments: [] },
  { id: '3', order_no: 'ORD-10003', unit_id: 2, style_number: 'ST-500', quantity: 200, box_count: 10, last_barcode_serial: 0, description: 'Cotton Pants', target_delivery_date: '2023-12-15', status: OrderStatus.QC, qc_notes: 'Initial checks pending', size_format: 'numeric', attachments: [] },
];

let MOCK_REQUESTS: MaterialRequest[] = [
  { id: '101', order_id: '1', material_content: 'Blue Thread (50 spools)', quantity_requested: 50, quantity_approved: 0, unit: 'Nos', status: MaterialStatus.PENDING, created_at: new Date().toISOString(), attachments: [] }
];

let MOCK_FABRIC_LOTS: FabricLot[] = [];
let MOCK_FABRIC_LOGS: FabricUsageLog[] = [];
let MOCK_LOGS: OrderLog[] = [];
let MOCK_APPROVALS: MaterialApproval[] = [];

let MOCK_BARCODES: Barcode[] = [
  { id: 'b1', barcode_serial: 'ORD-10001;ST-500;M;100001', order_id: '1', style_number: 'ST-500', size: 'M', status: BarcodeStatus.PUSHED_OUT_OF_SUBUNIT },
  { id: 'b2', barcode_serial: 'ORD-10001;ST-500;L;100002', order_id: '1', style_number: 'ST-500', size: 'L', status: BarcodeStatus.PUSHED_OUT_OF_SUBUNIT },
  { id: 'b3', barcode_serial: 'ORD-10001;ST-500;S;100003', order_id: '1', style_number: 'ST-500', size: 'S', status: BarcodeStatus.GENERATED },
];

let MOCK_COMMITS: StockCommit[] = [];
let MOCK_INVOICES: Invoice[] = [];

// --- AUTHENTICATION ---
export const authenticateUser = async (username: string, password: string): Promise<AppUser | null> => {
    const { data, error } = await supabase.from('app_users').select('*').eq('username', username).eq('password', password).single();
    if (error || !data) {
        if (password === 'demo') {
             const mock = MOCK_USERS.find(u => u.username === username);
             if (mock) return mock;
        }
        return null;
    }
    return { id: data.id, username: data.username, role: data.role as UserRole, full_name: data.full_name };
};

// --- TIMELINE / LOGS FUNCTIONS ---
export const fetchOrderLogs = async (orderId?: string): Promise<OrderLog[]> => {
    let query = supabase.from('order_logs').select('*').order('created_at', { ascending: false });
    if (orderId) query = query.eq('order_id', orderId);
    const { data, error } = await query;
    if (error || !data) return orderId ? MOCK_LOGS.filter(l => l.order_id === orderId) : MOCK_LOGS;
    return data as OrderLog[];
};

export const addOrderLog = async (orderId: string, type: 'STATUS_CHANGE' | 'MANUAL_UPDATE' | 'CREATION', message: string) => {
    const { error } = await supabase.from('order_logs').insert([{ order_id: orderId, log_type: type, message: message, created_by_name: 'System' }]);
    if (error) MOCK_LOGS.unshift({ id: Date.now(), order_id: orderId, log_type: type, message, created_at: new Date().toISOString() });
};

// --- ORDER FUNCTIONS ---
export const fetchUnits = async (): Promise<Unit[]> => {
    const { data, error } = await supabase.from('units').select('*').order('id');
    if (error || !data || data.length === 0) return MOCK_UNITS;
    return data as Unit[];
};

export const fetchOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error || !data) return MOCK_ORDERS; 
  return data as Order[];
};

export const createOrder = async (order: Partial<Order>): Promise<Order | null> => {
    const payload: any = { ...order, status: OrderStatus.ASSIGNED, last_barcode_serial: 0 };
    const { data, error } = await supabase.from('orders').insert([payload]).select().single();
    if (error) {
        const newOrder = { ...order, order_no: `ORD-${Date.now().toString().substr(-5)}`, id: Math.random().toString(), status: OrderStatus.ASSIGNED, last_barcode_serial: 0, attachments: order.attachments || [] } as Order;
        MOCK_ORDERS.push(newOrder);
        addOrderLog(newOrder.id, 'CREATION', 'Order Created and Assigned');
        return newOrder;
    }
    if (data) await addOrderLog(data.id, 'CREATION', 'Order Created and Assigned');
    return data;
};

export const deleteOrderSafely = async (orderId: string): Promise<{ success: boolean, message: string }> => {
    const { data: committedBarcodes, error: checkError } = await supabase.from('barcodes').select('id').eq('order_id', orderId).or(`status.eq.${BarcodeStatus.COMMITTED_TO_STOCK},status.eq.${BarcodeStatus.SOLD}`);
    if (committedBarcodes && committedBarcodes.length > 0) return { success: false, message: "Order cannot be deleted because items are already in stock." };
    await supabase.from('barcodes').delete().eq('order_id', orderId);
    await supabase.from('material_requests').delete().eq('order_id', orderId);
    const { error: deleteError } = await supabase.from('orders').delete().eq('id', orderId);
    if (deleteError) return { success: false, message: `Deletion failed: ${deleteError.message}` };
    return { success: true, message: "Order deleted successfully." };
};

export const updateOrderStatus = async (orderId: string, status: OrderStatus, notes?: string, completionData?: { completion_breakdown: SizeBreakdown[], actual_box_count: number }, qcAttachmentUrl?: string): Promise<void> => {
   const payload: any = { status, qc_notes: notes, ...completionData, qc_attachment_url: qcAttachmentUrl };
   await supabase.from('orders').update(payload).eq('id', orderId);
   await addOrderLog(orderId, 'STATUS_CHANGE', notes || `Status changed to ${status}`);
};

export const updateOrderDetails = async (orderId: string, updates: Partial<Order>) => {
    await supabase.from('orders').update(updates).eq('id', orderId);
    await addOrderLog(orderId, 'MANUAL_UPDATE', 'Order details updated by Admin');
};

// --- MATERIAL FUNCTIONS ---
export const fetchMaterialRequests = async (): Promise<MaterialRequest[]> => {
    const { data, error } = await supabase.from('material_requests').select('*').order('created_at', { ascending: false });
    if (error || !data) return MOCK_REQUESTS;
    return data as MaterialRequest[];
};

export const createMaterialRequest = async (req: Partial<MaterialRequest>) => {
    await supabase.from('material_requests').insert([{ ...req, status: MaterialStatus.PENDING }]);
};

export const updateMaterialRequest = async (id: string, updates: Partial<MaterialRequest>) => {
    await supabase.from('material_requests').update(updates).eq('id', id);
};

export const deleteMaterialRequest = async (id: string) => {
    await supabase.from('material_requests').delete().eq('id', id);
};

export const approveMaterialRequest = async (id: string, qtyApprovedNow: number, currentTotalApproved: number, newStatus: MaterialStatus) => {
    await supabase.from('material_approvals').insert([{ request_id: id, qty_approved: qtyApprovedNow, approved_by_name: 'Materials Dept' }]);
    await supabase.from('material_requests').update({ quantity_approved: currentTotalApproved + qtyApprovedNow, status: newStatus }).eq('id', id);
};

export const fetchMaterialApprovals = async (requestId: string): Promise<MaterialApproval[]> => {
    const { data, error } = await supabase.from('material_approvals').select('*').eq('request_id', requestId).order('created_at', { ascending: true });
    if (error || !data) return MOCK_APPROVALS.filter(a => a.request_id === requestId);
    return data as MaterialApproval[];
};

// --- BARCODE FUNCTIONS ---
export const fetchBarcodes = async (statusFilter?: BarcodeStatus): Promise<Barcode[]> => {
    let query = supabase.from('barcodes').select('*');
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error || !data) return statusFilter ? MOCK_BARCODES.filter(b => b.status === statusFilter) : MOCK_BARCODES;
    return data as Barcode[];
};

export const generateBarcodes = async (orderId: string, count: number, style: string, size: string) => {
    const { data: ord } = await supabase.from('orders').select('order_no, last_barcode_serial').eq('id', orderId).single();
    let currentSerial = ord?.last_barcode_serial || 0;
    const newBarcodes = [];
    for (let i = 1; i <= count; i++) {
        currentSerial++;
        newBarcodes.push({ barcode_serial: `${ord?.order_no || 'UNK'};${style};${size};${currentSerial.toString().padStart(5, '0')}`, order_id: orderId, style_number: style, size, status: BarcodeStatus.GENERATED });
    }
    const { data } = await supabase.from('barcodes').insert(newBarcodes).select();
    await supabase.from('orders').update({ last_barcode_serial: currentSerial }).eq('id', orderId);
    return data as Barcode[];
};

export const commitBarcodesToStock = async (serials: string[]) => {
    const { data } = await supabase.from('stock_commits').insert([{ total_items: serials.length }]).select().single();
    await supabase.from('barcodes').update({ status: BarcodeStatus.COMMITTED_TO_STOCK, commit_id: data.id }).in('barcode_serial', serials);
};

export const fetchBarcodesBySerialList = async (serials: string[]): Promise<Barcode[]> => {
    const { data } = await supabase.from('barcodes').select('*').in('barcode_serial', serials);
    return (data as Barcode[]) || [];
};

export const fetchStockCommits = async (): Promise<StockCommit[]> => {
    const { data } = await supabase.from('stock_commits').select('*').order('created_at', { ascending: false });
    return (data as StockCommit[]) || [];
};

export const fetchBarcodesByCommit = async (commitId: number): Promise<Barcode[]> => {
    const { data } = await supabase.from('barcodes').select('*').eq('commit_id', commitId);
    return (data as Barcode[]) || [];
};

// --- FABRIC MANAGEMENT LOGIC ---
export const fetchFabricLots = async (): Promise<FabricLot[]> => {
    const { data: lots } = await supabase.from('fabric_lots').select('*').order('date', { ascending: false });
    const { data: logs } = await supabase.from('fabric_usage_logs').select('*');
    if (!lots) return [];
    return (lots as FabricLot[]).map(lot => {
        const totalUsed = logs?.filter((l: FabricUsageLog) => l.fabric_lot_id === lot.id).reduce((acc: number, log: FabricUsageLog) => acc + log.used_kg, 0) || 0;
        return { ...lot, used_fabric: totalUsed, balance_fabric: lot.total_kg - totalUsed };
    });
};

export const fetchFabricLogs = async (lotId: number): Promise<FabricUsageLog[]> => {
    const { data } = await supabase.from('fabric_usage_logs').select('*').eq('fabric_lot_id', lotId).order('date_time', { ascending: false });
    return (data as FabricUsageLog[]) || [];
};

export const addFabricLot = async (lot: Partial<FabricLot>) => {
    return await supabase.from('fabric_lots').insert([lot]).select();
};

export const updateFabricLot = async (id: number, updates: Partial<FabricLot>) => {
    await supabase.from('fabric_lots').update(updates).eq('id', id);
};

export const logFabricUsage = async (lotId: number, usedKg: number, orderRef: string, remarks?: string, action: 'ADD' | 'EDIT' | 'DELETE' = 'ADD') => {
    await supabase.from('fabric_usage_logs').insert([{ fabric_lot_id: lotId, used_kg: usedKg, order_style_ref: orderRef, action_type: action, remarks }]);
};

export const updateFabricUsageLog = async (logId: number, usedKg: number, remarks?: string) => {
    await supabase.from('fabric_usage_logs').update({ used_kg: usedKg, remarks: remarks || 'Corrected Entry', action_type: 'EDIT' }).eq('id', logId);
};

export const deleteFabricUsageLog = async (logId: number) => {
    await supabase.from('fabric_usage_logs').delete().eq('id', logId);
};

export const updateFabricLotPlan = async (lotId: number, planTo: string) => {
    await supabase.from('fabric_lots').update({ plan_to: planTo }).eq('id', lotId);
};

// --- SALES LOGIC ---
export const fetchInvoices = async (): Promise<Invoice[]> => {
    const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
    return (data as Invoice[]) || [];
};

export const fetchInvoiceItems = async (invoiceId: string): Promise<Barcode[]> => {
    const { data } = await supabase.from('barcodes').select('*').eq('invoice_id', invoiceId);
    return (data as Barcode[]) || [];
};

export const createInvoice = async (customerName: string, barcodeIds: string[], invoiceNo: string): Promise<Invoice> => {
    const { data: inv } = await supabase.from('invoices').insert([{ invoice_no: invoiceNo, customer_name: customerName, total_amount: barcodeIds.length * 25 }]).select().single();
    await supabase.from('barcodes').update({ status: BarcodeStatus.SOLD, invoice_id: inv.id }).in('id', barcodeIds);
    return inv as Invoice;
};

export const uploadOrderAttachment = async (file: File): Promise<string | null> => {
    const fileName = `${Date.now()}-${file.name}`;
    await supabase.storage.from('order-attachments').upload(fileName, file);
    const { data } = supabase.storage.from('order-attachments').getPublicUrl(fileName);
    return data.publicUrl;
};

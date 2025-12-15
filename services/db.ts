import { supabase } from './supabase';
import { Order, OrderStatus, MaterialRequest, Barcode, BarcodeStatus, Unit, MaterialStatus, Invoice, SizeBreakdown, AppUser, UserRole } from '../types';

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
    status: OrderStatus.STARTED,
    size_breakdown: [
      { color: 'Red', s: 10, m: 20, l: 20, xl: 0, xxl: 0, xxxl: 0 },
      { color: 'Blue', s: 10, m: 20, l: 20, xl: 0, xxl: 0, xxxl: 0 }
    ]
  },
  { id: '2', order_no: 'ORD-10002', unit_id: 3, style_number: 'ST-600', quantity: 50, box_count: 2, last_barcode_serial: 0, description: 'Denim Jackets', target_delivery_date: '2023-11-20', status: OrderStatus.ASSIGNED },
  { id: '3', order_no: 'ORD-10003', unit_id: 2, style_number: 'ST-500', quantity: 200, box_count: 10, last_barcode_serial: 0, description: 'Cotton Pants', target_delivery_date: '2023-12-15', status: OrderStatus.QC, qc_notes: 'Initial checks pending' },
];

let MOCK_REQUESTS: MaterialRequest[] = [
  { id: '101', order_id: '1', material_content: 'Blue Thread (50 spools)', quantity_requested: 50, quantity_approved: 0, status: MaterialStatus.PENDING, created_at: new Date().toISOString() }
];

let MOCK_BARCODES: Barcode[] = [
  { id: 'b1', barcode_serial: 'ORD-10001;ST-500;M;100001', order_id: '1', style_number: 'ST-500', size: 'M', status: BarcodeStatus.PUSHED_OUT_OF_SUBUNIT },
  { id: 'b2', barcode_serial: 'ORD-10001;ST-500;L;100002', order_id: '1', style_number: 'ST-500', size: 'L', status: BarcodeStatus.PUSHED_OUT_OF_SUBUNIT },
  { id: 'b3', barcode_serial: 'ORD-10001;ST-500;S;100003', order_id: '1', style_number: 'ST-500', size: 'S', status: BarcodeStatus.GENERATED },
];

// --- AUTHENTICATION ---

export const authenticateUser = async (username: string, password: string): Promise<AppUser | null> => {
    // Try Supabase first
    const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('password', password) // Basic plaintext check as requested
        .single();

    if (error || !data) {
        console.warn("Auth Failed / Using Mock", error?.message);
        // Fallback for demo if DB isn't set up yet
        if (password === 'demo') {
             const mock = MOCK_USERS.find(u => u.username === username);
             if (mock) return mock;
        }
        return null;
    }

    return {
        id: data.id,
        username: data.username,
        role: data.role as UserRole,
        full_name: data.full_name
    };
};

// --- API FUNCTIONS ---

export const fetchUnits = async (): Promise<Unit[]> => {
    const { data, error } = await supabase.from('units').select('*').order('id');
    if (error || !data || data.length === 0) {
        console.warn("Using Mock Units. DB Error:", error?.message);
        return MOCK_UNITS;
    }
    return data as Unit[];
};

export const fetchOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  if (error || !data) {
      console.warn("Using Mock Orders. DB Error:", error?.message);
      return MOCK_ORDERS; 
  }
  return data as Order[];
};

// Updated Create Order to handle attachments
export const createOrder = async (order: Partial<Order>): Promise<Order | null> => {
    // Supabase will handle order_no generation via Sequence and Default value
    const { data, error } = await supabase.from('orders').insert([{
        unit_id: order.unit_id,
        style_number: order.style_number,
        quantity: order.quantity,
        box_count: order.box_count,
        size_breakdown: order.size_breakdown,
        description: order.description,
        target_delivery_date: order.target_delivery_date,
        last_barcode_serial: 0,
        attachment_url: order.attachment_url,
        attachment_name: order.attachment_name,
        status: OrderStatus.ASSIGNED
    }]).select().single();

    if (error) {
        console.error("Supabase Create Error (Using Mock):", error.message);
        const newOrder = { 
            ...order, 
            order_no: `ORD-${Date.now().toString().substr(-5)}`,
            id: Math.random().toString(), 
            status: OrderStatus.ASSIGNED,
            last_barcode_serial: 0
        } as Order;
        MOCK_ORDERS.push(newOrder);
        return newOrder;
    }
    return data;
};

// Updated to handle completion data
export const updateOrderStatus = async (
    orderId: string, 
    status: OrderStatus, 
    notes?: string,
    completionData?: { completion_breakdown: SizeBreakdown[], actual_box_count: number }
): Promise<void> => {
   
   const payload: any = { status, qc_notes: notes };
   if (completionData) {
       payload.completion_breakdown = completionData.completion_breakdown;
       payload.actual_box_count = completionData.actual_box_count;
   }

   const { error } = await supabase.from('orders').update(payload).eq('id', orderId);
   
   if (error) {
       console.warn("Update Failed (Using Mock):", error.message);
       MOCK_ORDERS = MOCK_ORDERS.map(o => {
           if (o.id === orderId) {
               return { 
                   ...o, 
                   status, 
                   qc_notes: notes || o.qc_notes,
                   ...(completionData || {}) 
                };
           }
           return o;
       });
   }
};

export const fetchMaterialRequests = async (): Promise<MaterialRequest[]> => {
    const { data, error } = await supabase.from('material_requests').select('*').order('created_at', { ascending: false });
    if (error || !data) {
        console.warn("Using Mock Requests. DB Error:", error?.message);
        return MOCK_REQUESTS;
    }
    return data as MaterialRequest[];
};

export const createMaterialRequest = async (req: Partial<MaterialRequest>) => {
    const { error } = await supabase.from('material_requests').insert([{
        order_id: req.order_id,
        material_content: req.material_content,
        quantity_requested: req.quantity_requested,
        attachment_url: req.attachment_url,
        status: MaterialStatus.PENDING
    }]);

    if (error) {
        console.warn("Req Create Failed (Using Mock):", error.message);
        MOCK_REQUESTS.push({ ...req, id: Math.random().toString(), status: MaterialStatus.PENDING, quantity_approved: 0 } as MaterialRequest);
    }
};

export const approveMaterialRequest = async (id: string, qtyApproved: number, status: MaterialStatus) => {
    const { error } = await supabase.from('material_requests').update({ 
        quantity_approved: qtyApproved, 
        status 
    }).eq('id', id);

    if (error) {
        MOCK_REQUESTS = MOCK_REQUESTS.map(r => r.id === id ? { ...r, quantity_approved: qtyApproved, status } : r);
    }
};

export const fetchBarcodes = async (statusFilter?: BarcodeStatus): Promise<Barcode[]> => {
    let query = supabase.from('barcodes').select('*');
    if (statusFilter) {
        query = query.eq('status', statusFilter);
    }
    const { data, error } = await query;
    if (error || !data) {
        console.warn("Using Mock Barcodes. DB Error:", error?.message);
        if (statusFilter) return MOCK_BARCODES.filter(b => b.status === statusFilter);
        return MOCK_BARCODES;
    }
    return data as Barcode[];
};

export const fetchBarcodesBySerialList = async (serials: string[]): Promise<Barcode[]> => {
    if (serials.length === 0) return [];
    const { data, error } = await supabase.from('barcodes').select('*').in('barcode_serial', serials);
    if (error || !data) return MOCK_BARCODES.filter(b => serials.includes(b.barcode_serial));
    return data as Barcode[];
};

export const generateBarcodes = async (orderId: string, count: number, style: string, size: string) => {
    const orderRes = await supabase.from('orders').select('order_no, last_barcode_serial').eq('id', orderId).single();
    
    let orderNo = 'UNK';
    let currentSerial = 0;

    if (orderRes.error || !orderRes.data) {
        const mockOrder = MOCK_ORDERS.find(o => o.id === orderId);
        if (mockOrder) {
            orderNo = mockOrder.order_no;
            currentSerial = mockOrder.last_barcode_serial || 0;
        }
    } else {
        orderNo = orderRes.data.order_no;
        currentSerial = orderRes.data.last_barcode_serial || 0;
    }

    const newBarcodes = [];
    
    for (let i = 1; i <= count; i++) {
        currentSerial++;
        const uniqueSerial = currentSerial.toString().padStart(5, '0');
        const barcodeStr = `${orderNo};${style};${size};${uniqueSerial}`; 
        
        newBarcodes.push({
            barcode_serial: barcodeStr,
            order_id: orderId,
            style_number: style,
            size: size,
            status: BarcodeStatus.GENERATED
        });
    }

    const { data, error } = await supabase.from('barcodes').insert(newBarcodes).select();
    await supabase.from('orders').update({ last_barcode_serial: currentSerial }).eq('id', orderId);

    if (error) {
        console.warn("Barcode Gen Failed (Using Mock):", error.message);
        const mockMapped = newBarcodes.map(b => ({ ...b, id: Math.random().toString() }));
        MOCK_BARCODES = [...MOCK_BARCODES, ...mockMapped];
        MOCK_ORDERS = MOCK_ORDERS.map(o => o.id === orderId ? { ...o, last_barcode_serial: currentSerial } : o);
        return mockMapped;
    }

    return data as Barcode[];
};

export const bulkUpdateBarcodeStatusBySerial = async (serials: string[], status: BarcodeStatus) => {
    const { error } = await supabase.from('barcodes').update({ status }).in('barcode_serial', serials);
    if (error) {
         MOCK_BARCODES = MOCK_BARCODES.map(b => serials.includes(b.barcode_serial) ? { ...b, status } : b);
    }
}

export const createInvoice = async (customerName: string, barcodeIds: string[], customInvoiceNo?: string): Promise<Invoice> => {
    await supabase.from('barcodes').update({ status: BarcodeStatus.SOLD }).in('id', barcodeIds);

    const invoiceNo = customInvoiceNo || `INV-${Date.now()}`;
    const amount = barcodeIds.length * 25.00;

    const { data, error } = await supabase.from('invoices').insert([{
        invoice_no: invoiceNo,
        customer_name: customerName,
        total_amount: amount
    }]).select().single();

    if (error) {
        console.warn("Invoice Create Failed (Using Mock):", error.message);
        const inv = {
            id: Math.random().toString(),
            invoice_no: invoiceNo,
            customer_name: customerName,
            total_amount: amount,
            created_at: new Date().toISOString()
        };
        MOCK_BARCODES = MOCK_BARCODES.map(b => barcodeIds.includes(b.id) ? { ...b, status: BarcodeStatus.SOLD } : b);
        return inv;
    }

    return data as Invoice;
};

// NEW FUNCTION: Upload file to storage
export const uploadOrderAttachment = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error } = await supabase.storage
        .from('order-attachments')
        .upload(filePath, file);

    if (error) {
        console.error("Upload Error:", error.message);
        alert("Failed to upload file. Check if Bucket exists in Supabase.");
        return null;
    }

    const { data } = supabase.storage
        .from('order-attachments')
        .getPublicUrl(filePath);

    return data.publicUrl;
};

import React, { useEffect, useState } from 'react';
import { fetchOrders, updateOrderStatus, generateBarcodes, createMaterialRequest, fetchMaterialRequests, uploadOrderAttachment, addOrderLog, fetchOrderLogs } from '../services/db';
import { Order, OrderStatus, getNextOrderStatus, SizeBreakdown, MaterialRequest, OrderLog } from '../types';
import { StatusBadge, BulkActionToolbar } from '../components/Widgets';
import { ArrowRight, Printer, PackagePlus, Box, AlertTriangle, X, Eye, CheckCircle2, History, ListTodo, Archive, FileText, Download, Plus, Trash2, Paperclip, Calculator, Clock, MessageSquare, Send, Search } from 'lucide-react';

// Hardcoded ID for this specific Subunit Dashboard instance
const CURRENT_UNIT_ID = 2; // Sewing Unit A

interface MaterialRow {
    id: number;
    name: string;
    qtyPerPc: number;   // For Calculator Mode
    requestQty: number; // For Direct Entry Mode
    unit: string;
    file: File | null;
}

export const SubunitDashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [materialModal, setMaterialModal] = useState<string | null>(null); 
  const [barcodeModal, setBarcodeModal] = useState<{orderId: string, style: string} | null>(null);
  const [detailsModal, setDetailsModal] = useState<Order | null>(null);
  
  // Timeline Modal State
  const [timelineModal, setTimelineModal] = useState<{orderId: string, orderNo: string} | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<OrderLog[]>([]);
  const [statusUpdateText, setStatusUpdateText] = useState("");

  // Material History State
  const [showMaterialHistory, setShowMaterialHistory] = useState(false);
  const [materialHistory, setMaterialHistory] = useState<MaterialRequest[]>([]);

  // Completion Modal State
  const [completionModal, setCompletionModal] = useState<Order | null>(null);
  const [completionForm, setCompletionForm] = useState<{
      breakdown: SizeBreakdown[],
      actualBoxCount: number
  } | null>(null);

  const [barcodeForm, setBarcodeForm] = useState({ qty: 0, size: 'M' });

  // --- NEW MATERIAL REQUEST STATE ---
  const [reqTab, setReqTab] = useState<'direct' | 'pcs'>('pcs');
  
  // Calculator Mode State
  const [totalPcs, setTotalPcs] = useState<number>(0);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([
      { id: 1, name: '', qtyPerPc: 0, requestQty: 0, unit: 'Nos', file: null }
  ]);
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  const refreshOrders = () => {
    fetchOrders().then(data => {
        // Fetch all orders for this unit, we will filter by tab later
        const subunitOrders = data.filter(o => o.unit_id === CURRENT_UNIT_ID);
        setOrders(subunitOrders);
    });
  };

  useEffect(() => {
    refreshOrders();
  }, [loading]);

  // Derived state for filtered orders
  const displayedOrders = orders.filter(o => {
      // 1. Filter by Tab
      const matchesTab = activeTab === 'active' 
        ? o.status !== OrderStatus.COMPLETED 
        : o.status === OrderStatus.COMPLETED;
      
      // 2. Filter by Search
      const matchesSearch = 
        o.order_no.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.style_number.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTab && matchesSearch;
  });

  const toggleSelect = (id: string) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkStatusUpdate = async () => {
    setLoading(true);
    await Promise.all(selectedOrders.map(async (id) => {
      const order = orders.find(o => o.id === id);
      if (order && order.status !== OrderStatus.QC && order.status !== OrderStatus.QC_APPROVED) {
        const next = getNextOrderStatus(order.status);
        if (next) await updateOrderStatus(id, next);
      }
    }));
    setSelectedOrders([]);
    setLoading(false);
  };

  const handleSingleStatusUpdate = async (id: string, currentStatus: OrderStatus) => {
    // If QC Approved, we need to open the Completion Modal instead of just advancing
    if (currentStatus === OrderStatus.QC_APPROVED) {
        const order = orders.find(o => o.id === id);
        if (order) openCompletionModal(order);
        return;
    }

    const next = getNextOrderStatus(currentStatus);
    if (next) {
        setLoading(true);
        await updateOrderStatus(id, next);
        setLoading(false);
    }
  };

  // --- Timeline Logic ---
  const openTimeline = async (orderId: string, orderNo: string) => {
      const logs = await fetchOrderLogs(orderId);
      setTimelineLogs(logs);
      setTimelineModal({ orderId, orderNo });
      setStatusUpdateText("");
  };

  const submitManualStatusUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!timelineModal || !statusUpdateText.trim()) return;

      await addOrderLog(timelineModal.orderId, 'MANUAL_UPDATE', statusUpdateText);
      // Refresh logs
      const logs = await fetchOrderLogs(timelineModal.orderId);
      setTimelineLogs(logs);
      setStatusUpdateText("");
  };

  // --- Completion Logic ---
  const openCompletionModal = (order: Order) => {
      const initialBreakdown = order.size_breakdown 
        ? order.size_breakdown.map(r => ({ color: r.color, s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }))
        : [{ color: 'Standard', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }];

      setCompletionForm({
          breakdown: initialBreakdown,
          actualBoxCount: 0
      });
      setCompletionModal(order);
  };

  const updateCompletionRow = (index: number, field: keyof SizeBreakdown, value: number) => {
      if (!completionForm) return;
      const updated = [...completionForm.breakdown];
      updated[index] = { ...updated[index], [field]: value };
      setCompletionForm({ ...completionForm, breakdown: updated });
  };

  const handleCompleteOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!completionModal || !completionForm) return;

      setLoading(true);
      await updateOrderStatus(
          completionModal.id, 
          OrderStatus.COMPLETED, 
          undefined, 
          { 
              completion_breakdown: completionForm.breakdown, 
              actual_box_count: completionForm.actualBoxCount 
          }
      );
      setCompletionModal(null);
      setCompletionForm(null);
      setLoading(false);
      refreshOrders();
  };

  // --- Material History Logic ---
  const handleOpenMaterialHistory = async () => {
      const allRequests = await fetchMaterialRequests();
      const unitOrderIds = orders.map(o => o.id);
      const unitRequests = allRequests.filter(req => unitOrderIds.includes(req.order_id));
      setMaterialHistory(unitRequests);
      setShowMaterialHistory(true);
  };

  // --- Helper for Row Total ---
  const getRowTotal = (row: SizeBreakdown) => {
    return (row.s || 0) + (row.m || 0) + (row.l || 0) + (row.xl || 0) + (row.xxl || 0) + (row.xxxl || 0);
  };

  const renderDetailCell = (order: Order, rowIdx: number, sizeKey: keyof SizeBreakdown) => {
      const plannedRow = order.size_breakdown?.[rowIdx];
      const actualRow = order.completion_breakdown?.[rowIdx];
      
      const plannedVal = plannedRow ? (plannedRow[sizeKey] as number) : 0;
      
      if (order.status !== OrderStatus.COMPLETED || !actualRow) {
          return <span className="text-slate-600">{plannedVal}</span>;
      }

      const actualVal = actualRow[sizeKey] as number;
      const isMismatch = actualVal !== plannedVal;

      return (
          <div className="flex flex-col items-center justify-center p-1 bg-slate-50 rounded">
              <span className={`text-lg font-bold ${isMismatch ? 'text-indigo-700' : 'text-slate-900'}`}>
                  {actualVal}
              </span>
              <span className="text-sm font-semibold text-slate-500 border-t-2 border-slate-200 w-full text-center">
                  {plannedVal}
              </span>
          </div>
      );
  };

  // ... (Existing Helpers: Barcode, Material) ...
  const openBarcodeModal = (orderId: string, style: string) => {
      setBarcodeForm({ qty: 10, size: 'M' }); 
      setBarcodeModal({ orderId, style });
  };

  const handleGenerateAndPrint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeModal) return;
    const newBarcodes = await generateBarcodes(barcodeModal.orderId, barcodeForm.qty, barcodeModal.style, barcodeForm.size);
    setBarcodeModal(null);
    
    // Open Print Window with JSBarcode CDN and Grid Layout
    const win = window.open('', 'PrintBarcodes', 'width=1000,height=800');
    if (win) {
        const labelsHtml = newBarcodes.map(b => `
            <div class="label">
                <div class="header">TINTURA SST</div>
                <div class="meta">
                    <strong>Style:</strong> ${b.style_number} &nbsp; 
                    <strong>Size:</strong> ${b.size}
                </div>
                <svg class="barcode"
                    jsbarcode-format="CODE128"
                    jsbarcode-value="${b.barcode_serial}"
                    jsbarcode-textmargin="0"
                    jsbarcode-fontoptions="bold"
                    jsbarcode-height="40"
                    jsbarcode-width="2"
                    jsbarcode-displayValue="true"
                    jsbarcode-fontSize="11"
                ></svg>
            </div>
        `).join('');

        win.document.write(`
            <html>
            <head>
                <title>Print Labels</title>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                <style>
                    @page { size: A4; margin: 10mm; }
                    body { margin: 0; font-family: sans-serif; }
                    .grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        grid-auto-rows: 35mm; /* Approx 35mm per row to fit 8 rows (280mm) in 297mm A4 */
                        column-gap: 5mm;
                        row-gap: 2mm;
                    }
                    .label {
                        border: 1px dashed #ddd; /* Light dash guide */
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 5px;
                        overflow: hidden;
                        text-align: center;
                        background: white;
                    }
                    .header { font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
                    .meta { font-size: 10px; margin-bottom: 2px; color: #333; }
                    svg { max-width: 95%; height: auto; display: block; }
                </style>
            </head>
            <body>
                <div class="grid">
                    ${labelsHtml}
                </div>
                <script>
                    window.onload = function() {
                        JsBarcode(".barcode").init();
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                </script>
            </body>
            </html>
        `); 
        win.document.close();
    }
  };

  // --- NEW MATERIAL REQUEST HANDLERS ---
  const handleMaterialModalOpen = (orderId: string) => {
      const order = orders.find(o => o.id === orderId);
      setMaterialModal(orderId);
      if (order) setTotalPcs(order.quantity);
      setReqTab('pcs');
      setMaterialRows([{ id: 1, name: '', qtyPerPc: 0, requestQty: 0, unit: 'Nos', file: null }]);
  };

  const handleRowChange = (id: number, field: keyof MaterialRow, value: any) => {
      setMaterialRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addRow = () => {
      setMaterialRows(prev => [...prev, { id: Date.now(), name: '', qtyPerPc: 0, requestQty: 0, unit: 'Nos', file: null }]);
  };

  const removeRow = (id: number) => {
      setMaterialRows(prev => prev.filter(row => row.id !== id));
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!materialModal) return;
      setIsSubmittingReq(true);

      for (const row of materialRows) {
          if (!row.name) continue;

          // Determine quantity based on active tab
          let finalQty = 0;
          if (reqTab === 'direct') {
              finalQty = row.requestQty;
          } else {
              finalQty = row.qtyPerPc * totalPcs;
          }

          if (finalQty <= 0) continue;

          let attachmentUrl = undefined;
          if (row.file) {
              const url = await uploadOrderAttachment(row.file);
              if (url) attachmentUrl = url;
          }

          await createMaterialRequest({
              order_id: materialModal,
              material_content: row.name,
              quantity_requested: finalQty,
              unit: row.unit,
              attachment_url: attachmentUrl
          });
      }

      setIsSubmittingReq(false);
      setMaterialModal(null);
      alert("Material Request(s) Sent Successfully!");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:justify-between xl:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Box className="text-indigo-600"/> Sub-Unit Operations
            </h2>
            <div className="mt-1 bg-indigo-50 text-indigo-800 text-xs font-bold px-2 py-0.5 rounded inline-block border border-indigo-100">
                Unit ID: {CURRENT_UNIT_ID} (Sewing Unit A)
            </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Search Bar */}
            <div className="relative w-full md:w-64">
                <input 
                    type="text"
                    placeholder="Search Order..."
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white text-slate-900 shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>

            <button 
                onClick={handleOpenMaterialHistory}
                className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 font-medium hover:bg-slate-50 shadow-sm whitespace-nowrap"
            >
                <Archive size={18} />
                <span className="hidden sm:inline">Material Requests</span>
            </button>

            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex">
                <button 
                    onClick={() => setActiveTab('active')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'active' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <ListTodo size={16}/> Active Jobs
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'history' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <History size={16}/> Order History
                </button>
            </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {displayedOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
                <p className="text-lg font-semibold">
                    {searchTerm ? 'No orders match search.' : (activeTab === 'active' ? 'No active orders assigned.' : 'No completed history yet.')}
                </p>
                {activeTab === 'active' && !searchTerm && <p className="text-sm mt-1">Check Admin HQ to assign new orders.</p>}
            </div>
        ) : (
            <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase">
                <tr>
                <th className="p-4 w-10"></th>
                <th className="p-4">Order</th>
                <th className="p-4">Details</th>
                <th className="p-4">Progress</th>
                <th className="p-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {displayedOrders.map(order => {
                const nextStatus = getNextOrderStatus(order.status);
                const canAdvance = order.status !== OrderStatus.QC && order.status !== OrderStatus.COMPLETED;
                const isReadyToComplete = order.status === OrderStatus.QC_APPROVED;
                const isCompleted = order.status === OrderStatus.COMPLETED;

                return (
                    <tr key={order.id} className={`hover:bg-slate-50 ${selectedOrders.includes(order.id) ? 'bg-indigo-50' : ''}`}>
                    <td className="p-4">
                        {!isCompleted && (
                            <input type="checkbox" 
                            disabled={!canAdvance || isReadyToComplete}
                            checked={selectedOrders.includes(order.id)}
                            onChange={() => toggleSelect(order.id)}
                            className="w-4 h-4 text-indigo-600 rounded disabled:opacity-50"
                            />
                        )}
                    </td>
                    <td className="p-4">
                        <div className="font-bold text-slate-700">{order.order_no}</div>
                        <div className="text-xs text-slate-500">{order.target_delivery_date}</div>
                    </td>
                    <td className="p-4">
                        <div className="text-sm font-medium">{order.style_number}</div>
                        <div className="text-xs text-slate-500">{order.quantity} pcs</div>
                    </td>
                    <td className="p-4">
                        <StatusBadge status={order.status} />
                        {order.qc_notes && (
                            <div className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                <AlertTriangle size={10} /> Note: {order.qc_notes}
                            </div>
                        )}
                        {order.qc_attachment_url && (
                            <a href={order.qc_attachment_url} target="_blank" rel="noreferrer" className="mt-1 text-xs text-indigo-500 flex items-center gap-1 hover:text-indigo-700">
                                <Paperclip size={10}/> QC File
                            </a>
                        )}
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2 items-center flex-wrap">
                        <button 
                            onClick={() => setDetailsModal(order)}
                            className="text-xs bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded inline-flex items-center gap-1 border border-slate-200 shadow-sm"
                            title="View Full Details"
                        >
                            <Eye size={14}/> 
                            <span className="hidden xl:inline">Details</span>
                        </button>
                        
                        {!isCompleted && (
                            <>
                                <button 
                                    onClick={() => openTimeline(order.id, order.order_no)}
                                    className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-600 px-3 py-1.5 rounded inline-flex items-center gap-1 border border-teal-100"
                                >
                                    <Clock size={14}/> 
                                    <span className="hidden xl:inline">Timeline</span>
                                </button>
                                <button 
                                    onClick={() => openBarcodeModal(order.id, order.style_number)}
                                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded inline-flex items-center gap-1 border border-slate-200"
                                >
                                    <Printer size={14}/> 
                                    <span className="hidden xl:inline">Barcodes</span>
                                </button>
                                <button 
                                    onClick={() => handleMaterialModalOpen(order.id)}
                                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded inline-flex items-center gap-1 border border-blue-100"
                                >
                                    <PackagePlus size={14}/> 
                                    <span className="hidden xl:inline">Material</span>
                                </button>
                                {canAdvance && (
                                    <button
                                        onClick={() => handleSingleStatusUpdate(order.id, order.status)}
                                        className={`text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 shadow-sm font-bold text-white ${
                                            isReadyToComplete 
                                            ? 'bg-green-600 hover:bg-green-700' 
                                            : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {isReadyToComplete ? (
                                            <>
                                                <CheckCircle2 size={14} />
                                                <span>Complete Order</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Next</span>
                                                <ArrowRight size={14} />
                                            </>
                                        )}
                                    </button>
                                )}
                            </>
                        )}
                        {!canAdvance && order.status === OrderStatus.QC && (
                            <span className="text-xs text-orange-600 italic px-2">Pending QC</span>
                        )}
                    </td>
                    </tr>
                );
                })}
            </tbody>
            </table>
        )}
      </div>

      {activeTab === 'active' && (
        <BulkActionToolbar 
            selectedCount={selectedOrders.length}
            actions={[
            { label: 'Advance Status', onClick: handleBulkStatusUpdate }
            ]}
        />
      )}

      {/* Details Modal (Existing) */}
      {detailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">{detailsModal.order_no}</h3>
                        <p className="text-sm text-slate-500">Style: {detailsModal.style_number}</p>
                    </div>
                    <button onClick={() => setDetailsModal(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                </div>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 bg-slate-50 rounded">
                            <span className="block text-slate-500 text-xs uppercase font-bold">Total Qty</span>
                            <span className="text-xl font-bold text-slate-800">{detailsModal.quantity}</span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                            <span className="block text-slate-500 text-xs uppercase font-bold">Delivery Date</span>
                            <span className="text-xl font-bold text-slate-800">{detailsModal.target_delivery_date}</span>
                        </div>
                    </div>
                    
                    {detailsModal.attachment_url && (
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-full text-indigo-600"><FileText size={20}/></div>
                                <div>
                                    <p className="text-sm font-bold text-indigo-900">Order Attachment</p>
                                    <p className="text-xs text-indigo-600 truncate max-w-[200px]">{detailsModal.attachment_name || "Document"}</p>
                                </div>
                            </div>
                            <a 
                                href={detailsModal.attachment_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700"
                            >
                                <Download size={16}/> Download
                            </a>
                        </div>
                    )}

                    {detailsModal.qc_attachment_url && (
                        <div className="p-4 bg-teal-50 border border-teal-100 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-full text-teal-600"><CheckCircle2 size={20}/></div>
                                <div>
                                    <p className="text-sm font-bold text-teal-900">QC Report / File</p>
                                    <p className="text-xs text-teal-600 truncate max-w-[200px]">Evidence of Quality Check</p>
                                </div>
                            </div>
                            <a 
                                href={detailsModal.qc_attachment_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-teal-700"
                            >
                                <Download size={16}/> View
                            </a>
                        </div>
                    )}
                    
                    {/* Matrix */}
                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 flex justify-between">
                            <span>Order Breakdown</span>
                            {detailsModal.status === OrderStatus.COMPLETED && <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Displaying: Actual / Planned</span>}
                        </h4>
                        {!detailsModal.size_breakdown || detailsModal.size_breakdown.length === 0 ? (
                            <div className="p-4 text-center bg-slate-50 rounded text-slate-400 italic">No breakdown available.</div>
                        ) : (
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-center text-sm">
                                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                                        <tr>
                                            <th className="p-3 text-left">Color</th>
                                            <th className="p-3">S / 65</th>
                                            <th className="p-3">M / 70</th>
                                            <th className="p-3">L / 75</th>
                                            <th className="p-3">XL / 80</th>
                                            <th className="p-3">XXL / 85</th>
                                            <th className="p-3">XXXL / 90</th>
                                            <th className="p-3 font-bold bg-slate-200">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {detailsModal.size_breakdown.map((row, idx) => {
                                            // Handle Row Total Logic
                                            let rowTotalDisplay: React.ReactNode = getRowTotal(row);
                                            
                                            if (detailsModal.status === OrderStatus.COMPLETED && detailsModal.completion_breakdown?.[idx]) {
                                                const actualRow = detailsModal.completion_breakdown[idx];
                                                const actualTotal = getRowTotal(actualRow);
                                                const plannedTotal = getRowTotal(row);
                                                rowTotalDisplay = (
                                                    <div className="flex flex-col items-center justify-center p-1 bg-slate-100 rounded">
                                                        <span className="text-lg font-bold text-indigo-900">{actualTotal}</span>
                                                        <span className="text-sm font-semibold text-slate-500 border-t-2 border-slate-300 w-full text-center">{plannedTotal}</span>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <tr key={idx} className="hover:bg-slate-50">
                                                    <td className="p-3 text-left font-medium text-slate-700">{row.color}</td>
                                                    <td className="p-3">{renderDetailCell(detailsModal, idx, 's')}</td>
                                                    <td className="p-3">{renderDetailCell(detailsModal, idx, 'm')}</td>
                                                    <td className="p-3">{renderDetailCell(detailsModal, idx, 'l')}</td>
                                                    <td className="p-3">{renderDetailCell(detailsModal, idx, 'xl')}</td>
                                                    <td className="p-3">{renderDetailCell(detailsModal, idx, 'xxl')}</td>
                                                    <td className="p-3">{renderDetailCell(detailsModal, idx, 'xxxl')}</td>
                                                    <td className="p-3 font-bold bg-slate-50 text-slate-800">{rowTotalDisplay}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Boxes Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded">
                             <h4 className="font-bold text-indigo-900 mb-1 text-xs uppercase">No. of Boxes (Planned)</h4>
                             <p className="text-xl font-mono text-indigo-700">{detailsModal.box_count || 0}</p>
                        </div>
                        {detailsModal.status === OrderStatus.COMPLETED && (
                             <div className="p-3 bg-green-50 border border-green-100 rounded">
                                <h4 className="font-bold text-green-900 mb-1 text-xs uppercase">Actual Boxes Packed</h4>
                                <p className="text-xl font-mono text-green-700">{detailsModal.actual_box_count || 0}</p>
                             </div>
                        )}
                    </div>

                    <div>
                         <h4 className="font-bold text-slate-700 mb-1">Description / Notes</h4>
                         <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100">
                            {detailsModal.description || "No specific instructions."}
                         </p>
                    </div>
                </div>
                <div className="p-4 border-t bg-slate-50 text-right">
                    <button onClick={() => setDetailsModal(null)} className="bg-slate-800 text-white px-4 py-2 rounded font-medium hover:bg-slate-700">Close</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

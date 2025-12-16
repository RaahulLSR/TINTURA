import React, { useEffect, useState } from 'react';
import { fetchOrders, updateOrderStatus, generateBarcodes, createMaterialRequest, fetchMaterialRequests, uploadOrderAttachment, addOrderLog, fetchOrderLogs } from '../services/db';
import { Order, OrderStatus, getNextOrderStatus, SizeBreakdown, MaterialRequest, OrderLog } from '../types';
import { StatusBadge, BulkActionToolbar } from '../components/Widgets';
import { ArrowRight, Printer, PackagePlus, Box, AlertTriangle, X, Eye, CheckCircle2, History, ListTodo, Archive, FileText, Download, Plus, Trash2, Paperclip, Calculator, Clock, MessageSquare, Send } from 'lucide-react';

// Hardcoded ID for this specific Subunit Dashboard instance
const CURRENT_UNIT_ID = 2; // Sewing Unit A

interface MaterialRow {
    id: number;
    name: string;
    qtyPerPc: number;
    file: File | null;
}

export const SubunitDashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
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
  const [reqContent, setReqContent] = useState({ material: '', qty: 0 }); // Direct
  
  // Calculator Mode State
  const [totalPcs, setTotalPcs] = useState<number>(0);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([
      { id: 1, name: '', qtyPerPc: 0, file: null }
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
      if (activeTab === 'active') return o.status !== OrderStatus.COMPLETED;
      return o.status === OrderStatus.COMPLETED;
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
      setMaterialRows([{ id: 1, name: '', qtyPerPc: 0, file: null }]);
      setReqContent({ material: '', qty: 0 });
  };

  const handleRowChange = (id: number, field: keyof MaterialRow, value: any) => {
      setMaterialRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addRow = () => {
      setMaterialRows(prev => [...prev, { id: Date.now(), name: '', qtyPerPc: 0, file: null }]);
  };

  const removeRow = (id: number) => {
      setMaterialRows(prev => prev.filter(row => row.id !== id));
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!materialModal) return;
      setIsSubmittingReq(true);

      if (reqTab === 'direct') {
          await createMaterialRequest({
              order_id: materialModal,
              material_content: reqContent.material,
              quantity_requested: reqContent.qty
          });
      } else {
          for (const row of materialRows) {
              if (!row.name || row.qtyPerPc <= 0) continue;

              const totalQty = row.qtyPerPc * totalPcs;
              let attachmentUrl = undefined;

              if (row.file) {
                  const url = await uploadOrderAttachment(row.file);
                  if (url) attachmentUrl = url;
              }

              await createMaterialRequest({
                  order_id: materialModal,
                  material_content: row.name,
                  quantity_requested: totalQty,
                  attachment_url: attachmentUrl
              });
          }
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
        
        <div className="flex gap-4">
            <button 
                onClick={handleOpenMaterialHistory}
                className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg flex items-center gap-2 font-medium hover:bg-slate-50 shadow-sm"
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
                    {activeTab === 'active' ? 'No active orders assigned.' : 'No completed history yet.'}
                </p>
                {activeTab === 'active' && <p className="text-sm mt-1">Check Admin HQ to assign new orders.</p>}
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

      {/* Completion Modal */}
      {completionModal && completionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-up">
                <div className="p-6 border-b flex justify-between items-center bg-green-50">
                    <div>
                        <h3 className="text-xl font-bold text-green-900 flex items-center gap-2">
                             <CheckCircle2/> Complete Order: {completionModal.order_no}
                        </h3>
                        <p className="text-sm text-green-700">Verify Final Manufactured Quantities</p>
                    </div>
                    <button onClick={() => setCompletionModal(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                </div>
                
                <form onSubmit={handleCompleteOrder} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
                    {/* Matrix Input */}
                    <div className="border rounded-lg overflow-hidden shadow-sm">
                        <table className="w-full text-center text-sm">
                            <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                                <tr>
                                    <th className="p-3 text-left">Color</th>
                                    {['S','M','L','XL','XXL','XXXL'].map(sz => (
                                        <th key={sz} className="p-3 min-w-[80px]">{sz}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {completionForm.breakdown.map((row, idx) => {
                                    const targetRow = completionModal.size_breakdown?.[idx];
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 text-left font-bold text-slate-700">{row.color}</td>
                                            {['s','m','l','xl','xxl','xxxl'].map(sz => {
                                                const targetVal = targetRow ? (targetRow as any)[sz] : 0;
                                                return (
                                                    <td key={sz} className="p-2">
                                                        <div className="flex flex-col items-center">
                                                            <input 
                                                                type="number" min="0"
                                                                className="w-16 border-b-2 border-indigo-300 text-center font-bold text-indigo-900 focus:outline-none focus:border-indigo-600 bg-white" 
                                                                value={(row as any)[sz]}
                                                                onChange={e => updateCompletionRow(idx, sz as keyof SizeBreakdown, parseInt(e.target.value)||0)}
                                                            />
                                                            <span className="text-xs text-slate-400 font-mono mt-1">/ {targetVal}</span>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-2 gap-8 items-start">
                        <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-lg">
                             <h4 className="font-bold text-yellow-900 mb-2 uppercase text-xs">Final Box Count</h4>
                             <div className="flex items-center gap-2">
                                <input 
                                    type="number" min="0" required
                                    className="w-24 text-2xl font-mono font-bold p-2 rounded border border-yellow-300 focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-black"
                                    value={completionForm.actualBoxCount}
                                    onChange={e => setCompletionForm({...completionForm, actualBoxCount: parseInt(e.target.value)||0})}
                                />
                                <span className="text-slate-500 font-medium">/ {completionModal.box_count} Planned</span>
                             </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t">
                        <button type="button" onClick={() => setCompletionModal(null)} className="mr-3 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md flex items-center gap-2">
                            <CheckCircle2 size={18}/>
                            Confirm Completion
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Barcode/Material Modals (Existing) */}
      {barcodeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md transform transition-all scale-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl text-slate-800 flex items-center gap-2">
                        <Printer className="text-indigo-600"/> Generate Stickers
                    </h3>
                    <button onClick={() => setBarcodeModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                
                <form onSubmit={handleGenerateAndPrint} className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded-lg text-sm border border-slate-100">
                        <div className="flex justify-between mb-1">
                            <span className="text-slate-500">Style Number:</span>
                            <span className="font-bold text-slate-700">{barcodeModal.style}</span>
                        </div>
                    </div>
                    {/* ... (Keep existing barcode form inputs) ... */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Size</label>
                            <select 
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                                value={barcodeForm.size}
                                onChange={e => setBarcodeForm({...barcodeForm, size: e.target.value})}
                            >
                                {['XS','S','M','L','XL','XXL','Free Size'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Quantity</label>
                            <input 
                                type="number" 
                                min="1"
                                max="1000"
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                                value={barcodeForm.qty}
                                onChange={e => setBarcodeForm({...barcodeForm, qty: parseInt(e.target.value)})}
                            />
                        </div>
                    </div>
                    <button 
                        type="submit" 
                        className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                        Print {barcodeForm.qty} Labels
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* NEW MATERIAL REQUEST MODAL */}
      {materialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-up">
                <div className="p-6 border-b flex justify-between items-center bg-indigo-50">
                    <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                         <PackagePlus/> Request Materials
                    </h3>
                    <button onClick={() => setMaterialModal(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                </div>

                <div className="p-4 border-b bg-slate-50 flex justify-center">
                    <div className="bg-white border border-slate-200 p-1 rounded-lg flex shadow-sm">
                        <button 
                            onClick={() => setReqTab('pcs')}
                            className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition ${reqTab === 'pcs' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <Calculator size={16}/> Calculator Mode
                        </button>
                        <button 
                            onClick={() => setReqTab('direct')}
                            className={`px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition ${reqTab === 'direct' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            <ArrowRight size={16}/> Direct Entry
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmitRequest} className="p-6 max-h-[70vh] overflow-y-auto">
                    
                    {reqTab === 'direct' ? (
                        <div className="space-y-4 max-w-md mx-auto">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Material Name / Description</label>
                                <input 
                                    className="w-full border border-slate-300 p-3 rounded-lg bg-white text-black outline-none focus:ring-2 focus:ring-indigo-500" 
                                    placeholder="e.g. White Buttons (4 hole)" 
                                    value={reqContent.material}
                                    onChange={e => setReqContent({...reqContent, material: e.target.value})} 
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Quantity Requested</label>
                                <input 
                                    className="w-full border border-slate-300 p-3 rounded-lg bg-white text-black outline-none focus:ring-2 focus:ring-indigo-500" 
                                    type="number" placeholder="0" 
                                    value={reqContent.qty}
                                    onChange={e => setReqContent({...reqContent, qty: parseFloat(e.target.value)})} 
                                    required
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                <label className="font-bold text-yellow-900">Total Number of Pcs (Order Qty):</label>
                                <input 
                                    type="number"
                                    className="w-32 border-b-2 border-yellow-500 bg-transparent text-xl font-bold text-center outline-none focus:border-yellow-700"
                                    value={totalPcs}
                                    onChange={e => setTotalPcs(parseFloat(e.target.value) || 0)}
                                />
                            </div>

                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                    <tr>
                                        <th className="p-3 w-10">S.No</th>
                                        <th className="p-3">Material Name</th>
                                        <th className="p-3 w-32">Qty / Pc</th>
                                        <th className="p-3 w-32 bg-slate-100">Total Qty</th>
                                        <th className="p-3 w-48">Reference File</th>
                                        <th className="p-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {materialRows.map((row, idx) => (
                                        <tr key={row.id}>
                                            <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                            <td className="p-3">
                                                <input 
                                                    placeholder="Item Name"
                                                    className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-black text-sm"
                                                    value={row.name}
                                                    onChange={e => handleRowChange(row.id, 'name', e.target.value)}
                                                    required
                                                />
                                            </td>
                                            <td className="p-3">
                                                <input 
                                                    type="number" step="0.01"
                                                    className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-black text-sm text-center"
                                                    value={row.qtyPerPc}
                                                    onChange={e => handleRowChange(row.id, 'qtyPerPc', parseFloat(e.target.value) || 0)}
                                                />
                                            </td>
                                            <td className="p-3 bg-slate-50 font-bold text-indigo-700 text-center">
                                                {(row.qtyPerPc * totalPcs).toFixed(2)}
                                            </td>
                                            <td className="p-3">
                                                <div className="relative">
                                                    <label className="cursor-pointer flex items-center justify-center gap-2 border border-dashed border-slate-300 p-2 rounded hover:bg-slate-50 text-xs text-slate-500 overflow-hidden">
                                                        <Paperclip size={14}/>
                                                        <span className="truncate max-w-[100px]">{row.file ? row.file.name : 'Upload'}</span>
                                                        <input 
                                                            type="file" className="hidden" 
                                                            accept="image/*,.pdf,.doc,.docx"
                                                            onChange={e => handleRowChange(row.id, 'file', e.target.files?.[0] || null)}
                                                        />
                                                    </label>
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                {materialRows.length > 1 && (
                                                    <button type="button" onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600">
                                                        <Trash2 size={16}/>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button 
                                type="button" 
                                onClick={addRow}
                                className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                                <Plus size={16}/> Add Row
                            </button>
                        </div>
                    )}

                    <div className="flex justify-end pt-6 border-t mt-6">
                        <button type="button" onClick={() => setMaterialModal(null)} className="mr-3 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                        <button 
                            type="submit" 
                            disabled={isSubmittingReq}
                            className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSubmittingReq ? 'Processing...' : 'Send Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Material History Modal */}
      {showMaterialHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                          <Archive size={20} className="text-slate-600"/> Request History
                      </h3>
                      <button onClick={() => setShowMaterialHistory(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>
                  <div className="p-0 max-h-[60vh] overflow-y-auto">
                      {materialHistory.length === 0 ? (
                          <div className="p-8 text-center text-slate-400">No requests found.</div>
                      ) : (
                          <table className="w-full text-left text-sm">
                              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                                  <tr>
                                      <th className="p-3">Date</th>
                                      <th className="p-3">Order ID</th>
                                      <th className="p-3">Material</th>
                                      <th className="p-3">Requested</th>
                                      <th className="p-3">Approved</th>
                                      <th className="p-3">Status</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y">
                                  {materialHistory.map(req => {
                                      const order = orders.find(o => o.id === req.order_id);
                                      return (
                                          <tr key={req.id} className="hover:bg-slate-50">
                                              <td className="p-3 text-slate-500">{new Date(req.created_at).toLocaleDateString()}</td>
                                              <td className="p-3 font-mono text-xs">{order?.order_no || '---'}</td>
                                              <td className="p-3 font-medium text-slate-800">
                                                  {req.material_content}
                                                  {req.attachment_url && (
                                                      <a href={req.attachment_url} target="_blank" rel="noreferrer" className="ml-2 inline-block text-indigo-500 hover:text-indigo-700">
                                                          <Paperclip size={12}/>
                                                      </a>
                                                  )}
                                              </td>
                                              <td className="p-3">{req.quantity_requested}</td>
                                              <td className="p-3 font-bold text-green-600">{req.quantity_approved}</td>
                                              <td className="p-3">
                                                  <span className={`text-xs px-2 py-1 rounded font-bold ${
                                                        req.status === 'PENDING' ? 'bg-orange-100 text-orange-600' :
                                                        req.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                                                        req.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                                                  }`}>
                                                      {req.status}
                                                  </span>
                                              </td>
                                          </tr>
                                      )
                                  })}
                              </tbody>
                          </table>
                      )}
                  </div>
                  <div className="p-4 bg-slate-50 text-right border-t">
                      <button onClick={() => setShowMaterialHistory(false)} className="bg-slate-800 text-white px-4 py-2 rounded">Close</button>
                  </div>
              </div>
          </div>
      )}

      {/* TIMELINE MODAL */}
      {timelineModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                          <Clock size={18}/> Order Timeline: {timelineModal.orderNo}
                      </h3>
                      <button onClick={() => setTimelineModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                  </div>
                  
                  {/* Log View */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                      {timelineLogs.length === 0 ? (
                          <div className="text-center text-slate-400 text-sm">No activity logs found.</div>
                      ) : (
                          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                             {timelineLogs.map((log) => (
                                 <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                     <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-slate-500">
                                         {log.log_type === 'STATUS_CHANGE' ? <ListTodo size={16}/> : <MessageSquare size={16}/>}
                                     </div>
                                     <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                         <div className="flex items-center justify-between space-x-2 mb-1">
                                             <div className="font-bold text-slate-900 text-sm">{log.log_type.replace(/_/g, ' ')}</div>
                                             <time className="font-mono text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</time>
                                         </div>
                                         <div className="text-slate-600 text-sm">
                                             {log.message}
                                         </div>
                                     </div>
                                 </div>
                             ))}
                          </div>
                      )}
                  </div>

                  {/* Manual Status Input (Only shown if active job) */}
                  <div className="p-4 bg-white border-t">
                      <form onSubmit={submitManualStatusUpdate} className="flex gap-2">
                          <input 
                              type="text" 
                              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="Type a progress update (e.g., 'Cutting started')..."
                              value={statusUpdateText}
                              onChange={e => setStatusUpdateText(e.target.value)}
                          />
                          <button 
                              type="submit" 
                              disabled={!statusUpdateText.trim()}
                              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                              <Send size={16}/>
                          </button>
                      </form>
                      <p className="text-xs text-slate-400 mt-2 px-1">
                          Updates entered here will be visible to Admin HQ in real-time.
                      </p>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
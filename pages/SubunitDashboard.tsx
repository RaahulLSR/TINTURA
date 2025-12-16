
import React, { useEffect, useState } from 'react';
import { fetchOrders, updateOrderStatus, generateBarcodes, createMaterialRequest, fetchMaterialRequests, uploadOrderAttachment, addOrderLog, fetchOrderLogs, updateMaterialRequest } from '../services/db';
import { Order, OrderStatus, getNextOrderStatus, SizeBreakdown, MaterialRequest, OrderLog, Attachment, MaterialStatus } from '../types';
import { StatusBadge, BulkActionToolbar } from '../components/Widgets';
import { ArrowRight, Printer, PackagePlus, Box, AlertTriangle, X, Eye, CheckCircle2, History, ListTodo, Archive, FileText, Download, Plus, Trash2, Paperclip, Calculator, Clock, MessageSquare, Send, Search, ArrowLeftRight, Minimize2, Maximize2, Pencil } from 'lucide-react';

// Hardcoded ID for this specific Subunit Dashboard instance
const CURRENT_UNIT_ID = 2; // Sewing Unit A

interface MaterialRow {
    id: number;
    name: string;
    qtyPerPc: number;   // For Calculator Mode
    requestQty: number; // For Direct Entry Mode
    unit: string;
    files: File[];
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

  // Material Request Editing State
  const [isEditingRequest, setIsEditingRequest] = useState<{ id: string, originalData: MaterialRequest } | null>(null);
  const [isMaterialModalMinimized, setIsMaterialModalMinimized] = useState(false);

  // Completion Modal State
  const [completionModal, setCompletionModal] = useState<Order | null>(null);
  const [completionForm, setCompletionForm] = useState<{
      breakdown: SizeBreakdown[],
      actualBoxCount: number
  } | null>(null);

  // Size Header Toggle State (Now mainly for internal logic display, auto-set by order format)
  const [useNumericSizes, setUseNumericSizes] = useState(false);

  const [barcodeForm, setBarcodeForm] = useState({ qty: 0, size: 'M' });

  // --- NEW MATERIAL REQUEST STATE ---
  const [reqTab, setReqTab] = useState<'direct' | 'pcs'>('pcs');
  
  // Calculator Mode State
  const [totalPcs, setTotalPcs] = useState<number>(0);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([
      { id: 1, name: '', qtyPerPc: 0, requestQty: 0, unit: 'Nos', files: [] }
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
  const openTimeline = (orderId: string, orderNo: string) => {
      // Set modal immediately to ensure responsiveness
      setTimelineModal({ orderId, orderNo });
      setTimelineLogs([]); // Clear logs temporarily
      setStatusUpdateText("");

      // Fetch logs in background
      fetchOrderLogs(orderId).then(logs => {
          setTimelineLogs(logs);
      });
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
      setUseNumericSizes(order.size_format === 'numeric');
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

  const openDetailsModal = (order: Order) => {
      setUseNumericSizes(order.size_format === 'numeric');
      setDetailsModal(order);
  };

  // --- Material History Logic ---
  const handleOpenMaterialHistory = async () => {
      const allRequests = await fetchMaterialRequests();
      const unitOrderIds = orders.map(o => o.id);
      const unitRequests = allRequests.filter(req => unitOrderIds.includes(req.order_id));
      setMaterialHistory(unitRequests);
      setShowMaterialHistory(true);
  };

  const handleEditRequest = (req: MaterialRequest) => {
      setIsEditingRequest({ id: req.id, originalData: req });
      setMaterialModal(req.order_id);
      setReqTab('direct');
      setMaterialRows([{ 
          id: 1, 
          name: req.material_content, 
          qtyPerPc: 0, 
          requestQty: req.quantity_requested, 
          unit: req.unit, 
          files: [] // Existing files are not easily editable in this simplified view without more complex state
      }]);
      setShowMaterialHistory(false); // Close history to show editor
  };

  const handlePrintOrderReceipt = (order: Order, reqs: MaterialRequest[]) => {
      const win = window.open('', 'AccessoriesReceipt', 'width=1000,height=800');
      if (win) {
          const page1Rows = reqs.map((req, idx) => `
            <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td>${req.material_content}</td>
                <td style="text-align:center;">${req.unit || 'Nos'}</td>
                <td style="text-align:right; font-weight:bold;">${req.quantity_requested}</td>
            </tr>
          `).join('');

          const page2Rows = reqs.map((req, idx) => {
              const balance = req.quantity_requested - req.quantity_approved;
              return `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td>${req.material_content}</td>
                    <td style="text-align:right;">${req.quantity_requested}</td>
                    <td style="text-align:right; font-weight:bold; color:green;">${req.quantity_approved}</td>
                    <td style="text-align:right; font-weight:bold; color:${balance > 0 ? 'red' : 'black'};">${balance}</td>
                    <td style="text-align:center; font-size:10px; text-transform:uppercase;">${req.status.replace('_', ' ')}</td>
                </tr>
              `;
          }).join('');

          const headerHTML = `
            <div class="header">
                <div class="brand">TINTURA SST</div>
                <div class="title">ACCESSORIES REQUIREMENT RECEIPT</div>
                <div class="meta">
                    <strong>ORDER NO:</strong> ${order.order_no} &nbsp;|&nbsp; 
                    <strong>STYLE:</strong> ${order.style_number} &nbsp;|&nbsp; 
                    <strong>DATE:</strong> ${new Date().toLocaleDateString()}
                </div>
            </div>
          `;

          win.document.write(`
            <html>
            <head>
                <title>Accessories Receipt - ${order.order_no}</title>
                <style>
                    @media print { 
                        .page-break { page-break-before: always; } 
                        body { -webkit-print-color-adjust: exact; }
                    }
                    body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; }
                    .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 20px; padding-bottom: 10px; }
                    .brand { font-size: 24px; font-weight: 900; margin-bottom: 5px; }
                    .title { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; }
                    .meta { font-size: 12px; background: #eee; padding: 5px; }
                    .page-title { font-size: 14px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; text-align:left; border-left: 5px solid #000; padding-left: 10px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
                    th, td { border: 1px solid #ccc; padding: 8px; }
                    th { background: #f4f4f4; text-transform: uppercase; }
                </style>
            </head>
            <body>
                <!-- PAGE 1 -->
                ${headerHTML}
                <div class="page-title">Page 1: Request Sheet</div>
                <table>
                    <thead>
                        <tr>
                            <th width="50">S.No</th>
                            <th>Material Description</th>
                            <th width="80">Unit</th>
                            <th width="100" style="text-align:right">Total Requested</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${page1Rows}
                    </tbody>
                </table>
                <div style="text-align:center; font-size:10px; margin-top:20px;">-- Verified By Production --</div>

                <div class="page-break"></div>

                <!-- PAGE 2 -->
                ${headerHTML}
                <div class="page-title">Page 2: Approval & Balance Sheet</div>
                <table>
                    <thead>
                        <tr>
                            <th width="50">S.No</th>
                            <th>Material Description</th>
                            <th width="80" style="text-align:right">Req</th>
                            <th width="80" style="text-align:right">Approved</th>
                            <th width="80" style="text-align:right">Balance</th>
                            <th width="100">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${page2Rows}
                    </tbody>
                </table>
                <div style="text-align:center; font-size:10px; margin-top:20px;">-- Approved By Materials Dept --</div>

                <script>
                    window.onload = () => { setTimeout(() => window.print(), 500); };
                </script>
            </body>
            </html>
          `);
          win.document.close();
      }
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

  const getHeaderLabels = () => {
    return useNumericSizes 
        ? ['65', '70', '75', '80', '85', '90'] 
        : ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
  };

  const handlePrintOrderSheet = () => {
      if (!detailsModal) return;
      
      const breakdown = detailsModal.size_breakdown || [];
      const headers = getHeaderLabels();
      const keys = ['s', 'm', 'l', 'xl', 'xxl', 'xxxl'] as const;

      const breakdownRows = breakdown.map(row => {
          return `
            <tr>
                <td style="text-align:left; font-weight:bold;">${row.color}</td>
                ${keys.map(k => `<td>${(row as any)[k]}</td>`).join('')}
                <td style="font-weight:bold;">${getRowTotal(row)}</td>
            </tr>
          `;
      }).join('');

      let attachmentHtml = '';
      if (detailsModal.attachments && detailsModal.attachments.length > 0) {
          attachmentHtml = `<div class="section-title">Attached Documents</div><div style="display:flex; flex-direction:column; gap:20px; page-break-inside: avoid;">`;
          detailsModal.attachments.forEach(att => {
              if (att.type === 'image') {
                  attachmentHtml += `
                    <div style="border:1px solid #ccc; padding:10px; width:100%; text-align:center;">
                        <img src="${att.url}" style="max-width:100%; max-height:800px; display:block; margin:0 auto;" />
                        <div style="font-size:12px; margin-top:5px; font-weight:bold;">IMAGE: ${att.name}</div>
                    </div>
                  `;
              } else {
                  attachmentHtml += `
                    <div style="border:1px dashed #ccc; padding:20px; background:#f9f9f9; text-align:center;">
                        <strong>DOCUMENT:</strong> ${att.name}<br/>
                        <span style="font-size:11px; color:#666;">(File type not supported for direct print embedding. Please refer to digital version.)</span>
                    </div>
                  `;
              }
          });
          attachmentHtml += `</div>`;
      } else if (detailsModal.attachment_url) {
          // Legacy support
           attachmentHtml = `
            <div class="section-title">Attachment Reference</div>
            <p>Legacy Attachment: ${detailsModal.attachment_name || 'Attached File'} (Refer to digital record)</p>
           `;
      }

      const win = window.open('', 'PrintOrderSheet', 'width=1000,height=800');
      if (win) {
          win.document.write(`
            <html>
            <head>
                <title>Order Sheet - ${detailsModal.order_no}</title>
                <style>
                    @media print {
                        body { -webkit-print-color-adjust: exact; }
                        .no-break { page-break-inside: avoid; }
                    }
                    body { font-family: 'Arial', sans-serif; padding: 40px; font-size: 14px; color: #333; }
                    .header { text-align: center; border-bottom: 4px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
                    .brand { font-size: 48px; font-weight: 900; text-transform: uppercase; margin: 0; letter-spacing: 2px; line-height: 1; }
                    .title { font-size: 24px; font-weight: bold; text-transform: uppercase; margin: 10px 0 0 0; color: #444; }
                    .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                    .box { padding: 15px; border: 2px solid #333; border-radius: 4px; background: #fff; }
                    .label { font-size: 12px; text-transform: uppercase; color: #666; font-weight: bold; display: block; margin-bottom: 4px; }
                    .value { font-size: 18px; font-weight: bold; color: #000; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #333; padding: 10px; text-align: center; }
                    th { background: #eee; font-weight: bold; text-transform: uppercase; }
                    .section-title { font-size: 18px; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 40px; margin-bottom: 15px; text-transform: uppercase; page-break-after: avoid; }
                    .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; page-break-before: always; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="brand">TINTURA SST</div>
                    <div class="title">Manufacturing Order Sheet</div>
                    <div class="subtitle">Internal Production Document</div>
                </div>

                <div class="grid">
                    <div class="box">
                        <span class="label">Order Number</span>
                        <div class="value">${detailsModal.order_no}</div>
                    </div>
                    <div class="box">
                        <span class="label">Style Number</span>
                        <div class="value">${detailsModal.style_number}</div>
                    </div>
                    <div class="box">
                        <span class="label">Target Quantity</span>
                        <div class="value">${detailsModal.quantity} pcs</div>
                    </div>
                    <div class="box">
                        <span class="label">Delivery Date</span>
                        <div class="value">${detailsModal.target_delivery_date}</div>
                    </div>
                </div>

                <div class="section-title">Size Breakdown Matrix</div>
                <table>
                    <thead>
                        <tr>
                            <th style="text-align:left;">Color</th>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${breakdownRows}
                    </tbody>
                </table>

                <div class="section-title">Production Notes</div>
                <div style="padding: 15px; border: 2px solid #333; min-height: 80px; font-size: 16px;">
                    ${detailsModal.description || "No specific notes provided."}
                </div>

                ${attachmentHtml}

                <div class="footer">
                    Generated on ${new Date().toLocaleString()} <br/>
                    System Generated Document. Verify details before cutting.
                </div>
                <script>
                    // Wait for images to load before printing
                    window.onload = () => {
                        setTimeout(() => {
                            window.print();
                        }, 800);
                    };
                </script>
            </body>
            </html>
          `);
          win.document.close();
      }
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
                    .header { font-size: 10px; font-weight: bold; text-transform: uppercase; margin: 2px; }
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
      setIsMaterialModalMinimized(false);
      setIsEditingRequest(null);
      if (order) setTotalPcs(order.quantity);
      setReqTab('pcs');
      setMaterialRows([{ id: 1, name: '', qtyPerPc: 0, requestQty: 0, unit: 'Nos', files: [] }]);
  };

  const handleRowChange = (id: number, field: keyof MaterialRow, value: any) => {
      setMaterialRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addRow = () => {
      setMaterialRows(prev => [...prev, { id: Date.now(), name: '', qtyPerPc: 0, requestQty: 0, unit: 'Nos', files: [] }]);
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

          // Upload all files
          const attachments: Attachment[] = [];
          if (row.files.length > 0) {
              for (const file of row.files) {
                  const url = await uploadOrderAttachment(file);
                  if (url) {
                      attachments.push({
                          name: file.name,
                          url: url,
                          type: file.type.startsWith('image/') ? 'image' : 'document'
                      });
                  }
              }
          }

          if (isEditingRequest) {
              await updateMaterialRequest(isEditingRequest.id, {
                  material_content: row.name,
                  quantity_requested: finalQty,
                  unit: row.unit,
                  attachments: attachments.length > 0 ? attachments : undefined // Only update if new files provided, logic simplification
              });
          } else {
              await createMaterialRequest({
                  order_id: materialModal,
                  material_content: row.name,
                  quantity_requested: finalQty,
                  unit: row.unit,
                  attachments: attachments
              });
          }
      }

      setIsSubmittingReq(false);
      setMaterialModal(null);
      setIsEditingRequest(null);
      alert(isEditingRequest ? "Request Updated!" : "Material Request(s) Sent Successfully!");
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
                            onClick={() => openDetailsModal(order)}
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
      {/* ... (This section already updated in previous turn, ensuring format is kept) ... */}
      {detailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden">
                {/* ... Header and Content ... */}
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
                    
                    {detailsModal.attachments && detailsModal.attachments.length > 0 && (
                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                            <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-2 text-sm"><Paperclip size={14}/> Attachments</h4>
                            <div className="flex flex-wrap gap-2">
                                {detailsModal.attachments.map((file, i) => (
                                    <a 
                                        key={i}
                                        href={file.url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="px-3 py-1.5 bg-white text-indigo-600 rounded text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 border border-indigo-200"
                                    >
                                        <Download size={12}/> {file.name}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {(!detailsModal.attachments || detailsModal.attachments.length === 0) && detailsModal.attachment_url && (
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
                                            {getHeaderLabels().map(h => <th key={h} className="p-3">{h}</th>)}
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

                    <div>
                         <h4 className="font-bold text-slate-700 mb-1">Description / Notes</h4>
                         <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100">
                            {detailsModal.description || "No specific instructions."}
                         </p>
                    </div>
                </div>
                <div className="p-4 border-t bg-slate-50 text-right flex justify-end gap-2">
                    <button 
                        onClick={handlePrintOrderSheet}
                        className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 px-4 py-2 rounded font-bold flex items-center gap-2"
                    >
                        <Printer size={16}/> Print Order Sheet
                    </button>
                    <button onClick={() => setDetailsModal(null)} className="bg-slate-800 text-white px-4 py-2 rounded font-medium hover:bg-slate-700">Close</button>
                </div>
            </div>
        </div>
      )}

      {/* Completion Modal */}
      {/* ... (No changes needed here from previous, just context) ... */}
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
                    <div className="flex justify-between items-center mb-2">
                         <div/>
                    </div>
                    
                    <div className="border rounded-lg overflow-hidden shadow-sm">
                        <table className="w-full text-center text-sm">
                            <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                                <tr>
                                    <th className="p-3 text-left">Color</th>
                                    {getHeaderLabels().map(sz => (
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
                                    className="w-24 text-2xl font-mono font-bold p-2 rounded border border-yellow-300 focus:ring-2 focus:ring-yellow-500 outline-none bg-white text-slate-900"
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
                    {/* ... (Barcode form content) ... */}
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
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900"
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
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900"
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

      {/* NEW MATERIAL REQUEST MODAL - WITH MINIMIZE */}
      {materialModal && (
        <>
            {isMaterialModalMinimized ? (
                <div className="fixed bottom-4 right-4 z-50 bg-indigo-600 text-white p-4 rounded-lg shadow-xl cursor-pointer hover:bg-indigo-700 flex items-center gap-3 animate-scale-up" onClick={() => setIsMaterialModalMinimized(false)}>
                    <PackagePlus size={24}/>
                    <div>
                        <div className="font-bold text-sm">Material Request Active</div>
                        <div className="text-xs opacity-80">Click to expand</div>
                    </div>
                    <Maximize2 size={16} className="ml-2"/>
                </div>
            ) : (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b flex justify-between items-center bg-indigo-50">
                            <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                                <PackagePlus/> {isEditingRequest ? 'Edit Material Request' : 'Request Materials'}
                            </h3>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsMaterialModalMinimized(true)} className="text-indigo-400 hover:text-indigo-600 p-1"><Minimize2 size={20}/></button>
                                <button onClick={() => setMaterialModal(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={24}/></button>
                            </div>
                        </div>

                        {!isEditingRequest && (
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
                        )}

                        <form onSubmit={handleSubmitRequest} className="p-6 flex-1 overflow-y-auto">
                            
                            {reqTab === 'direct' ? (
                                <div className="space-y-6">
                                    {!isEditingRequest && (
                                        <p className="text-sm text-slate-500 mb-2 italic bg-slate-50 p-2 rounded">
                                            Enter the exact quantities needed. No multiplication will be applied.
                                        </p>
                                    )}
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                            <tr>
                                                <th className="p-3 w-10">S.No</th>
                                                <th className="p-3">Material Name</th>
                                                <th className="p-3 w-32">Quantity</th>
                                                <th className="p-3 w-20">Unit</th>
                                                <th className="p-3 w-40">Files (Multi)</th>
                                                {!isEditingRequest && <th className="p-3 w-10"></th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {materialRows.map((row, idx) => (
                                                <tr key={row.id}>
                                                    <td className="p-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                                    <td className="p-3">
                                                        <input 
                                                            placeholder="Item Name"
                                                            className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900 text-sm"
                                                            value={row.name}
                                                            onChange={e => handleRowChange(row.id, 'name', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input 
                                                            type="number" step="0.01"
                                                            className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900 text-sm text-center"
                                                            value={row.requestQty}
                                                            onChange={e => handleRowChange(row.id, 'requestQty', parseFloat(e.target.value) || 0)}
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input 
                                                            className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900 text-sm text-center"
                                                            value={row.unit}
                                                            placeholder="Nos"
                                                            onChange={e => handleRowChange(row.id, 'unit', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="relative">
                                                            <label className="cursor-pointer flex flex-col items-center justify-center gap-1 border border-dashed border-slate-300 p-2 rounded hover:bg-slate-50 text-xs text-slate-500 overflow-hidden">
                                                                <div className="flex items-center gap-1"><Paperclip size={12}/> Attach</div>
                                                                {row.files.length > 0 && <span className="font-bold text-indigo-600">{row.files.length} files</span>}
                                                                <input 
                                                                    type="file" multiple className="hidden" 
                                                                    accept="image/*,.pdf,.doc,.docx"
                                                                    onChange={e => {
                                                                        if(e.target.files) handleRowChange(row.id, 'files', Array.from(e.target.files));
                                                                    }}
                                                                />
                                                            </label>
                                                        </div>
                                                    </td>
                                                    {!isEditingRequest && (
                                                        <td className="p-3 text-center">
                                                            {materialRows.length > 1 && (
                                                                <button type="button" onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600">
                                                                    <Trash2 size={16}/>
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {!isEditingRequest && (
                                        <button 
                                            type="button" 
                                            onClick={addRow}
                                            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                        >
                                            <Plus size={16}/> Add Row
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                                        <label className="font-bold text-yellow-900">Total Number of Pcs (Order Qty):</label>
                                        <input 
                                            type="number"
                                            className="w-32 border-b-2 border-yellow-500 bg-transparent text-xl font-bold text-center outline-none focus:border-yellow-700 text-slate-900"
                                            value={totalPcs}
                                            onChange={e => setTotalPcs(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>

                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                            <tr>
                                                <th className="p-3 w-10">S.No</th>
                                                <th className="p-3">Material Name</th>
                                                <th className="p-3 w-28">Qty / Pc</th>
                                                <th className="p-3 w-20">Unit</th>
                                                <th className="p-3 w-32 bg-slate-100">Total Qty</th>
                                                <th className="p-3 w-40">Files (Multi)</th>
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
                                                            className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900 text-sm"
                                                            value={row.name}
                                                            onChange={e => handleRowChange(row.id, 'name', e.target.value)}
                                                            required
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input 
                                                            type="number" step="0.01"
                                                            className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900 text-sm text-center"
                                                            value={row.qtyPerPc}
                                                            onChange={e => handleRowChange(row.id, 'qtyPerPc', parseFloat(e.target.value) || 0)}
                                                        />
                                                    </td>
                                                    <td className="p-3">
                                                        <input 
                                                            className="w-full border p-2 rounded focus:ring-1 focus:ring-indigo-500 bg-white text-slate-900 text-sm text-center"
                                                            value={row.unit}
                                                            placeholder="Nos"
                                                            onChange={e => handleRowChange(row.id, 'unit', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3 bg-slate-50 font-bold text-indigo-700 text-center">
                                                        {(row.qtyPerPc * totalPcs).toFixed(2)}
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="relative">
                                                            <label className="cursor-pointer flex flex-col items-center justify-center gap-1 border border-dashed border-slate-300 p-2 rounded hover:bg-slate-50 text-xs text-slate-500 overflow-hidden">
                                                                <div className="flex items-center gap-1"><Paperclip size={12}/> Attach</div>
                                                                {row.files.length > 0 && <span className="font-bold text-indigo-600">{row.files.length} files</span>}
                                                                <input 
                                                                    type="file" multiple className="hidden" 
                                                                    accept="image/*,.pdf,.doc,.docx"
                                                                    onChange={e => {
                                                                        if(e.target.files) handleRowChange(row.id, 'files', Array.from(e.target.files));
                                                                    }}
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
                                    {isSubmittingReq ? 'Processing...' : (isEditingRequest ? 'Update Request' : 'Send Request')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
      )}

      {/* Material History Modal - GROUPED BY ORDER */}
      {showMaterialHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[85vh] flex flex-col">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                          <Archive size={20} className="text-slate-600"/> Request History
                      </h3>
                      <button onClick={() => setShowMaterialHistory(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                      {materialHistory.length === 0 ? (
                          <div className="p-8 text-center text-slate-400">No requests found.</div>
                      ) : (
                          // Group Logic within Render
                          Object.entries(
                              materialHistory.reduce((acc, req) => {
                                  if (!acc[req.order_id]) acc[req.order_id] = [];
                                  acc[req.order_id].push(req);
                                  return acc;
                              }, {} as Record<string, MaterialRequest[]>)
                          ).map(([orderId, reqs]: [string, MaterialRequest[]]) => {
                              const order = orders.find(o => o.id === orderId);
                              return (
                                  <div key={orderId} className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                      <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                                          <div className="flex items-center gap-3">
                                              <span className="font-bold text-slate-700 text-sm uppercase">Order #{order?.order_no || 'Unknown'}</span>
                                              <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-300">Style: {order?.style_number}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                              <button 
                                                onClick={() => order && handlePrintOrderReceipt(order, reqs)}
                                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded border border-transparent hover:border-indigo-100 transition"
                                                title="Print Accessories Receipt"
                                              >
                                                  <Printer size={16}/>
                                              </button>
                                              <span className="text-xs font-mono text-slate-400">ID: {orderId}</span>
                                          </div>
                                      </div>
                                      
                                      <table className="w-full text-left text-sm">
                                          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                              <tr>
                                                  <th className="p-3 w-24">Date</th>
                                                  <th className="p-3">Material</th>
                                                  <th className="p-3 w-20 text-center">Req</th>
                                                  <th className="p-3 w-16 text-center">Unit</th>
                                                  <th className="p-3 w-20 text-center">Appr</th>
                                                  <th className="p-3 w-24 text-center">Status</th>
                                                  <th className="p-3 w-12"></th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                              {reqs.map(req => {
                                                  // Can edit if Pending or Partially Approved
                                                  const canEdit = req.status === MaterialStatus.PENDING || req.status === MaterialStatus.PARTIALLY_APPROVED;
                                                  return (
                                                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                                          <td className="p-3 text-slate-500 text-xs">{new Date(req.created_at).toLocaleDateString()}</td>
                                                          <td className="p-3 font-medium text-slate-800">
                                                              {req.material_content}
                                                              {req.attachments && req.attachments.length > 0 && (
                                                                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                                      <Paperclip size={10}/> {req.attachments.length}
                                                                  </span>
                                                              )}
                                                          </td>
                                                          <td className="p-3 text-center">{req.quantity_requested}</td>
                                                          <td className="p-3 text-center text-slate-500 text-xs">{req.unit || 'Nos'}</td>
                                                          <td className="p-3 text-center font-bold text-green-600">{req.quantity_approved}</td>
                                                          <td className="p-3 text-center">
                                                              <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${
                                                                    req.status === 'PENDING' ? 'bg-orange-100 text-orange-600' :
                                                                    req.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                                                                    req.status === 'REJECTED' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
                                                              }`}>
                                                                  {req.status}
                                                              </span>
                                                          </td>
                                                          <td className="p-3 text-center">
                                                              {canEdit && (
                                                                  <button 
                                                                    onClick={() => handleEditRequest(req)}
                                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                                                    title="Edit Request"
                                                                  >
                                                                      <Pencil size={14}/>
                                                                  </button>
                                                              )}
                                                          </td>
                                                      </tr>
                                                  )
                                              })}
                                          </tbody>
                                      </table>
                                  </div>
                              );
                          })
                      )}
                  </div>
                  <div className="p-4 bg-slate-50 text-right border-t">
                      <button onClick={() => setShowMaterialHistory(false)} className="bg-slate-800 text-white px-4 py-2 rounded font-medium hover:bg-slate-700">Close</button>
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
                          <div className="text-center text-slate-400 text-sm">No activity logs found (or loading...)</div>
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
                              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900"
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

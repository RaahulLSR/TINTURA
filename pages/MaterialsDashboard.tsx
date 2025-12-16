
import React, { useEffect, useState } from 'react';
import { fetchMaterialRequests, approveMaterialRequest, fetchOrders, fetchUnits, fetchMaterialApprovals } from '../services/db';
import { MaterialRequest, MaterialStatus, Order, Unit } from '../types';
import { Printer, Paperclip, ChevronDown, ChevronUp, Box, ExternalLink, Calendar, AlertCircle, Search } from 'lucide-react';
import { useAuth } from '../components/Layout';

export const MaterialsDashboard: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // UI State
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  
  // Approval Modal State
  const [approvalModal, setApprovalModal] = useState<MaterialRequest | null>(null);
  const [approveQty, setApproveQty] = useState(0);

  const load = async () => {
    const [reqs, ords, unts] = await Promise.all([
        fetchMaterialRequests(),
        fetchOrders(),
        fetchUnits()
    ]);
    setRequests(reqs);
    setOrders(ords);
    setUnits(unts);
    
    // Auto-expand orders with pending requests
    const pendingOrderIds = reqs.filter(r => r.status === MaterialStatus.PENDING).map(r => r.order_id);
    setExpandedOrders(prev => [...new Set([...prev, ...pendingOrderIds])]);
  };

  useEffect(() => { load(); }, []);

  // Filter requests based on search
  const filteredRequests = requests.filter(req => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const order = orders.find(o => o.id === req.order_id);
      
      const orderMatch = order?.order_no.toLowerCase().includes(term);
      const styleMatch = order?.style_number.toLowerCase().includes(term);
      const contentMatch = req.material_content.toLowerCase().includes(term);

      return orderMatch || styleMatch || contentMatch;
  });

  // Group filtered requests by Order ID
  const groupedRequests = filteredRequests.reduce((acc, req) => {
      if (!acc[req.order_id]) acc[req.order_id] = [];
      acc[req.order_id].push(req);
      return acc;
  }, {} as Record<string, MaterialRequest[]>);

  // Toggle Accordion
  const toggleOrder = (orderId: string) => {
      setExpandedOrders(prev => 
          prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
      );
  };

  const getUnitName = (unitId: number) => units.find(u => u.id === unitId)?.name || 'Unknown Unit';

  // --- Printing Logic ---

  // 1. Single Item History Receipt
  const printReceipt = async (req: MaterialRequest, orderNo: string) => {
    const approvals = await fetchMaterialApprovals(req.id);
    let runningTotal = 0;
    const rowsHtml = approvals.map(app => {
        runningTotal += app.qty_approved;
        return `
            <tr>
                <td style="text-align:left">${new Date(app.created_at).toLocaleString()}</td>
                <td style="text-align:right">${app.qty_approved}</td>
            </tr>
        `;
    }).join('');

    const remaining = req.quantity_requested - req.quantity_approved;

    const win = window.open('', 'Receipt', 'width=400,height=600');
    if (win) {
        win.document.write(`
            <html>
            <head>
                <title>Material Receipt</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 20px; text-align: center; }
                    .header { font-weight: bold; font-size: 1.2rem; margin-bottom: 10px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
                    .meta { font-size: 0.8rem; margin-bottom: 20px; text-align: left; }
                    table { width: 100%; font-size: 0.9rem; margin: 15px 0; border-collapse: collapse; }
                    th { border-bottom: 1px solid #000; padding-bottom: 5px; }
                    td { padding: 4px 0; }
                    .summary { font-weight: bold; margin-top: 10px; border-top: 1px solid #000; padding-top: 10px; text-align:right; }
                    .footer { margin-top: 40px; border-top: 1px solid #000; padding-top: 5px; text-align: left; font-size: 0.9rem; }
                </style>
            </head>
            <body>
                <div class="header">TINTURA SST<br/>MATERIAL LOG</div>
                <div class="meta">
                    Print Date: ${new Date().toLocaleString()}<br/>
                    Order Ref: ${orderNo}<br/>
                    Item: ${req.material_content}<br/>
                    Req ID: ${req.id}
                </div>
                <div style="text-align:left; font-weight:bold; margin-bottom:5px;">APPROVAL HISTORY:</div>
                <table>
                    <thead><tr><th style="text-align:left">Date/Time</th><th style="text-align:right">Qty</th></tr></thead>
                    <tbody>${rowsHtml || '<tr><td colspan="2" style="text-align:center; padding:10px;">-- Update Pending --</td></tr>'}</tbody>
                </table>
                <div class="summary">
                    <div>TOTAL REQUESTED: ${req.quantity_requested} ${req.unit || 'Nos'}</div>
                    <div>TOTAL APPROVED: ${req.quantity_approved}</div>
                    <div style="margin-top:5px; font-size:1.1em;">REMAINING: ${remaining}</div>
                </div>
                <div class="footer">Status: ${req.status}<br/>Issued By System</div>
                <script>window.print(); setTimeout(() => window.close(), 500);</script>
            </body>
            </html>
        `);
        win.document.close();
    }
  };

  // 2. Full Order 2-Page Receipt
  const handlePrintOrderSummary = (order: Order, reqs: MaterialRequest[]) => {
      const win = window.open('', 'OrderReceipt', 'width=1000,height=800');
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

  const handleApprove = async () => {
    if (!approvalModal) return;
    
    // Calculate new status
    const newTotalApproved = approvalModal.quantity_approved + approveQty;
    let status = MaterialStatus.APPROVED;
    if (newTotalApproved < approvalModal.quantity_requested) status = MaterialStatus.PARTIALLY_APPROVED;
    if (newTotalApproved === 0 && approvalModal.quantity_approved === 0) status = MaterialStatus.REJECTED;

    // Use specific approve function that logs the transaction
    await approveMaterialRequest(approvalModal.id, approveQty, approvalModal.quantity_approved, status);
    
    // Find order number for receipt
    const order = orders.find(o => o.id === approvalModal.order_id);
    const orderNo = order ? order.order_no : 'UNK';

    // Automatically print receipt if approval qty > 0
    if (approveQty > 0) {
        // Fetch fresh data for printing to ensure ID logic holds
        const updatedReq = { ...approvalModal, quantity_approved: newTotalApproved, status };
        printReceipt(updatedReq, orderNo);
    }
    
    setApprovalModal(null);
    load();
  };

  const openApprovalModal = (req: MaterialRequest) => {
      setApprovalModal(req);
      // Default to approving the *remaining* amount
      setApproveQty(req.quantity_requested - req.quantity_approved);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Materials Requisition Hub</h2>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <input 
                    type="text"
                    placeholder="Search Order No, Style, or Item..."
                    className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full shadow-sm bg-white text-slate-900"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>
            
            <div className="text-sm text-slate-500 bg-white px-3 py-2 rounded-lg shadow-sm border whitespace-nowrap">
                {requests.filter(r => r.status === MaterialStatus.PENDING).length} Pending
            </div>
        </div>
      </div>
      
      {Object.keys(groupedRequests).length === 0 ? (
          <div className="text-center p-12 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-400">
              <Box size={48} className="mx-auto mb-3 opacity-50"/>
              <p className="text-lg font-medium">{searchTerm ? 'No matching requests found.' : 'No material requests found.'}</p>
          </div>
      ) : (
          <div className="space-y-6">
              {Object.entries(groupedRequests).map(([orderId, val]) => {
                  const orderRequests = val as MaterialRequest[];
                  const order = orders.find(o => o.id === orderId);
                  const isExpanded = expandedOrders.includes(orderId);
                  const hasPending = orderRequests.some(r => r.status === MaterialStatus.PENDING);
                  
                  return (
                    <div key={orderId} className={`bg-white rounded-xl shadow-sm border transition-all ${hasPending ? 'border-indigo-200' : 'border-slate-200'}`}>
                        {/* Order Header */}
                        <div 
                            className={`p-4 flex items-center justify-between hover:bg-slate-50 rounded-t-xl transition-colors ${isExpanded ? 'border-b border-slate-100' : ''}`}
                        >
                            <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => toggleOrder(orderId)}>
                                <div className={`p-2 rounded-lg ${hasPending ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                    <Box size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                        {order ? order.order_no : 'Unknown Order'}
                                        <span className="text-xs font-normal text-slate-500 px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">
                                            {orderRequests.length} Item(s)
                                        </span>
                                    </h3>
                                    <div className="text-xs text-slate-500 flex gap-3 mt-1">
                                        <span className="flex items-center gap-1"><ExternalLink size={10}/> Style: {order?.style_number || '---'}</span>
                                        <span>&bull;</span>
                                        <span>{order ? getUnitName(order.unit_id) : '---'}</span>
                                        <span>&bull;</span>
                                        <span className="flex items-center gap-1"><Calendar size={10}/> Due: {order?.target_delivery_date}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {hasPending && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                        <AlertCircle size={12}/> Action Required
                                    </span>
                                )}
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if(order) handlePrintOrderSummary(order, orderRequests);
                                    }}
                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white rounded border border-transparent hover:border-slate-200 transition"
                                    title="Print Full Order Receipt"
                                >
                                    <Printer size={18}/>
                                </button>
                                <div onClick={() => toggleOrder(orderId)} className="cursor-pointer">
                                    {isExpanded ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                                </div>
                            </div>
                        </div>

                        {/* Requests Table */}
                        {isExpanded && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
                                        <tr>
                                            <th className="p-4 pl-6">Material Item</th>
                                            <th className="p-4 w-32 text-center">Reference</th>
                                            <th className="p-4 text-center">Requested</th>
                                            <th className="p-4 text-center">Unit</th>
                                            <th className="p-4 text-center">Approved</th>
                                            <th className="p-4 text-center">Status</th>
                                            <th className="p-4 text-right pr-6">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {orderRequests.map(req => {
                                            const remaining = req.quantity_requested - req.quantity_approved;
                                            const canApprove = req.status === MaterialStatus.PENDING || (req.status === MaterialStatus.PARTIALLY_APPROVED && remaining > 0);
                                            
                                            return (
                                                <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="p-4 pl-6 font-medium text-slate-700">
                                                        {req.material_content}
                                                        <div className="text-xs text-slate-400 font-normal mt-0.5">
                                                            {new Date(req.created_at).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {req.attachments && req.attachments.length > 0 ? (
                                                            <div className="flex flex-col gap-1 items-center">
                                                                {req.attachments.map((att, i) => (
                                                                    <a 
                                                                        key={i}
                                                                        href={att.url} 
                                                                        target="_blank" 
                                                                        rel="noreferrer"
                                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-xs font-medium border border-indigo-100 max-w-[120px] truncate"
                                                                        title={att.name}
                                                                    >
                                                                        <Paperclip size={12} className="shrink-0"/> <span className="truncate">{att.name}</span>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center font-mono font-bold text-slate-600 bg-slate-50/30">
                                                        {req.quantity_requested}
                                                    </td>
                                                    <td className="p-4 text-center text-slate-500">
                                                        {req.unit || 'Nos'}
                                                    </td>
                                                    <td className="p-4 text-center font-mono font-bold text-green-600">
                                                        {req.quantity_approved}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                                            req.status === MaterialStatus.PENDING ? 'bg-orange-100 text-orange-600' :
                                                            req.status === MaterialStatus.APPROVED ? 'bg-green-100 text-green-600' :
                                                            req.status === MaterialStatus.REJECTED ? 'bg-red-100 text-red-600' :
                                                            'bg-yellow-100 text-yellow-600'
                                                        }`}>
                                                            {req.status.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => printReceipt(req, order ? order.order_no : 'UNK')}
                                                            className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded"
                                                            title="Print Log"
                                                        >
                                                            <Printer size={16}/>
                                                        </button>
                                                        {canApprove && (
                                                            <button 
                                                                onClick={() => openApprovalModal(req)}
                                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs font-bold shadow-sm transition-all active:scale-95"
                                                            >
                                                                Review
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                  );
              })}
          </div>
      )}

      {/* Partial Approval Modal */}
      {approvalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm animate-scale-up">
                <h3 className="font-bold text-lg mb-2 text-slate-800">
                    {approvalModal.status === MaterialStatus.PARTIALLY_APPROVED ? 'Continue Approval' : 'Approve Request'}
                </h3>
                <p className="text-sm text-slate-500 mb-4 bg-slate-50 p-2 rounded border border-slate-100">
                    {approvalModal.material_content}
                </p>
                
                <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                     <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="block text-xs text-slate-400 uppercase font-bold">Requested</span>
                        <b className="text-lg text-slate-800">{approvalModal.quantity_requested} <small className="text-xs font-normal">{approvalModal.unit || 'Nos'}</small></b>
                     </div>
                     <div className="bg-green-50 p-2 rounded border border-green-100">
                        <span className="block text-xs text-green-600 uppercase font-bold">Approved</span>
                        <b className="text-lg text-green-800">{approvalModal.quantity_approved}</b>
                     </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Quantity to Approve NOW
                    </label>
                    <input 
                        type="number" 
                        value={approveQty}
                        max={approvalModal.quantity_requested - approvalModal.quantity_approved}
                        min={0}
                        onChange={(e) => setApproveQty(parseFloat(e.target.value))}
                        className="w-full text-3xl font-mono border-b-2 border-indigo-500 focus:outline-none py-1 text-indigo-900 bg-white text-slate-900"
                    />
                    <div className="flex justify-between text-xs mt-2 text-slate-400">
                        <span>Min: 0</span>
                        <span>Remaining: {approvalModal.quantity_requested - approvalModal.quantity_approved}</span>
                    </div>
                </div>

                <div className="flex-end justify-end gap-3 pt-2 border-t flex">
                    <button onClick={() => setApprovalModal(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancel</button>
                    <button onClick={handleApprove} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-bold shadow-md">
                        <Printer size={16} />
                        Confirm & Print
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

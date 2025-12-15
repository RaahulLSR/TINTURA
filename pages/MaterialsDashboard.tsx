import React, { useEffect, useState } from 'react';
import { fetchMaterialRequests, approveMaterialRequest, fetchOrders, fetchUnits } from '../services/db';
import { MaterialRequest, MaterialStatus, Order, Unit } from '../types';
import { Printer, Paperclip, ChevronDown, ChevronUp, Box, ExternalLink, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../components/Layout';

export const MaterialsDashboard: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  
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

  // Group requests by Order ID
  const groupedRequests = requests.reduce((acc, req) => {
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

  // --- Printing & Approval Logic ---

  const printReceipt = (req: MaterialRequest, qtyApprovedNow: number, orderNo: string) => {
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
                    .content { font-size: 1.1rem; margin: 20px 0; font-weight: bold; }
                    .footer { margin-top: 40px; border-top: 1px solid #000; padding-top: 5px; text-align: left; font-size: 0.9rem; }
                </style>
            </head>
            <body>
                <div class="header">
                    TINTURA MES<br/>
                    MATERIAL APPROVAL
                </div>
                <div class="meta">
                    Date: ${new Date().toLocaleString()}<br/>
                    Order Ref: ${orderNo}<br/>
                    Item: ${req.material_content}
                </div>
                <div class="content">
                    QTY APPROVED: ${qtyApprovedNow}
                </div>
                <div class="footer">
                    Approved By:<br/>
                    <br/>
                    ${user}
                </div>
                <script>
                    window.print();
                    setTimeout(() => window.close(), 500);
                </script>
            </body>
            </html>
        `);
        win.document.close();
    }
  };

  const handleApprove = async () => {
    if (!approvalModal) return;
    
    // Calculate total approved including previous approvals
    const newTotalApproved = approvalModal.quantity_approved + approveQty;
    
    let status = MaterialStatus.APPROVED;
    if (newTotalApproved < approvalModal.quantity_requested) status = MaterialStatus.PARTIALLY_APPROVED;
    if (newTotalApproved === 0 && approvalModal.quantity_approved === 0) status = MaterialStatus.REJECTED;

    await approveMaterialRequest(approvalModal.id, newTotalApproved, status);
    
    // Find order number for receipt
    const order = orders.find(o => o.id === approvalModal.order_id);
    const orderNo = order ? order.order_no : 'UNK';

    // Generate Receipt for the *current batch* approved
    if (approveQty > 0) {
        printReceipt(approvalModal, approveQty, orderNo);
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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Materials Requisition Hub</h2>
        <div className="text-sm text-slate-500 bg-white px-3 py-1 rounded-full shadow-sm border">
            {requests.filter(r => r.status === MaterialStatus.PENDING).length} Pending Requests
        </div>
      </div>
      
      {Object.keys(groupedRequests).length === 0 ? (
          <div className="text-center p-12 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-400">
              <Box size={48} className="mx-auto mb-3 opacity-50"/>
              <p className="text-lg font-medium">No material requests found.</p>
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
                            onClick={() => toggleOrder(orderId)}
                            className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 rounded-t-xl transition-colors ${isExpanded ? 'border-b border-slate-100' : ''}`}
                        >
                            <div className="flex items-center gap-4">
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
                                {isExpanded ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
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
                                                        {req.attachment_url ? (
                                                            <a 
                                                                href={req.attachment_url} 
                                                                target="_blank" 
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-xs font-medium border border-indigo-100"
                                                            >
                                                                <Paperclip size={12}/> View File
                                                            </a>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center font-mono font-bold text-slate-600 bg-slate-50/30">
                                                        {req.quantity_requested}
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
                                                    <td className="p-4 pr-6 text-right">
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
                        <b className="text-lg text-slate-800">{approvalModal.quantity_requested}</b>
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
                        className="w-full text-3xl font-mono border-b-2 border-indigo-500 focus:outline-none py-1 text-indigo-900 bg-white text-black"
                    />
                    <div className="flex justify-between text-xs mt-2 text-slate-400">
                        <span>Min: 0</span>
                        <span>Remaining: {approvalModal.quantity_requested - approvalModal.quantity_approved}</span>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t">
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
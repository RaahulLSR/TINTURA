import React, { useEffect, useState } from 'react';
import { fetchOrders, updateOrderStatus } from '../services/db';
import { Order, OrderStatus } from '../types';
import { CheckCheck, ClipboardList, ThumbsUp, ThumbsDown } from 'lucide-react';

interface OrderQCModal {
    id: string;
    type: 'ACCEPT' | 'REJECT';
    orderNo: string;
}

export const QCDashboard: React.FC = () => {
  // Order State
  const [qcOrders, setQcOrders] = useState<Order[]>([]);
  const [orderModal, setOrderModal] = useState<OrderQCModal | null>(null);
  const [qcDescription, setQcDescription] = useState("");

  const loadData = async () => {
    // Load Orders waiting for QC
    const allOrders = await fetchOrders();
    setQcOrders(allOrders.filter(o => o.status === OrderStatus.QC));
  };

  useEffect(() => { loadData(); }, []);

  // --- ORDER LOGIC ---
  const handleOrderAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderModal) return;

    if (orderModal.type === 'ACCEPT') {
        // Updated: Move to QC_APPROVED instead of COMPLETED
        await updateOrderStatus(orderModal.id, OrderStatus.QC_APPROVED, `QC PASSED: ${qcDescription}`);
    } else {
        // Move back to STARTED
        await updateOrderStatus(orderModal.id, OrderStatus.STARTED, `QC REJECTED: ${qcDescription}`);
    }

    setOrderModal(null);
    setQcDescription("");
    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList className="text-indigo-600"/> Quality Control Station
        </h2>
      </div>

      {/* --- ORDERS VIEW --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b bg-indigo-50 font-semibold text-indigo-800 flex items-center gap-2">
            <CheckCheck size={18} /> Orders Pending Final Review
            </div>
            {qcOrders.length === 0 ? (
                <div className="p-10 text-center text-slate-400">All caught up! No orders pending QC.</div>
            ) : (
            <div className="grid grid-cols-1 divide-y divide-slate-100">
                {qcOrders.map(order => (
                    <div key={order.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">{order.order_no}</h3>
                            <div className="text-sm text-slate-500 mb-2">{order.style_number} &bull; {order.quantity} Units</div>
                            <p className="text-sm text-slate-600 bg-slate-100 p-2 rounded inline-block">
                                {order.description || "No description provided."}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setOrderModal({ id: order.id, type: 'REJECT', orderNo: order.order_no })}
                                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-2 font-medium"
                            >
                                <ThumbsDown size={18} /> Reject
                            </button>
                            <button 
                                onClick={() => setOrderModal({ id: order.id, type: 'ACCEPT', orderNo: order.order_no })}
                                className="px-4 py-2 bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 flex items-center gap-2 font-medium"
                            >
                                <ThumbsUp size={18} /> Accept
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            )}
      </div>

      {/* QC Modal */}
      {orderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${orderModal.type === 'ACCEPT' ? 'text-green-600' : 'text-red-600'}`}>
                    {orderModal.type === 'ACCEPT' ? <ThumbsUp /> : <ThumbsDown />}
                    {orderModal.type === 'ACCEPT' ? 'Accept Order' : 'Reject Order'}
                </h3>
                <p className="text-slate-600 mb-4">
                    Order: <span className="font-bold">{orderModal.orderNo}</span><br/>
                    {orderModal.type === 'ACCEPT' 
                        ? 'This will mark the order as QC APPROVED.' 
                        : 'This will return the order to STARTED status.'}
                </p>

                <form onSubmit={handleOrderAction}>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                        {orderModal.type === 'ACCEPT' ? 'Quality Notes / Certification' : 'Reason for Rejection'}
                    </label>
                    <textarea 
                        required
                        className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black"
                        rows={3}
                        placeholder={orderModal.type === 'ACCEPT' ? "Verified all specs..." : "Stitching issue on left sleeve..."}
                        value={qcDescription}
                        onChange={e => setQcDescription(e.target.value)}
                    />
                    
                    <div className="flex justify-end gap-3 mt-6">
                        <button 
                            type="button" 
                            onClick={() => setOrderModal(null)}
                            className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className={`px-4 py-2 text-white rounded-lg font-medium ${
                                orderModal.type === 'ACCEPT' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            Confirm {orderModal.type === 'ACCEPT' ? 'Approval' : 'Rejection'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
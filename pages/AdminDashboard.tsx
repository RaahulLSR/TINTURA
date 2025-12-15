import React, { useEffect, useState } from 'react';
import { fetchOrders, fetchUnits, createOrder, fetchBarcodes, uploadOrderAttachment } from '../services/db';
import { Order, Unit, OrderStatus, BarcodeStatus, SizeBreakdown } from '../types';
import { StatusBadge } from '../components/Widgets';
import { PlusCircle, RefreshCw, Package, Activity, Trash2, Plus, Eye, X, Upload, FileText, Download, BarChart3, PieChart, Calendar, Filter, ArrowUpRight, TrendingUp } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'reports'>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [liveStockCount, setLiveStockCount] = useState(0);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<Order | null>(null);

  // Report Filters
  const [reportFilter, setReportFilter] = useState({
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0], // Last month
      endDate: new Date().toISOString().split('T')[0],
      unitId: 'all'
  });

  // New Order Form State
  const [newOrder, setNewOrder] = useState({
    style_number: '',
    unit_id: 1,
    target_delivery_date: '',
    description: '',
    box_count: 0
  });

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Size Breakdown State
  const [breakdown, setBreakdown] = useState<SizeBreakdown[]>([
    { color: '', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }
  ]);

  const loadData = async () => {
    // Parallel fetch for efficiency
    const [fetchedOrders, fetchedUnits, fetchedStock] = await Promise.all([
        fetchOrders(), 
        fetchUnits(),
        fetchBarcodes(BarcodeStatus.COMMITTED_TO_STOCK)
    ]);
    
    setOrders(fetchedOrders);
    setUnits(fetchedUnits);

    // Calculate Stats
    setLiveStockCount(fetchedStock.length);
    setActiveOrderCount(fetchedOrders.filter(o => o.status !== OrderStatus.COMPLETED).length);
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- REPORT ALGORITHMS ---
  const getFilteredOrders = () => {
      return orders.filter(o => {
          // Date Filter (using created_at or fallback to delivery date)
          const dateRef = o.created_at ? o.created_at.split('T')[0] : o.target_delivery_date;
          const inDate = dateRef >= reportFilter.startDate && dateRef <= reportFilter.endDate;
          
          // Unit Filter
          const inUnit = reportFilter.unitId === 'all' || o.unit_id === parseInt(reportFilter.unitId);

          return inDate && inUnit;
      });
  };

  const generateReportStats = () => {
      const subset = getFilteredOrders();
      const totalOrders = subset.length;
      const completedOrders = subset.filter(o => o.status === OrderStatus.COMPLETED).length;
      const totalPieces = subset.reduce((acc, o) => acc + o.quantity, 0);
      const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : "0";

      // Status Distribution
      const statusDist = subset.reduce((acc, o) => {
          acc[o.status] = (acc[o.status] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      // Unit Performance (Total Qty Produced per Unit)
      const unitPerf = units.map(u => {
          const unitOrders = subset.filter(o => o.unit_id === u.id);
          const totalQty = unitOrders.reduce((acc, o) => acc + o.quantity, 0);
          const completedQty = unitOrders.filter(o => o.status === OrderStatus.COMPLETED)
                                         .reduce((acc, o) => acc + o.quantity, 0);
          return { name: u.name, totalQty, completedQty };
      }).sort((a,b) => b.totalQty - a.totalQty);

      return { totalOrders, completedOrders, totalPieces, completionRate, statusDist, unitPerf };
  };

  const stats = generateReportStats();

  // --- HELPERS ---

  const getRowTotal = (row: SizeBreakdown) => {
    return (row.s || 0) + (row.m || 0) + (row.l || 0) + (row.xl || 0) + (row.xxl || 0) + (row.xxxl || 0);
  };

  const getTotalQuantity = () => {
    return breakdown.reduce((acc, row) => acc + getRowTotal(row), 0);
  };

  const handleAddRow = () => {
    setBreakdown([...breakdown, { color: '', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }]);
  };

  const handleRemoveRow = (index: number) => {
    setBreakdown(breakdown.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof SizeBreakdown, value: string | number) => {
    const updated = [...breakdown];
    updated[index] = { ...updated[index], [field]: value };
    setBreakdown(updated);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const quantity = getTotalQuantity();
    if (quantity === 0) {
        alert("Total quantity cannot be zero");
        return;
    }

    setIsUploading(true);

    let attachmentUrl = undefined;
    if (selectedFile) {
        const url = await uploadOrderAttachment(selectedFile);
        if (url) attachmentUrl = url;
    }

    await createOrder({
        ...newOrder,
        quantity: quantity,
        size_breakdown: breakdown,
        attachment_url: attachmentUrl,
        attachment_name: selectedFile?.name
    });

    setIsUploading(false);
    setIsModalOpen(false);
    // Reset form
    setNewOrder({ style_number: '', unit_id: 1, target_delivery_date: '', description: '', box_count: 0 });
    setBreakdown([{ color: '', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }]);
    setSelectedFile(null);
    loadData(); 
  };

  // Helper to render Detail Modal cells (X/Y logic)
  const renderDetailCell = (order: Order, rowIdx: number, sizeKey: keyof SizeBreakdown) => {
      const plannedRow = order.size_breakdown?.[rowIdx];
      const actualRow = order.completion_breakdown?.[rowIdx];
      
      const plannedVal = plannedRow ? (plannedRow[sizeKey] as number) : 0;
      
      // If not completed or no completion data, show simple planned value
      if (order.status !== OrderStatus.COMPLETED || !actualRow) {
          return <span className="text-slate-600">{plannedVal}</span>;
      }

      // If completed, show Actual / Planned
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <h2 className="text-3xl font-bold text-slate-800">
            {activeTab === 'overview' ? 'Executive Dashboard' : 'Analytics & Reports'}
        </h2>
        
        <div className="flex items-center gap-2">
            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex">
                <button 
                    onClick={() => setActiveTab('overview')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'overview' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <BarChart3 size={16}/> Overview
                </button>
                <button 
                    onClick={() => setActiveTab('reports')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'reports' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <PieChart size={16}/> Performance Reports
                </button>
            </div>
            
            {activeTab === 'overview' && (
                <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg flex items-center space-x-2 hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                >
                <PlusCircle size={18} />
                <span className="hidden md:inline">New Order</span>
                </button>
            )}
        </div>
      </div>

      {/* ================= OVERVIEW TAB ================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Live Inventory Stock</p>
                    <p className="text-4xl font-extrabold text-slate-800 mt-2">{liveStockCount}</p>
                    <p className="text-xs text-slate-500 mt-1">Items currently committed to stock</p>
                </div>
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                    <Package size={32} />
                </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                <div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Orders In Progress</p>
                    <p className="text-4xl font-extrabold text-slate-800 mt-2">{activeOrderCount}</p>
                    <p className="text-xs text-slate-500 mt-1">Active manufacturing orders</p>
                </div>
                <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
                    <Activity size={32} />
                </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-semibold text-slate-700">Master Order List</h3>
                <button onClick={loadData} className="text-slate-500 hover:text-indigo-600 transition-colors"><RefreshCw size={18}/></button>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                        <th className="p-4 font-medium">Order No</th>
                        <th className="p-4 font-medium">Style</th>
                        <th className="p-4 font-medium">Unit</th>
                        <th className="p-4 font-medium">Qty</th>
                        <th className="p-4 font-medium">Delivery</th>
                        <th className="p-4 font-medium">Status</th>
                        <th className="p-4 font-medium text-right">Action</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {orders.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-semibold text-slate-700">{order.order_no}</td>
                        <td className="p-4 text-slate-600">{order.style_number}</td>
                        <td className="p-4 text-slate-600">{units.find(u => u.id === order.unit_id)?.name}</td>
                        <td className="p-4 text-slate-600">{order.quantity}</td>
                        <td className="p-4 text-slate-600">{order.target_delivery_date}</td>
                        <td className="p-4"><StatusBadge status={order.status} /></td>
                        <td className="p-4 text-right">
                            <button 
                                onClick={() => setDetailsModal(order)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                                title="View Details"
                            >
                                <Eye size={18}/>
                            </button>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
      )}

      {/* ================= REPORTS TAB ================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-fade-in">
            {/* Filter Controls */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-end md:items-center">
                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Calendar size={12}/> Start Date</label>
                        <input 
                            type="date" 
                            className="w-full border border-slate-300 rounded-lg p-2 bg-white text-black text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={reportFilter.startDate}
                            onChange={(e) => setReportFilter({...reportFilter, startDate: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Calendar size={12}/> End Date</label>
                        <input 
                            type="date" 
                            className="w-full border border-slate-300 rounded-lg p-2 bg-white text-black text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={reportFilter.endDate}
                            onChange={(e) => setReportFilter({...reportFilter, endDate: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Filter size={12}/> Filter Unit</label>
                        <select 
                            className="w-full border border-slate-300 rounded-lg p-2 bg-white text-black text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            value={reportFilter.unitId}
                            onChange={(e) => setReportFilter({...reportFilter, unitId: e.target.value})}
                        >
                            <option value="all">All Units</option>
                            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Orders</p>
                    <p className="text-2xl font-extrabold text-indigo-600 mt-1">{stats.totalOrders}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase">Pieces Production</p>
                    <p className="text-2xl font-extrabold text-blue-600 mt-1">{stats.totalPieces.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase">Completed Orders</p>
                    <p className="text-2xl font-extrabold text-green-600 mt-1">{stats.completedOrders}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase">Completion Rate</p>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-2xl font-extrabold text-slate-800">{stats.completionRate}%</p>
                        <TrendingUp size={20} className={parseFloat(stats.completionRate) > 50 ? 'text-green-500' : 'text-orange-500'} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Unit Performance Chart */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChart3 className="text-indigo-600"/> Unit Production Volume</h3>
                    <div className="space-y-4">
                        {stats.unitPerf.map((u, idx) => {
                            const maxVal = Math.max(...stats.unitPerf.map(i => i.totalQty), 1); // Avoid div by zero
                            const percentage = (u.totalQty / maxVal) * 100;
                            return (
                                <div key={idx}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-slate-700">{u.name}</span>
                                        <span className="font-mono font-bold text-slate-600">{u.totalQty} pcs</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                        <div 
                                            className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                                            style={{ width: `${percentage}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1 text-right">
                                        {u.completedQty} Completed
                                    </div>
                                </div>
                            )
                        })}
                        {stats.unitPerf.length === 0 && <p className="text-center text-slate-400 italic">No data for selected range.</p>}
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><Activity className="text-indigo-600"/> Order Status Breakdown</h3>
                    <div className="space-y-3">
                        {Object.entries(stats.statusDist).map(([status, count], idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <StatusBadge status={status} />
                                </div>
                                <span className="font-bold text-slate-800 bg-white px-3 py-1 rounded shadow-sm border border-slate-200">{count}</span>
                            </div>
                        ))}
                         {Object.keys(stats.statusDist).length === 0 && <p className="text-center text-slate-400 italic">No data found.</p>}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Details Modal */}
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

                    <div>
                        <h4 className="font-bold text-slate-700 mb-2 flex justify-between">
                            <span>Order Breakdown</span>
                            {detailsModal.status === OrderStatus.COMPLETED && <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Displaying: Actual / Planned</span>}
                        </h4>
                        {!detailsModal.size_breakdown || detailsModal.size_breakdown.length === 0 ? (
                            <div className="p-4 text-center bg-slate-50 rounded text-slate-400 italic">
                                No breakdown data available.
                            </div>
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
                                            // Handle Row Total Display Logic
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

      {/* Create Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-bold mb-4">Issue New Manufacturing Order</h3>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Style No</label>
                  <input required type="text" className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black" 
                    onChange={e => setNewOrder({...newOrder, style_number: e.target.value})} />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700">Target Date</label>
                   <input required type="date" className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black" 
                    onChange={e => setNewOrder({...newOrder, target_delivery_date: e.target.value})} />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <input required type="text" className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black" 
                    onChange={e => setNewOrder({...newOrder, description: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Assign Unit</label>
                  <select className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black" 
                    onChange={e => setNewOrder({...newOrder, unit_id: parseInt(e.target.value)})}>
                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Order Matrix */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-2">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-slate-700">Order Quantity Matrix</label>
                    <span className="text-sm font-bold bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                        Total Qty: {getTotalQuantity()}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-center text-sm">
                        <thead className="text-slate-500 text-xs uppercase bg-slate-100">
                            <tr>
                                <th className="p-2 w-32 text-left">Color</th>
                                <th className="p-2 w-16">S / 65</th>
                                <th className="p-2 w-16">M / 70</th>
                                <th className="p-2 w-16">L / 75</th>
                                <th className="p-2 w-16">XL / 80</th>
                                <th className="p-2 w-16">XXL / 85</th>
                                <th className="p-2 w-16">XXXL / 90</th>
                                <th className="p-2 w-16 bg-slate-200">Total</th>
                                <th className="p-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {breakdown.map((row, idx) => (
                                <tr key={idx} className="bg-white">
                                    <td className="p-2">
                                        <input 
                                            placeholder="Color Name"
                                            className="w-full border p-1 rounded focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-black"
                                            value={row.color}
                                            onChange={e => updateRow(idx, 'color', e.target.value)}
                                            required
                                        />
                                    </td>
                                    {['s','m','l','xl','xxl','xxxl'].map((size) => (
                                        <td key={size} className="p-2">
                                            <input 
                                                type="number" min="0"
                                                className="w-full border p-1 rounded text-center focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-black"
                                                value={(row as any)[size]}
                                                onChange={e => updateRow(idx, size as keyof SizeBreakdown, parseInt(e.target.value) || 0)}
                                            />
                                        </td>
                                    ))}
                                    <td className="p-2 bg-slate-50 font-bold text-slate-600">
                                        {getRowTotal(row)}
                                    </td>
                                    <td className="p-2">
                                        {breakdown.length > 1 && (
                                            <button type="button" onClick={() => handleRemoveRow(idx)} className="text-red-400 hover:text-red-600">
                                                <Trash2 size={16}/>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <button type="button" onClick={handleAddRow} className="mt-3 text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold">
                    <Plus size={14}/> Add Color Row
                </button>
              </div>
              
              <div className="flex gap-4 mt-2">
                <div className="w-1/3">
                    <label className="block text-sm font-medium text-slate-700">Total No. of Boxes</label>
                    <input 
                        type="number" 
                        min="1"
                        className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-black" 
                        onChange={e => setNewOrder({...newOrder, box_count: parseInt(e.target.value)})} 
                    />
                </div>
                <div className="w-2/3">
                    <label className="block text-sm font-medium text-slate-700">Attach Document (PDF, Excel, Zip)</label>
                    <div className="mt-1 flex items-center gap-2">
                        <label className="flex-1 cursor-pointer bg-white border border-slate-300 rounded-lg p-2 flex items-center gap-2 hover:bg-slate-50">
                            <Upload size={18} className="text-slate-400"/>
                            <span className="text-sm text-slate-600 truncate">{selectedFile ? selectedFile.name : 'Choose file...'}</span>
                            <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                        </label>
                    </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
                <button 
                    type="submit" 
                    disabled={isUploading}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2"
                >
                    {isUploading ? 'Uploading...' : 'Issue Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
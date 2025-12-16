
import React, { useEffect, useState } from 'react';
import { fetchOrders, fetchUnits, createOrder, fetchBarcodes, uploadOrderAttachment, fetchOrderLogs, updateOrderDetails } from '../services/db';
import { Order, Unit, OrderStatus, BarcodeStatus, SizeBreakdown, OrderLog, Attachment } from '../types';
import { StatusBadge } from '../components/Widgets';
import { PlusCircle, RefreshCw, Package, Activity, Trash2, Plus, Eye, X, Upload, FileText, Download, BarChart3, PieChart, Calendar, Filter, ArrowUpRight, TrendingUp, Clock, List, MessageSquare, AlertTriangle, AlertOctagon, CheckCircle2, ChevronDown, ChevronUp, Pencil, Save, Archive, Search, ArrowLeftRight, Paperclip } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'reports'>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [liveStockCount, setLiveStockCount] = useState(0);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<Order | null>(null);
  
  // Edit Mode State in Modal
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Order>>({});
  
  // Modal Timeline Data
  const [modalLogs, setModalLogs] = useState<OrderLog[]>([]);

  // Size Header Toggle State
  const [useNumericSizes, setUseNumericSizes] = useState(false);

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  }, [activeTab]);

  // When details modal opens, fetch specific logs and reset edit mode
  useEffect(() => {
      if (detailsModal) {
          fetchOrderLogs(detailsModal.id).then(setModalLogs);
          setIsEditing(false);
          setEditFormData({});
          // Auto-set format view based on order property
          setUseNumericSizes(detailsModal.size_format === 'numeric');
      } else {
          setModalLogs([]);
          setIsEditing(false);
      }
  }, [detailsModal]);

  // --- FILTERED ORDERS FOR LIST ---
  const getDisplayOrders = () => {
      return orders.filter(order => {
          const matchesSearch = 
            order.order_no.toLowerCase().includes(searchTerm.toLowerCase()) || 
            order.style_number.toLowerCase().includes(searchTerm.toLowerCase());
          
          const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

          return matchesSearch && matchesStatus;
      });
  };

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

  const getDelayedOrders = () => {
      const today = new Date().toISOString().split('T')[0];
      return orders.filter(o => 
          o.status !== OrderStatus.COMPLETED && 
          o.target_delivery_date < today
      );
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
  const delayedOrders = getDelayedOrders();

  // --- HELPERS ---

  const getRowTotal = (row: SizeBreakdown) => {
    return (row.s || 0) + (row.m || 0) + (row.l || 0) + (row.xl || 0) + (row.xxl || 0) + (row.xxxl || 0);
  };

  const getTotalQuantity = (bd: SizeBreakdown[] = breakdown) => {
    return bd.reduce((acc, row) => acc + getRowTotal(row), 0);
  };

  const getHeaderLabels = () => {
    return useNumericSizes 
        ? ['65', '70', '75', '80', '85', '90'] 
        : ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
  };

  const handleAddRow = (setFunc = setBreakdown, current = breakdown) => {
    setFunc([...current, { color: '', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }]);
  };

  const handleRemoveRow = (index: number, setFunc = setBreakdown, current = breakdown) => {
    setFunc(current.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof SizeBreakdown, value: string | number, setFunc = setBreakdown, current = breakdown) => {
    const updated = [...current];
    updated[index] = { ...updated[index], [field]: value };
    setFunc(updated);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const quantity = getTotalQuantity(breakdown);
    if (quantity === 0) {
        alert("Total quantity cannot be zero");
        return;
    }

    setIsUploading(true);

    const attachments: Attachment[] = [];
    if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
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

    await createOrder({
        ...newOrder,
        quantity: quantity,
        size_breakdown: breakdown,
        attachments: attachments,
        size_format: useNumericSizes ? 'numeric' : 'standard'
    });

    setIsUploading(false);
    setIsModalOpen(false);
    // Reset form
    setNewOrder({ style_number: '', unit_id: 1, target_delivery_date: '', description: '', box_count: 0 });
    setBreakdown([{ color: '', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }]);
    setSelectedFiles([]);
    loadData(); 
  };

  // --- EDIT ORDER LOGIC ---
  const handleEditClick = () => {
    if (!detailsModal) return;
    setEditFormData({
        style_number: detailsModal.style_number,
        unit_id: detailsModal.unit_id,
        target_delivery_date: detailsModal.target_delivery_date,
        description: detailsModal.description,
        box_count: detailsModal.box_count,
        size_breakdown: detailsModal.size_breakdown ? [...detailsModal.size_breakdown] : []
    });
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
      if (!detailsModal) return;

      const newQty = getTotalQuantity(editFormData.size_breakdown as SizeBreakdown[]);
      
      const updates: Partial<Order> = {
          ...editFormData,
          quantity: newQty
      };

      await updateOrderDetails(detailsModal.id, updates);
      
      setIsEditing(false);
      setDetailsModal(null); // Close to refresh properly or update local state
      loadData();
  };

  const updateEditBreakdown = (index: number, field: keyof SizeBreakdown, value: string | number) => {
      if (!editFormData.size_breakdown) return;
      const current = [...editFormData.size_breakdown];
      current[index] = { ...current[index], [field]: value };
      setEditFormData({ ...editFormData, size_breakdown: current });
  };

  const addEditRow = () => {
      const current = editFormData.size_breakdown || [];
      setEditFormData({ ...editFormData, size_breakdown: [...current, { color: '', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }] });
  };

  const removeEditRow = (idx: number) => {
      const current = editFormData.size_breakdown || [];
      setEditFormData({ ...editFormData, size_breakdown: current.filter((_, i) => i !== idx) });
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
                    <PieChart size={16}/> Reports
                </button>
            </div>
            
            {activeTab === 'overview' && (
                <button 
                onClick={() => { setIsModalOpen(true); setUseNumericSizes(false); }}
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

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50">
                    <h3 className="font-semibold text-slate-700 flex items-center gap-2 whitespace-nowrap">
                        Master Order List <span className="text-xs font-normal text-slate-400">({getDisplayOrders().length})</span>
                    </h3>
                    
                    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                        <div className="relative">
                            <input 
                                type="text"
                                placeholder="Search Order # or Style..."
                                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 bg-white text-slate-900"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        </div>
                        
                        <div className="relative">
                            <select 
                                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-48 appearance-none bg-white text-slate-900"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">All Statuses</option>
                                {Object.values(OrderStatus).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                            </select>
                            <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        </div>

                        <button onClick={loadData} className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-100 transition-colors">
                            <RefreshCw size={18}/>
                        </button>
                    </div>
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
                    {getDisplayOrders().map((order) => (
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
                    {getDisplayOrders().length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                No orders found matching your search.
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
      )}

      {/* ================= REPORTS TAB ================= */}
      {/* ... (Existing Reports Tab Code) ... */}
      
      {/* Details Modal */}
      {detailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">{detailsModal.order_no}</h3>
                            {isEditing ? (
                                <input 
                                    className="text-sm font-bold text-slate-900 border rounded px-2 py-1 bg-white mt-1 w-40"
                                    value={editFormData.style_number}
                                    onChange={e => setEditFormData({...editFormData, style_number: e.target.value})}
                                />
                            ) : (
                                <p className="text-sm text-slate-500">Style: {detailsModal.style_number}</p>
                            )}
                        </div>
                        {isEditing && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-bold border border-yellow-200">EDIT MODE</span>}
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <button 
                                onClick={handleEditClick}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded border border-slate-200 text-xs font-bold"
                            >
                                <Pencil size={14}/> Edit Order
                            </button>
                        )}
                        <button onClick={() => setDetailsModal(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 bg-slate-50 rounded border border-slate-100">
                            <span className="block text-slate-500 text-xs uppercase font-bold">Total Qty</span>
                            <span className="text-xl font-bold text-slate-800">
                                {isEditing ? getTotalQuantity(editFormData.size_breakdown) : detailsModal.quantity}
                            </span>
                        </div>
                        <div className="p-3 bg-slate-50 rounded border border-slate-100">
                            <span className="block text-slate-500 text-xs uppercase font-bold">Delivery Date</span>
                            {isEditing ? (
                                <input 
                                    type="date"
                                    className="text-lg font-bold text-slate-900 bg-white border-b border-indigo-300 w-full outline-none focus:border-indigo-500"
                                    value={editFormData.target_delivery_date}
                                    onChange={e => setEditFormData({...editFormData, target_delivery_date: e.target.value})}
                                />
                            ) : (
                                <span className="text-xl font-bold text-slate-800">{detailsModal.target_delivery_date}</span>
                            )}
                        </div>
                        {isEditing && (
                             <div className="col-span-2 p-3 bg-slate-50 rounded border border-slate-100">
                                <span className="block text-slate-500 text-xs uppercase font-bold mb-1">Assigned Unit</span>
                                <select 
                                    className="w-full bg-white border border-slate-300 rounded p-2 text-slate-900 font-medium"
                                    value={editFormData.unit_id}
                                    onChange={e => setEditFormData({...editFormData, unit_id: parseInt(e.target.value)})}
                                >
                                    {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                             </div>
                        )}
                    </div>
                    
                    {/* TIMELINE SECTION INSIDE MODAL (Only when not editing) */}
                    {!isEditing && (
                        <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-4">
                            <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2 text-sm uppercase"><Clock size={16}/> Production Timeline</h4>
                            <div className="space-y-4 max-h-40 overflow-y-auto pr-2">
                                {modalLogs.length === 0 ? (
                                    <p className="text-sm text-indigo-400 italic">No timeline events recorded.</p>
                                ) : (
                                    modalLogs.map(log => (
                                        <div key={log.id} className="flex gap-3 text-sm">
                                            <div className="min-w-[130px] text-xs font-mono text-slate-500 pt-0.5">
                                                {new Date(log.created_at).toLocaleString([], { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                                            </div>
                                            <div className="flex-1">
                                                <span className={`font-bold text-xs px-1.5 py-0.5 rounded mr-2 ${
                                                    log.log_type === 'STATUS_CHANGE' ? 'bg-blue-100 text-blue-700' :
                                                    log.log_type === 'CREATION' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                                }`}>
                                                    {log.log_type === 'MANUAL_UPDATE' ? 'NOTE' : 'STATUS'}
                                                </span>
                                                <span className="text-slate-700">{log.message}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {!isEditing && detailsModal.attachments && detailsModal.attachments.length > 0 && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                            <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><Paperclip size={16}/> Attachments</h4>
                            <div className="space-y-2">
                                {detailsModal.attachments.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white p-2 rounded border border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-slate-100 rounded text-slate-500">
                                                {file.type === 'image' ? <Eye size={14}/> : <FileText size={14}/>}
                                            </div>
                                            <span className="text-sm text-slate-700 truncate max-w-[200px]">{file.name}</span>
                                        </div>
                                        <a href={file.url} target="_blank" rel="noreferrer" className="text-xs bg-slate-100 hover:bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-medium border border-slate-200">
                                            View
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Legacy support for single attachment URL if new array is empty */}
                    {!isEditing && (!detailsModal.attachments || detailsModal.attachments.length === 0) && detailsModal.attachment_url && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-full text-slate-600"><FileText size={20}/></div>
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Order Attachment</p>
                                    <p className="text-xs text-slate-600 truncate max-w-[200px]">{detailsModal.attachment_name || "Document"}</p>
                                </div>
                            </div>
                            <a 
                                href={detailsModal.attachment_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-700"
                            >
                                <Download size={16}/> Download
                            </a>
                        </div>
                    )}

                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <h4 className="font-bold text-slate-700 flex justify-between">
                                <span>Order Breakdown</span>
                                {detailsModal.status === OrderStatus.COMPLETED && !isEditing && <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Displaying: Actual / Planned</span>}
                            </h4>
                            <button 
                                type="button"
                                onClick={() => setUseNumericSizes(!useNumericSizes)}
                                className="text-xs flex items-center gap-1 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-1 rounded border border-slate-200 transition-colors"
                            >
                                <ArrowLeftRight size={12}/> 
                                {useNumericSizes ? 'Switch to Letters (S-3XL)' : 'Switch to Numbers (65-90)'}
                            </button>
                        </div>
                        
                        <div className="border rounded-lg overflow-hidden overflow-x-auto">
                            <table className="w-full text-center text-sm">
                                <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                                    <tr>
                                        <th className="p-3 text-left">Color</th>
                                        {getHeaderLabels().map(h => <th key={h} className="p-3">{h}</th>)}
                                        <th className="p-3 font-bold bg-slate-200">Total</th>
                                        {isEditing && <th className="p-3 w-10"></th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {(isEditing ? editFormData.size_breakdown : detailsModal.size_breakdown)?.map((row, idx) => {
                                        if (isEditing) {
                                            return (
                                                <tr key={idx}>
                                                    <td className="p-2"><input className="w-24 border rounded p-1 bg-white text-slate-900" value={row.color} onChange={e => updateEditBreakdown(idx, 'color', e.target.value)} /></td>
                                                    <td className="p-2"><input type="number" className="w-20 border rounded p-2 text-base font-medium text-center bg-white text-slate-900" value={row.s} onChange={e => updateEditBreakdown(idx, 's', parseInt(e.target.value)||0)} /></td>
                                                    <td className="p-2"><input type="number" className="w-20 border rounded p-2 text-base font-medium text-center bg-white text-slate-900" value={row.m} onChange={e => updateEditBreakdown(idx, 'm', parseInt(e.target.value)||0)} /></td>
                                                    <td className="p-2"><input type="number" className="w-20 border rounded p-2 text-base font-medium text-center bg-white text-slate-900" value={row.l} onChange={e => updateEditBreakdown(idx, 'l', parseInt(e.target.value)||0)} /></td>
                                                    <td className="p-2"><input type="number" className="w-20 border rounded p-2 text-base font-medium text-center bg-white text-slate-900" value={row.xl} onChange={e => updateEditBreakdown(idx, 'xl', parseInt(e.target.value)||0)} /></td>
                                                    <td className="p-2"><input type="number" className="w-20 border rounded p-2 text-base font-medium text-center bg-white text-slate-900" value={row.xxl} onChange={e => updateEditBreakdown(idx, 'xxl', parseInt(e.target.value)||0)} /></td>
                                                    <td className="p-2"><input type="number" className="w-20 border rounded p-2 text-base font-medium text-center bg-white text-slate-900" value={row.xxxl} onChange={e => updateEditBreakdown(idx, 'xxxl', parseInt(e.target.value)||0)} /></td>
                                                    <td className="p-2 font-bold bg-slate-50">{getRowTotal(row)}</td>
                                                    <td className="p-2 text-center">
                                                        <button onClick={() => removeEditRow(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        // Read Only Mode
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 text-left font-medium text-slate-700">{row.color}</td>
                                                <td className="p-3">{renderDetailCell(detailsModal, idx, 's')}</td>
                                                <td className="p-3">{renderDetailCell(detailsModal, idx, 'm')}</td>
                                                <td className="p-3">{renderDetailCell(detailsModal, idx, 'l')}</td>
                                                <td className="p-3">{renderDetailCell(detailsModal, idx, 'xl')}</td>
                                                <td className="p-3">{renderDetailCell(detailsModal, idx, 'xxl')}</td>
                                                <td className="p-3">{renderDetailCell(detailsModal, idx, 'xxxl')}</td>
                                                <td className="p-3 font-bold bg-slate-50 text-slate-800">{getRowTotal(row)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {isEditing && (
                                <div className="p-2 bg-slate-50 border-t">
                                    <button onClick={addEditRow} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:text-indigo-800">
                                        <Plus size={16}/> Add Color Row
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Description & Box Count */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                             <h4 className="font-bold text-slate-700 mb-1">Description / Notes</h4>
                             {isEditing ? (
                                 <textarea 
                                    className="w-full border border-slate-300 rounded p-2 text-sm bg-white text-slate-900" 
                                    rows={3}
                                    value={editFormData.description}
                                    onChange={e => setEditFormData({...editFormData, description: e.target.value})}
                                 />
                             ) : (
                                <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded border border-slate-100">
                                    {detailsModal.description || "No specific instructions."}
                                </p>
                             )}
                        </div>
                        <div>
                             <h4 className="font-bold text-slate-700 mb-1">Box Count (Planned)</h4>
                             {isEditing ? (
                                 <input 
                                    type="number"
                                    className="w-full border border-slate-300 rounded p-2 bg-white text-slate-900"
                                    value={editFormData.box_count}
                                    onChange={e => setEditFormData({...editFormData, box_count: parseInt(e.target.value)||0})}
                                 />
                             ) : (
                                 <div className="p-3 bg-indigo-50 border border-indigo-100 rounded">
                                    <p className="text-xl font-mono text-indigo-700">{detailsModal.box_count || 0}</p>
                                 </div>
                             )}
                             
                             {detailsModal.status === OrderStatus.COMPLETED && !isEditing && (
                                 <div className="mt-4">
                                     <h4 className="font-bold text-green-700 mb-1">Actual Boxes</h4>
                                     <div className="p-3 bg-green-50 border border-green-100 rounded">
                                        <p className="text-xl font-mono text-green-700">{detailsModal.actual_box_count || 0}</p>
                                     </div>
                                 </div>
                             )}
                        </div>
                    </div>

                </div>
                
                {/* Footer */}
                <div className="p-4 border-t bg-slate-50 text-right flex justify-end gap-2">
                    {isEditing ? (
                        <>
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded font-medium">Cancel Edit</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2">
                                <Save size={16}/> Save Changes
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setDetailsModal(null)} className="bg-slate-800 text-white px-4 py-2 rounded font-medium hover:bg-slate-700">Close</button>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* New Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800">Create New Manufacturing Order</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                </div>
                
                <form onSubmit={handleCreateOrder} className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Basic Fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Style Number</label>
                            <input 
                                required 
                                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                                placeholder="e.g. ST-2024-001"
                                value={newOrder.style_number}
                                onChange={e => setNewOrder({...newOrder, style_number: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Assign Unit</label>
                            <select 
                                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                                value={newOrder.unit_id}
                                onChange={e => setNewOrder({...newOrder, unit_id: parseInt(e.target.value)})}
                            >
                                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Target Delivery</label>
                            <input 
                                required type="date"
                                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                                value={newOrder.target_delivery_date}
                                onChange={e => setNewOrder({...newOrder, target_delivery_date: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Planned Box Count</label>
                            <input 
                                type="number" min="0"
                                className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                                value={newOrder.box_count}
                                onChange={e => setNewOrder({...newOrder, box_count: parseInt(e.target.value)})}
                            />
                        </div>
                    </div>

                    {/* Breakdown Matrix Input */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-bold text-slate-700">Size Breakdown Matrix</label>
                            <div className="flex items-center gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setUseNumericSizes(!useNumericSizes)}
                                    className="text-xs flex items-center gap-1 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2 py-1 rounded border border-slate-200 transition-colors"
                                >
                                    <ArrowLeftRight size={12}/> 
                                    {useNumericSizes ? 'Switch to Letters (S-3XL)' : 'Switch to Numbers (65-90)'}
                                </button>
                                <span className="text-xs font-bold text-indigo-600">Total: {getTotalQuantity()} pcs</span>
                            </div>
                        </div>
                        <div className="border rounded-lg overflow-hidden bg-slate-50">
                            <table className="w-full text-center text-sm">
                                <thead className="bg-slate-200 text-slate-600 font-semibold">
                                    <tr>
                                        <th className="p-3 text-left min-w-[250px]">Color</th>
                                        {getHeaderLabels().map(h => <th key={h} className="p-3 w-32 text-base">{h}</th>)}
                                        <th className="p-3 w-24 text-base font-bold bg-slate-300 text-slate-800">Total</th>
                                        <th className="p-3 w-16"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {breakdown.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="p-2">
                                                <input 
                                                    placeholder="Color Name"
                                                    className="w-full border border-slate-300 rounded px-3 py-2 text-base bg-white text-slate-900"
                                                    value={row.color}
                                                    onChange={e => updateRow(idx, 'color', e.target.value)}
                                                />
                                            </td>
                                            {['s','m','l','xl','xxl','xxxl'].map(sz => (
                                                <td key={sz} className="p-2">
                                                    <input 
                                                        type="number" min="0" placeholder="0"
                                                        className="w-full border border-slate-300 rounded px-3 py-2 text-center text-lg font-bold bg-white text-slate-900"
                                                        value={(row as any)[sz] || ''}
                                                        onChange={e => updateRow(idx, sz as keyof SizeBreakdown, parseInt(e.target.value) || 0)}
                                                    />
                                                </td>
                                            ))}
                                            <td className="p-2 font-bold text-lg text-center bg-slate-100 text-indigo-700">
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
                            <button type="button" onClick={() => handleAddRow()} className="w-full py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 flex items-center justify-center gap-1">
                                <Plus size={16}/> Add Color Variant
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Description / Notes</label>
                        <textarea 
                            className="w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900"
                            rows={2}
                            value={newOrder.description}
                            onChange={e => setNewOrder({...newOrder, description: e.target.value})}
                        />
                    </div>

                    {/* File Upload */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Attachments (Optional)</label>
                        <div className="border border-dashed border-slate-300 rounded-lg p-4 text-center bg-slate-50 hover:bg-slate-100 transition cursor-pointer relative">
                            <input 
                                type="file" 
                                multiple
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => {
                                    if(e.target.files) setSelectedFiles(Array.from(e.target.files));
                                }}
                            />
                            <div className="flex flex-col items-center justify-center text-slate-500">
                                <Upload size={24} className="mb-2"/>
                                {selectedFiles.length > 0 ? (
                                    <div className="text-sm">
                                        <span className="font-bold text-indigo-600">{selectedFiles.length} files selected</span>
                                        <ul className="text-xs text-slate-400 mt-1">
                                            {selectedFiles.map((f, i) => <li key={i}>{f.name}</li>)}
                                        </ul>
                                    </div>
                                ) : (
                                    <span>Click to upload Spec Sheet / Images (Multiple allowed)</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t flex justify-end gap-3">
                        <button 
                            type="button" 
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isUploading}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-lg flex items-center gap-2 disabled:opacity-70"
                        >
                            {isUploading ? 'Uploading...' : 'Create Order'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

    </div>
  );
};

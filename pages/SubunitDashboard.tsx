
import React, { useEffect, useState, useMemo } from 'react';
import { fetchOrders, updateOrderStatus, generateBarcodes, createMaterialRequest, fetchMaterialRequests, uploadOrderAttachment, addOrderLog, fetchOrderLogs, updateMaterialRequest, deleteMaterialRequest, fetchFabricLots, addFabricLot, updateFabricLot, logFabricUsage, updateFabricLotPlan, fetchFabricLogs, updateFabricUsageLog, deleteFabricUsageLog } from '../services/db';
import { Order, OrderStatus, getNextOrderStatus, SizeBreakdown, MaterialRequest, OrderLog, Attachment, MaterialStatus, FabricLot, FabricUsageLog } from '../types';
import { StatusBadge, BulkActionToolbar } from '../components/Widgets';
import { ArrowRight, Printer, PackagePlus, Box, AlertTriangle, X, Eye, CheckCircle2, History, ListTodo, Archive, FileText, Download, Plus, Trash2, Paperclip, Calculator, Clock, MessageSquare, Send, Search, ArrowLeftRight, Minimize2, Maximize2, Pencil, Filter, ChevronRight, ChevronDown, ChevronUp, Layers, PenLine, RotateCcw, PlusCircle, ClipboardList } from 'lucide-react';

// Hardcoded ID for this specific Subunit Dashboard instance
const CURRENT_UNIT_ID = 2; // Sewing Unit A

interface MaterialRow {
    id: number;
    name: string;
    qtyPerPc: number;
    targetPcs: number; // The calculated quantity from matrix or manual
    targetLabel: string; // e.g. "All (150)" or "Custom (50)"
    requestQty: number; // For Direct Entry Mode
    unit: string;
    files: File[];
}

interface FabricColorRow {
    id: string;
    fabric_color: string;
    dia: string;
    roll_count: number;
    total_kg: number;
    plan_to: string;
}

export const SubunitDashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'fabric'>('active');
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
  const [expandedHistoryOrders, setExpandedHistoryOrders] = useState<string[]>([]);

  // Material Request Editing State
  const [isEditingRequest, setIsEditingRequest] = useState<{ id: string, originalData: MaterialRequest } | null>(null);
  const [isMaterialModalMinimized, setIsMaterialModalMinimized] = useState(false);

  // Completion Modal State
  const [completionModal, setCompletionModal] = useState<Order | null>(null);
  const [completionForm, setCompletionForm] = useState<{
      breakdown: SizeBreakdown[],
      actualBoxCount: number
  } | null>(null);

  // Fabric Management State
  const [fabricLots, setFabricLots] = useState<FabricLot[]>([]);
  const [fabricModalOpen, setFabricModalOpen] = useState(false);
  const [fabricUsageModalOpen, setFabricUsageModalOpen] = useState(false);
  const [selectedFabricLot, setSelectedFabricLot] = useState<FabricLot | null>(null);
  const [fabricLogs, setFabricLogs] = useState<FabricUsageLog[]>([]);
  const [showFabricHistory, setShowFabricHistory] = useState(false);
  const [editingFabricLotId, setEditingFabricLotId] = useState<number | null>(null);
  const [showFabricSummary, setShowFabricSummary] = useState(false);

  // Expanded sections for hierarchy
  const [expandedDCs, setExpandedDCs] = useState<string[]>([]);
  const [expandedLots, setExpandedLots] = useState<string[]>([]);

  const [fabricLotBase, setFabricLotBase] = useState({
      date: new Date().toISOString().split('T')[0],
      dc_no: '',
      source_from: '',
      lot_no: '',
      review_notes: ''
  });

  const [fabricColorRows, setFabricColorRows] = useState<FabricColorRow[]>([
      { id: Math.random().toString(), fabric_color: '', dia: '', roll_count: 0, total_kg: 0, plan_to: '' }
  ]);

  const [fabricUsageForm, setFabricUsageForm] = useState({
      usedKg: 0,
      orderRef: '',
      remarks: ''
  });

  // Size Header Toggle State (Now mainly for internal logic display, auto-set by order format)
  const [useNumericSizes, setUseNumericSizes] = useState(false);

  const [barcodeForm, setBarcodeForm] = useState({ qty: 0, size: 'M' });

  // --- NEW MATERIAL REQUEST STATE ---
  const [reqTab, setReqTab] = useState<'direct' | 'pcs'>('pcs');
  
  // Quantity Filter Modal State
  const [qtyFilterModal, setQtyFilterModal] = useState<{ isOpen: boolean, rowIndex: number | null }>({ isOpen: false, rowIndex: null });
  const [filterMode, setFilterMode] = useState<'matrix' | 'manual'>('matrix');
  const [selectedRows, setSelectedRows] = useState<number[]>([]); // Indices of rows selected
  const [selectedCols, setSelectedCols] = useState<string[]>([]); // Keys of sizes selected
  const [manualOverrideQty, setManualOverrideQty] = useState<number>(0);

  // Calculator Mode State (Rows)
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([
      { id: 1, name: '', qtyPerPc: 0, targetPcs: 0, targetLabel: 'None', requestQty: 0, unit: 'Nos', files: [] }
  ]);
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  const refreshOrders = () => {
    fetchOrders().then(data => {
        // Fetch all orders for this unit, we will filter by tab later
        const subunitOrders = data.filter(o => o.unit_id === CURRENT_UNIT_ID);
        setOrders(subunitOrders);
    });
  };

  const loadFabricData = async () => {
      const lots = await fetchFabricLots();
      setFabricLots(lots);
  }

  useEffect(() => {
    refreshOrders();
    if (activeTab === 'fabric') loadFabricData();
  }, [loading, activeTab]);

  // Hierarchical Grouping Logic for Fabric
  const fabricDCGroups = useMemo(() => {
      const groups: Record<string, { date: string, source: string, lots: Record<string, FabricLot[]> }> = {};
      fabricLots.forEach(lot => {
          if (!groups[lot.dc_no]) {
              groups[lot.dc_no] = { date: lot.date, source: lot.source_from, lots: {} };
          }
          if (!groups[lot.dc_no].lots[lot.lot_no]) {
              groups[lot.dc_no].lots[lot.lot_no] = [];
          }
          groups[lot.dc_no].lots[lot.lot_no].push(lot);
      });
      return groups;
  }, [fabricLots]);

  // Derived state for filtered orders
  const displayedOrders = orders.filter(o => {
      const matchesTab = activeTab === 'active' 
        ? o.status !== OrderStatus.COMPLETED 
        : o.status === OrderStatus.COMPLETED;
      
      const matchesSearch = 
        o.order_no.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.style_number.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesTab && matchesSearch;
  });

  const toggleDC = (dc: string) => {
      setExpandedDCs(prev => prev.includes(dc) ? prev.filter(d => d !== dc) : [...prev, dc]);
  };

  const toggleLot = (dc: string, lot: string) => {
      const key = `${dc}:${lot}`;
      setExpandedLots(prev => prev.includes(key) ? prev.filter(l => l !== key) : [...prev, key]);
  };

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

  // --- FABRIC HANDLERS ---
  const handleAddColorRow = () => {
      setFabricColorRows([...fabricColorRows, { id: Math.random().toString(), fabric_color: '', dia: '', roll_count: 0, total_kg: 0, plan_to: '' }]);
  };

  const handleRemoveColorRow = (id: string) => {
      if (fabricColorRows.length > 1) {
          setFabricColorRows(fabricColorRows.filter(r => r.id !== id));
      }
  };

  const handleUpdateColorRow = (id: string, field: keyof FabricColorRow, value: any) => {
      setFabricColorRows(fabricColorRows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSaveFabricLot = async (e: React.FormEvent) => {
      e.preventDefault();
      
      setLoading(true);
      if (editingFabricLotId) {
          const row = fabricColorRows[0];
          await updateFabricLot(editingFabricLotId, {
              ...fabricLotBase,
              fabric_color: row.fabric_color,
              dia: row.dia,
              roll_count: row.roll_count,
              total_kg: row.total_kg,
              plan_to: row.plan_to
          });
      } else {
          for (const row of fabricColorRows) {
              if (row.fabric_color && row.total_kg > 0) {
                  await addFabricLot({
                      ...fabricLotBase,
                      fabric_color: row.fabric_color,
                      dia: row.dia,
                      roll_count: row.roll_count,
                      total_kg: row.total_kg,
                      plan_to: row.plan_to
                  });
              }
          }
      }
      
      setLoading(false);
      handleCloseFabricModal();
      loadFabricData();
  };

  const handleEditFabricLot = (lot: FabricLot) => {
      setEditingFabricLotId(lot.id);
      setFabricLotBase({
          date: lot.date,
          dc_no: lot.dc_no,
          source_from: lot.source_from,
          lot_no: lot.lot_no,
          review_notes: lot.review_notes || ''
      });
      setFabricColorRows([{
          id: 'EDIT',
          fabric_color: lot.fabric_color,
          dia: lot.dia,
          roll_count: lot.roll_count,
          total_kg: lot.total_kg,
          plan_to: lot.plan_to
      }]);
      setFabricModalOpen(true);
  };

  const handleAddNewLotToDC = (dc: string, date: string, source: string) => {
      setFabricLotBase({
          date: date,
          dc_no: dc,
          source_from: source,
          lot_no: '',
          review_notes: ''
      });
      setFabricColorRows([
          { id: Math.random().toString(), fabric_color: '', dia: '', roll_count: 0, total_kg: 0, plan_to: '' }
      ]);
      setFabricModalOpen(true);
  };

  const handleCloseFabricModal = () => {
      setFabricModalOpen(false);
      setEditingFabricLotId(null);
      setFabricLotBase({
        date: new Date().toISOString().split('T')[0],
        dc_no: '',
        source_from: '',
        lot_no: '',
        review_notes: ''
      });
      setFabricColorRows([
          { id: Math.random().toString(), fabric_color: '', dia: '', roll_count: 0, total_kg: 0, plan_to: '' }
      ]);
  };

  const handleOpenUsageModal = (lot: FabricLot) => {
      setSelectedFabricLot(lot);
      setFabricUsageForm({ usedKg: 0, orderRef: '', remarks: '' });
      setFabricUsageModalOpen(true);
  };

  const handleSubmitUsage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedFabricLot) return;

      if (fabricUsageForm.usedKg <= 0) {
          alert("Used quantity must be greater than 0");
          return;
      }

      const currentBalance = selectedFabricLot.balance_fabric ?? selectedFabricLot.total_kg;
      if (fabricUsageForm.usedKg > currentBalance) {
          alert(`Cannot use ${fabricUsageForm.usedKg} KG. Only ${currentBalance} KG available.`);
          return;
      }

      await logFabricUsage(selectedFabricLot.id, fabricUsageForm.usedKg, fabricUsageForm.orderRef, fabricUsageForm.remarks);
      setFabricUsageModalOpen(false);
      loadFabricData();
  };

  const handleUpdatePlan = async (lotId: number, newPlan: string) => {
      await updateFabricLotPlan(lotId, newPlan);
      loadFabricData();
  };

  const handleViewFabricHistory = async (lot: FabricLot) => {
      setSelectedFabricLot(lot);
      const logs = await fetchFabricLogs(lot.id);
      setFabricLogs(logs);
      setShowFabricHistory(true);
  };

  const handleCorrectUsageEntry = async (log: FabricUsageLog) => {
      const newQty = prompt("Enter CORRECTED Used Quantity (KG):", log.used_kg.toString());
      if (newQty === null) return;
      const parsedQty = parseFloat(newQty);
      if (isNaN(parsedQty) || parsedQty < 0) return alert("Invalid Quantity");

      await updateFabricUsageLog(log.id, parsedQty, `Corrected from ${log.used_kg} by Unit Head`);
      if (selectedFabricLot) handleViewFabricHistory(selectedFabricLot);
      loadFabricData();
  };

  const handleDeleteUsageEntry = async (log: FabricUsageLog) => {
      if (!confirm("Are you sure you want to delete this usage entry? The quantity will be added back to stock.")) return;
      await deleteFabricUsageLog(log.id);
      if (selectedFabricLot) handleViewFabricHistory(selectedFabricLot);
      loadFabricData();
  };

  // --- PRINTING UTILS ---
  const handlePrintStockSummary = () => {
      const rows = fabricLots.map(lot => `
        <tr>
            <td>${lot.date}</td>
            <td>${lot.dc_no}</td>
            <td>${lot.lot_no}</td>
            <td>${lot.fabric_color}</td>
            <td>${lot.dia}</td>
            <td>${lot.roll_count}</td>
            <td style="text-align:right;">${lot.total_kg.toFixed(2)}</td>
            <td style="text-align:right; font-weight:bold;">${(lot.balance_fabric ?? lot.total_kg).toFixed(2)}</td>
        </tr>
      `).join('');

      const win = window.open('', 'StockReport', 'width=1000,height=800');
      if (win) {
          win.document.write(`
            <html>
            <head>
                <title>Stock Report</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; font-size: 12px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background: #f4f4f4; padding: 8px; border: 1px solid #333; text-align: left; }
                    td { padding: 6px; border: 1px solid #ccc; }
                    .header { text-align: center; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="header"><h1>TINTURA SST - FABRIC INVENTORY</h1><p>Generated: ${new Date().toLocaleString()}</p></div>
                <table><thead><tr><th>Date</th><th>DC No</th><th>Lot No</th><th>Color</th><th>Dia</th><th>Rolls</th><th>Init KG</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table>
                <script>window.print(); setTimeout(() => window.close(), 1000);</script>
            </body>
            </html>
          `);
          win.document.close();
      }
  };

  // --- TAB RENDERING ---
  const renderFabricTab = () => {
      return (
          <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900">Fabric Management (Clubbed View)</h3>
                  <div className="flex gap-2">
                      <button onClick={handlePrintStockSummary} className="bg-white border border-slate-300 text-slate-900 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50 shadow-sm"><ClipboardList size={18}/> Stock Summary</button>
                      <button onClick={() => setFabricModalOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 shadow-sm"><PlusCircle size={18}/> New Fabric Batch</button>
                  </div>
              </div>

              <div className="space-y-3">
                  {Object.entries(fabricDCGroups).map(([dcNo, rawInfo]) => {
                      // Fix: Explicitly cast dcInfo to access properties on a known type instead of 'unknown'.
                      const dcInfo = rawInfo as { date: string, source: string, lots: Record<string, FabricLot[]> };
                      const isDCExpanded = expandedDCs.includes(dcNo);
                      // Fix: Explicitly cast Object.values to FabricLot[][] and provide types for reducers to avoid 'unknown' errors.
                      const allDCLots = (Object.values(dcInfo.lots) as FabricLot[][]).flat();
                      const dcTotalRolls = allDCLots.reduce((a: number, b: FabricLot) => a + (b.roll_count || 0), 0);
                      const dcTotalWeight = allDCLots.reduce((a: number, b: FabricLot) => a + (b.total_kg || 0), 0);
                      const dcTotalBalance = allDCLots.reduce((a: number, b: FabricLot) => a + (b.balance_fabric ?? b.total_kg ?? 0), 0);

                      return (
                          <div key={dcNo} className="bg-white rounded-xl shadow-sm border border-slate-300 overflow-hidden">
                              {/* DC LEVEL ROW */}
                              <div onClick={() => toggleDC(dcNo)} className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isDCExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-800'}`}>
                                  <div className="flex items-center gap-4">
                                      {isDCExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}
                                      <div>
                                          <div className="text-[10px] font-bold uppercase opacity-60">DC Number</div>
                                          <div className="text-lg font-bold tracking-tight">{dcNo}</div>
                                      </div>
                                      <div className="hidden md:block border-l border-current/20 pl-4">
                                          <div className="text-[10px] font-bold uppercase opacity-60">Arrival Date</div>
                                          <div className="text-sm font-medium">{dcInfo.date}</div>
                                      </div>
                                      <div className="hidden lg:block border-l border-current/20 pl-4">
                                          <div className="text-[10px] font-bold uppercase opacity-60">Supplier / Source</div>
                                          <div className="text-sm font-medium">{dcInfo.source}</div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-8">
                                      <div className="text-right">
                                          <div className="text-[10px] font-bold uppercase opacity-60">Total Rolls</div>
                                          <div className="text-lg font-bold">{dcTotalRolls}</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="text-[10px] font-bold uppercase opacity-60">Total Weight</div>
                                          <div className="text-lg font-bold font-mono">{dcTotalWeight.toFixed(2)} KG</div>
                                      </div>
                                      <div className="text-right">
                                          <div className="text-[10px] font-bold uppercase opacity-60">DC Balance</div>
                                          <div className={`text-xl font-black font-mono ${isDCExpanded ? 'text-white' : 'text-indigo-600'}`}>
                                              {dcTotalBalance.toFixed(2)} KG
                                          </div>
                                      </div>
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); handleAddNewLotToDC(dcNo, dcInfo.date, dcInfo.source); }}
                                          className={`px-3 py-1.5 rounded-lg border font-bold text-xs flex items-center gap-1 transition-all active:scale-95 ${isDCExpanded ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-white border-indigo-200 text-indigo-700 shadow-sm hover:bg-indigo-50'}`}
                                      >
                                          <Plus size={14}/> Add New Lot
                                      </button>
                                  </div>
                              </div>

                              {/* LOT LEVEL ROWS */}
                              {isDCExpanded && (
                                  <div className="bg-slate-100 p-2 space-y-2">
                                      {Object.entries(dcInfo.lots).map(([lotNo, rawColors]) => {
                                          // Fix: Explicitly cast colors to FabricLot[] and provide types for reducers.
                                          const colors = rawColors as FabricLot[];
                                          const lotKey = `${dcNo}:${lotNo}`;
                                          const isLotExpanded = expandedLots.includes(lotKey);
                                          const lotTotalRolls = colors.reduce((a: number, b: FabricLot) => a + (b.roll_count || 0), 0);
                                          const lotTotalWeight = colors.reduce((a: number, b: FabricLot) => a + (b.total_kg || 0), 0);
                                          const lotTotalBalance = colors.reduce((a: number, b: FabricLot) => a + (b.balance_fabric ?? b.total_kg ?? 0), 0);

                                          return (
                                              <div key={lotNo} className="ml-4 bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                                  <div onClick={() => toggleLot(dcNo, lotNo)} className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isLotExpanded ? 'bg-slate-700 text-white' : 'bg-white hover:bg-slate-50 text-slate-700'}`}>
                                                      <div className="flex items-center gap-3">
                                                          {isLotExpanded ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                                                          <div>
                                                              <div className="text-[9px] font-bold uppercase opacity-60">Lot Number</div>
                                                              <div className="font-bold">{lotNo}</div>
                                                          </div>
                                                      </div>
                                                      <div className="flex gap-6 items-center">
                                                          <div className="text-right">
                                                              <div className="text-[9px] font-bold uppercase opacity-60">Lot Rolls</div>
                                                              <div className="text-sm font-bold">{lotTotalRolls}</div>
                                                          </div>
                                                          <div className="text-right">
                                                              <div className="text-[9px] font-bold uppercase opacity-60">Lot Balance</div>
                                                              <div className="text-base font-bold font-mono">{lotTotalBalance.toFixed(2)} KG</div>
                                                          </div>
                                                      </div>
                                                  </div>

                                                  {/* COLOR LEVEL BREAKDOWN */}
                                                  {isLotExpanded && (
                                                      <div className="border-t">
                                                          <table className="w-full text-left text-xs">
                                                              <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
                                                                  <tr>
                                                                      <th className="p-3 pl-12">Fabric Color</th>
                                                                      <th className="p-3">DIA</th>
                                                                      <th className="p-3 text-center">Rolls</th>
                                                                      <th className="p-3 text-right">Init KG</th>
                                                                      <th className="p-3 text-right font-bold text-indigo-600">Balance (KG)</th>
                                                                      <th className="p-3">Plan To</th>
                                                                      <th className="p-3 text-right pr-6">Actions</th>
                                                                  </tr>
                                                              </thead>
                                                              <tbody className="divide-y divide-slate-100 bg-white">
                                                                  {/* Fix: Explicitly casting the colors above as FabricLot[] ensures map properties are correctly resolved. */}
                                                                  {colors.map(color => {
                                                                      const balance = color.balance_fabric ?? color.total_kg;
                                                                      return (
                                                                          <tr key={color.id} className="hover:bg-slate-50">
                                                                              <td className="p-3 pl-12 font-bold text-slate-800">{color.fabric_color}</td>
                                                                              <td className="p-3 font-medium text-slate-600">{color.dia || '---'}</td>
                                                                              <td className="p-3 text-center font-bold text-slate-600">{color.roll_count}</td>
                                                                              <td className="p-3 text-right font-mono text-slate-400">{color.total_kg.toFixed(2)}</td>
                                                                              <td className="p-3 text-right font-mono font-bold text-indigo-700">{balance.toFixed(2)}</td>
                                                                              <td className="p-3">
                                                                                  <div className="flex items-center gap-1">
                                                                                      <span className="text-slate-500 italic truncate max-w-[150px]">{color.plan_to || '---'}</span>
                                                                                      <button onClick={() => { const p = prompt("Update Planning:", color.plan_to); if(p!==null) handleUpdatePlan(color.id, p); }} className="text-indigo-400 hover:text-indigo-600"><PenLine size={12}/></button>
                                                                                  </div>
                                                                              </td>
                                                                              <td className="p-3 text-right pr-6 flex justify-end gap-1">
                                                                                  <button onClick={() => handleEditFabricLot(color)} className="p-1 hover:bg-slate-200 rounded transition text-slate-400 hover:text-indigo-600"><Pencil size={14}/></button>
                                                                                  <button onClick={() => handleOpenUsageModal(color)} className="bg-indigo-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm hover:bg-indigo-700">Usage</button>
                                                                                  <button onClick={() => handleViewFabricHistory(color)} className="p-1 hover:bg-slate-200 rounded transition text-slate-400 hover:text-indigo-600"><History size={16}/></button>
                                                                              </td>
                                                                          </tr>
                                                                      )
                                                                  })}
                                                              </tbody>
                                                          </table>
                                                      </div>
                                                  )}
                                              </div>
                                          )
                                      })}
                                  </div>
                              )}
                          </div>
                      )
                  })}
              </div>
          </div>
      );
  };

  // --- Timeline & Modal Rendering ---
  const openTimeline = (orderId: string, orderNo: string) => {
      setTimelineModal({ orderId, orderNo });
      setTimelineLogs([]); // Clear logs temporarily
      setStatusUpdateText("");
      fetchOrderLogs(orderId).then(logs => { setTimelineLogs(logs); });
  };

  const submitManualStatusUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!timelineModal || !statusUpdateText.trim()) return;
      await addOrderLog(timelineModal.orderId, 'MANUAL_UPDATE', statusUpdateText);
      const logs = await fetchOrderLogs(timelineModal.orderId);
      setTimelineLogs(logs);
      setStatusUpdateText("");
  };

  const openCompletionModal = (order: Order) => {
      setUseNumericSizes(order.size_format === 'numeric');
      const initialBreakdown = order.size_breakdown 
        ? order.size_breakdown.map(r => ({ color: r.color, s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }))
        : [{ color: 'Standard', s: 0, m: 0, l: 0, xl: 0, xxl: 0, xxxl: 0 }];
      setCompletionForm({ breakdown: initialBreakdown, actualBoxCount: 0 });
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
      await updateOrderStatus(completionModal.id, OrderStatus.COMPLETED, undefined, { completion_breakdown: completionForm.breakdown, actual_box_count: completionForm.actualBoxCount });
      setCompletionModal(null);
      setCompletionForm(null);
      setLoading(false);
      refreshOrders();
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
            <div className="relative w-full md:w-64">
                <input type="text" placeholder="Search..." className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white text-slate-900 shadow-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            </div>

            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex">
                <button onClick={() => setActiveTab('active')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'active' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><ListTodo size={16}/> Active</button>
                <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><History size={16}/> History</button>
                <button onClick={() => setActiveTab('fabric')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'fabric' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Layers size={16}/> Fabric</button>
            </div>
        </div>
      </div>
      
      {activeTab === 'fabric' ? renderFabricTab() : (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {displayedOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400"><p className="text-lg font-semibold">{searchTerm ? 'No orders match search.' : (activeTab === 'active' ? 'No active orders assigned.' : 'No completed history yet.')}</p></div>
        ) : (
            <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase"><tr><th className="p-4 w-10"></th><th className="p-4">Order</th><th className="p-4">Details</th><th className="p-4">Progress</th><th className="p-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
                {displayedOrders.map(order => {
                    const canAdvance = order.status !== OrderStatus.QC && order.status !== OrderStatus.COMPLETED;
                    const isReadyToComplete = order.status === OrderStatus.QC_APPROVED;
                    const isCompleted = order.status === OrderStatus.COMPLETED;
                    return (
                        <tr key={order.id} className={`hover:bg-slate-50 ${selectedOrders.includes(order.id) ? 'bg-indigo-50' : ''}`}>
                            <td className="p-4">{!isCompleted && (<input type="checkbox" disabled={!canAdvance || isReadyToComplete} checked={selectedOrders.includes(order.id)} onChange={() => toggleSelect(order.id)} className="w-4 h-4 text-indigo-600 rounded disabled:opacity-50"/>)}</td>
                            <td className="p-4"><div className="font-bold text-slate-700">{order.order_no}</div><div className="text-xs text-slate-500">{order.target_delivery_date}</div></td>
                            <td className="p-4"><div className="text-sm font-medium">{order.style_number}</div><div className="text-xs text-slate-500">{order.quantity} pcs</div></td>
                            <td className="p-4"><StatusBadge status={order.status} /></td>
                            <td className="p-4 text-right flex justify-end gap-2 items-center flex-wrap">
                                <button onClick={() => setDetailsModal(order)} className="text-xs bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded inline-flex items-center gap-1 border border-slate-200 shadow-sm"><Eye size={14}/> Details</button>
                                {!isCompleted && (
                                    <>
                                        <button onClick={() => openTimeline(order.id, order.order_no)} className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-600 px-3 py-1.5 rounded inline-flex items-center gap-1 border border-teal-100"><Clock size={14}/> Timeline</button>
                                        {canAdvance && (<button onClick={() => handleSingleStatusUpdate(order.id, order.status)} className={`text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 shadow-sm font-bold text-white ${isReadyToComplete ? 'bg-green-600 hover:bg-green-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{isReadyToComplete ? (<><CheckCircle2 size={14} /><span>Complete Order</span></>) : (<><span>Next</span><ArrowRight size={14} /></>)}</button>)}
                                    </>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
            </table>
        )}
      </div>
      )}

      {/* FABRIC ENTRY MODAL */}
      {fabricModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-scale-up">
                  <div className="p-6 border-b flex justify-between items-center bg-indigo-50">
                      <h3 className="text-xl font-bold text-indigo-900">{editingFabricLotId ? 'Edit Fabric Lot' : 'Register Fabric Batch (Multi-Color)'}</h3>
                      <button onClick={handleCloseFabricModal} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>
                  <form onSubmit={handleSaveFabricLot} className="p-6 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Arrival Date</label>
                              <input required type="date" className="w-full border border-slate-300 rounded p-2 bg-white text-black font-bold" value={fabricLotBase.date} onChange={e => setFabricLotBase({...fabricLotBase, date: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">DC Number</label>
                              <input required className="w-full border border-slate-300 rounded p-2 bg-white text-black font-black uppercase" value={fabricLotBase.dc_no} onChange={e => setFabricLotBase({...fabricLotBase, dc_no: e.target.value.toUpperCase()})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Source / Supplier</label>
                              <input required className="w-full border border-slate-300 rounded p-2 bg-white text-black" value={fabricLotBase.source_from} onChange={e => setFabricLotBase({...fabricLotBase, source_from: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lot Number</label>
                              <input required className="w-full border border-slate-300 rounded p-2 bg-white text-black font-black uppercase" value={fabricLotBase.lot_no} onChange={e => setFabricLotBase({...fabricLotBase, lot_no: e.target.value.toUpperCase()})} />
                          </div>
                      </div>

                      <div className="space-y-3">
                          <div className="flex justify-between items-center px-1">
                              <h4 className="text-sm font-bold text-slate-700 uppercase">Fabric Colors Inside Lot: {fabricLotBase.lot_no || '---'}</h4>
                              {!editingFabricLotId && <button type="button" onClick={handleAddColorRow} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shadow-sm"><PlusCircle size={14}/> Add Color</button>}
                          </div>
                          <div className="border rounded-xl overflow-hidden shadow-sm">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                                      <tr><th className="p-3">Fabric Color</th><th className="p-3 w-24">DIA</th><th className="p-3 w-24 text-center">Rolls</th><th className="p-3 w-32 text-center">Initial Weight (KG)</th><th className="p-3">Plan To</th>{!editingFabricLotId && <th className="p-3 w-10"></th>}</tr>
                                  </thead>
                                  <tbody className="divide-y bg-white">
                                      {fabricColorRows.map(row => (
                                          <tr key={row.id}>
                                              <td className="p-2"><input required placeholder="e.g. Navy Blue" className="w-full border rounded p-2 bg-white text-black font-bold focus:ring-1 focus:ring-indigo-500 outline-none" value={row.fabric_color} onChange={e => handleUpdateColorRow(row.id, 'fabric_color', e.target.value)} /></td>
                                              <td className="p-2"><input placeholder="34/36" className="w-full border rounded p-2 bg-white text-black" value={row.dia} onChange={e => handleUpdateColorRow(row.id, 'dia', e.target.value)} /></td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-2 text-center bg-white text-black font-bold" value={row.roll_count} onChange={e => handleUpdateColorRow(row.id, 'roll_count', parseInt(e.target.value)||0)} /></td>
                                              <td className="p-2"><input required type="number" step="0.01" placeholder="0.00" className="w-full border rounded p-2 text-center font-black bg-indigo-50/50 text-indigo-900" value={row.total_kg} onChange={e => handleUpdateColorRow(row.id, 'total_kg', parseFloat(e.target.value)||0)} /></td>
                                              <td className="p-2"><input placeholder="Planned Order Ref" className="w-full border rounded p-2 bg-white text-black text-xs" value={row.plan_to} onChange={e => handleUpdateColorRow(row.id, 'plan_to', e.target.value)} /></td>
                                              {!editingFabricLotId && (<td className="p-2">{fabricColorRows.length > 1 && (<button type="button" onClick={() => handleRemoveColorRow(row.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>)}</td>)}
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>

                      <div className="pt-4 border-t flex justify-end gap-3 bg-slate-50 -m-6 p-6">
                          <button type="button" onClick={handleCloseFabricModal} className="px-6 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-bold">Cancel</button>
                          <button type="submit" disabled={loading} className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-50 tracking-wide uppercase text-sm">{loading ? 'Processing...' : (editingFabricLotId ? 'Update Record' : 'Save Batch Entry')}</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* FABRIC HISTORY MODAL WITH CORRECTION */}
      {showFabricHistory && selectedFabricLot && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden h-[80vh] flex flex-col">
                  <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                      <div>
                          <h3 className="text-xl font-bold text-slate-800">Usage History & Correction</h3>
                          <p className="text-xs text-slate-500 uppercase font-black tracking-tight">Lot: {selectedFabricLot.lot_no} | {selectedFabricLot.fabric_color}</p>
                      </div>
                      <button onClick={() => setShowFabricHistory(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-800 uppercase text-[9px] font-black sticky top-0 border-b border-slate-200">
                              <tr><th className="p-3">Timestamp</th><th className="p-3">Ref / Reason</th><th className="p-3 text-center">Used (KG)</th><th className="p-3 text-right">Correct</th></tr>
                          </thead>
                          <tbody className="divide-y">
                              {fabricLogs.map(log => (
                                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="p-3 text-[10px] text-slate-500 whitespace-nowrap">{new Date(log.date_time).toLocaleString()}</td>
                                      <td className="p-3">
                                          <div className="font-bold text-black uppercase tracking-tighter">{log.order_style_ref}</div>
                                          {log.remarks && <div className="text-[10px] text-slate-400 italic">{log.remarks}</div>}
                                      </td>
                                      <td className="p-3 text-center font-mono text-red-600 font-bold">-{log.used_kg.toFixed(2)}</td>
                                      <td className="p-3 text-right pr-4">
                                          <div className="flex justify-end gap-1">
                                              <button onClick={() => handleCorrectUsageEntry(log)} className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded" title="Edit Entry"><Pencil size={14}/></button>
                                              <button onClick={() => handleDeleteUsageEntry(log)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded" title="Delete Entry"><Trash2 size={14}/></button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                              {fabricLogs.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-medium">No usage records found.</td></tr>}
                          </tbody>
                      </table>
                  </div>
                  <div className="p-4 border-t bg-emerald-50/50 flex justify-between items-center">
                      <div className="text-sm font-bold text-slate-700 uppercase tracking-widest">Available Balance: <span className="font-black text-emerald-600 ml-1">{selectedFabricLot.balance_fabric?.toFixed(2)} KG</span></div>
                      <button onClick={() => setShowFabricHistory(false)} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-slate-900">Close</button>
                  </div>
              </div>
          </div>
      )}

      {/* FABRIC USAGE MODAL */}
      {fabricUsageModalOpen && selectedFabricLot && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
                  <div className="p-6 border-b bg-indigo-50">
                      <h3 className="text-xl font-bold text-indigo-900">Issue Fabric Weight</h3>
                      <p className="text-xs text-indigo-600 font-black uppercase">Color: {selectedFabricLot.fabric_color} | Lot: {selectedFabricLot.lot_no}</p>
                  </div>
                  <form onSubmit={handleSubmitUsage} className="p-6 space-y-4">
                      <div>
                          <label className="block text-xs font-black text-slate-500 uppercase mb-1">Used Weight (KG)</label>
                          <input required type="number" step="0.01" autoFocus className="w-full border-b-4 border-indigo-500 text-5xl font-mono focus:outline-none py-1 bg-white text-black" value={fabricUsageForm.usedKg} onChange={e => setFabricUsageForm({...fabricUsageForm, usedKg: parseFloat(e.target.value) || 0})} />
                      </div>
                      <div>
                          <label className="block text-xs font-black text-slate-500 uppercase mb-1">Issue to Order / Process</label>
                          <select className="w-full border-2 border-slate-200 rounded-lg p-3 bg-white text-black font-bold focus:ring-2 focus:ring-indigo-500 outline-none" value={fabricUsageForm.orderRef} onChange={e => setFabricUsageForm({...fabricUsageForm, orderRef: e.target.value})} required>
                              <option value="">-- Select Target Order --</option>
                              {orders.filter(o => o.status !== OrderStatus.COMPLETED).map(o => (
                                  <option key={o.id} value={`${o.order_no} (${o.style_number})`}>{o.order_no} - {o.style_number}</option>
                              ))}
                              <option value="SAMPLING">Internal Sampling</option>
                              <option value="WASTE">Cutting Waste / Scraps</option>
                          </select>
                      </div>
                      <div className="pt-4 border-t flex justify-end gap-2">
                          <button type="button" onClick={() => setFabricUsageModalOpen(false)} className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg font-bold">Cancel</button>
                          <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-black tracking-widest uppercase text-sm shadow-xl transition-all active:scale-95">Confirm Usage</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Details Modal (Preserved) */}
      {detailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800">{detailsModal.order_no}</h3>
                    <button onClick={() => setDetailsModal(null)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-3 bg-slate-50 rounded border border-slate-100"><span className="block text-slate-500 text-xs uppercase font-bold">Style Number</span><span className="text-lg font-bold text-slate-800">{detailsModal.style_number}</span></div>
                        <div className="p-3 bg-slate-50 rounded border border-slate-100"><span className="block text-slate-500 text-xs uppercase font-bold">Delivery Date</span><span className="text-lg font-bold text-slate-800">{detailsModal.target_delivery_date}</span></div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-slate-700">Order Breakdown</h4></div>
                        <div className="border rounded-lg overflow-hidden overflow-x-auto">
                            <table className="w-full text-center text-sm">
                                <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                                    <tr><th className="p-3 text-left">Color</th>{getHeaderLabels().map(h => <th key={h} className="p-3">{h}</th>)}<th className="p-3 font-bold bg-slate-200">Total</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {detailsModal.size_breakdown?.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 text-left font-medium text-slate-700">{row.color}</td>
                                            <td className="p-3">{(detailsModal.completion_breakdown?.[idx] as any)?.s ?? row.s}</td>
                                            <td className="p-3">{(detailsModal.completion_breakdown?.[idx] as any)?.m ?? row.m}</td>
                                            <td className="p-3">{(detailsModal.completion_breakdown?.[idx] as any)?.l ?? row.l}</td>
                                            <td className="p-3">{(detailsModal.completion_breakdown?.[idx] as any)?.xl ?? row.xl}</td>
                                            <td className="p-3">{(detailsModal.completion_breakdown?.[idx] as any)?.xxl ?? row.xxl}</td>
                                            <td className="p-3">{(detailsModal.completion_breakdown?.[idx] as any)?.xxxl ?? row.xxxl}</td>
                                            <td className="p-3 font-bold bg-slate-50 text-slate-800">{(row.s||0)+(row.m||0)+(row.l||0)+(row.xl||0)+(row.xxl||0)+(row.xxxl||0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t bg-slate-50 text-right flex justify-end gap-2">
                    <button onClick={() => setDetailsModal(null)} className="bg-slate-800 text-white px-4 py-2 rounded font-medium hover:bg-slate-700">Close</button>
                </div>
            </div>
        </div>
      )}

      {completionModal && completionForm && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col animate-scale-up">
                  <div className="p-6 border-b flex justify-between items-center bg-green-50">
                      <h3 className="text-xl font-bold text-green-900 flex items-center gap-2"><CheckCircle2/> Complete Order: {completionModal.order_no}</h3>
                      <button onClick={() => setCompletionModal(null)} className="text-green-700 hover:text-green-900"><X size={24}/></button>
                  </div>
                  <form onSubmit={handleCompleteOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-sm text-yellow-800 flex items-center gap-2"><AlertTriangle size={18}/>Please enter the <strong>ACTUAL</strong> quantities produced. This will be recorded as the final output.</div>
                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Actual Box Count</label>
                          <input type="number" required min="0" className="w-32 border border-slate-300 rounded p-2 text-lg font-bold bg-white text-slate-900" value={completionForm.actualBoxCount} onChange={e => setCompletionForm({...completionForm, actualBoxCount: parseInt(e.target.value) || 0})}/>
                      </div>
                      <div>
                          <div className="border rounded-lg overflow-hidden overflow-x-auto">
                              <table className="w-full text-center text-sm">
                                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                                      <tr><th className="p-3 text-left">Color</th>{getHeaderLabels().map(h => <th key={h} className="p-3 w-20">{h}</th>)}</tr>
                                  </thead>
                                  <tbody className="divide-y">
                                      {completionForm.breakdown.map((row, idx) => (
                                          <tr key={idx}>
                                              <td className="p-3 text-left font-medium text-slate-700">{row.color}</td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-1 text-center bg-white text-slate-900" value={row.s} onChange={e => updateCompletionRow(idx, 's', parseInt(e.target.value)||0)} /></td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-1 text-center bg-white text-slate-900" value={row.m} onChange={e => updateCompletionRow(idx, 'm', parseInt(e.target.value)||0)} /></td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-1 text-center bg-white text-slate-900" value={row.l} onChange={e => updateCompletionRow(idx, 'l', parseInt(e.target.value)||0)} /></td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-1 text-center bg-white text-slate-900" value={row.xl} onChange={e => updateCompletionRow(idx, 'xl', parseInt(e.target.value)||0)} /></td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-1 text-center bg-white text-slate-900" value={row.xxl} onChange={e => updateCompletionRow(idx, 'xxl', parseInt(e.target.value)||0)} /></td>
                                              <td className="p-2"><input type="number" className="w-full border rounded p-1 text-center bg-white text-slate-900" value={row.xxxl} onChange={e => updateCompletionRow(idx, 'xxxl', parseInt(e.target.value)||0)} /></td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t">
                          <button type="button" onClick={() => setCompletionModal(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                          <button type="submit" className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md">Confirm Completion</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {timelineModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Clock size={18}/> Order Timeline: {timelineModal.orderNo}</h3><button onClick={() => setTimelineModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button></div>
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">{timelineLogs.length === 0 ? (<div className="text-center text-slate-400 text-sm">No activity logs found.</div>) : (<div className="space-y-6 relative">{timelineLogs.map((log) => (<div key={log.id} className="relative flex items-center justify-between"><div className="w-[calc(100%-4rem)] bg-white p-4 rounded-xl border border-slate-100 shadow-sm"><div className="flex items-center justify-between space-x-2 mb-1"><div className="font-bold text-slate-900 text-sm">{log.log_type.replace(/_/g, ' ')}</div><time className="font-mono text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</time></div><div className="text-slate-600 text-sm">{log.message}</div></div></div>))}</div>)}</div>
                  <div className="p-4 bg-white border-t"><form onSubmit={submitManualStatusUpdate} className="flex gap-2"><input type="text" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900" placeholder="Type a progress update..." value={statusUpdateText} onChange={e => setStatusUpdateText(e.target.value)}/><button type="submit" disabled={!statusUpdateText.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Send size={16}/></button></form></div>
              </div>
          </div>
      )}
    </div>
  );
};

const getHeaderLabels = () => ['S', 'M', 'L', 'XL', 'XXL', '3XL'];

import React, { useEffect, useState, useRef } from 'react';
import { fetchBarcodes, bulkUpdateBarcodeStatusBySerial, fetchBarcodesBySerialList } from '../services/db';
import { Barcode, BarcodeStatus } from '../types';
import { Boxes, ScanLine, Save, Trash2, CheckCircle2, AlertTriangle, XOctagon, X, Search } from 'lucide-react';

interface StagedItem {
    serial: string;
    style: string;
    size: string;
    status: 'READY' | 'EXISTS' | 'ERROR' | 'DUPLICATE_SCAN';
    message: string;
}

interface ReportData {
    success: StagedItem[];
    skipped: StagedItem[];
    errors: StagedItem[];
}

export const InventoryDashboard: React.FC = () => {
    // Inventory State
    const [inventory, setInventory] = useState<Barcode[]>([]);
    
    // Staging State
    const [scanInput, setScanInput] = useState("");
    const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Report Modal State
    const [reportData, setReportData] = useState<ReportData | null>(null);

    // Load actual inventory
    const loadInventory = () => fetchBarcodes(BarcodeStatus.COMMITTED_TO_STOCK).then(setInventory);
    useEffect(() => { loadInventory(); }, []);

    // Focus input on load and after actions
    useEffect(() => {
        inputRef.current?.focus();
    }, [stagedItems, reportData]);

    const handleScan = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const serial = scanInput.trim();
            if (!serial) return;

            // 1. Check if already in staging buffer
            if (stagedItems.find(i => i.serial === serial)) {
                setStagedItems(prev => [{
                    serial,
                    style: '---',
                    size: '---',
                    status: 'DUPLICATE_SCAN',
                    message: 'Already in list below'
                }, ...prev]);
                setScanInput("");
                return;
            }

            // 2. Lookup in DB
            const results = await fetchBarcodesBySerialList([serial]);
            const match = results[0];

            let newItem: StagedItem;

            if (!match) {
                newItem = {
                    serial,
                    style: 'Unknown',
                    size: '?',
                    status: 'ERROR',
                    message: 'Barcode not found in system'
                };
            } else {
                // Check status
                if (match.status === BarcodeStatus.COMMITTED_TO_STOCK || match.status === BarcodeStatus.SOLD) {
                    newItem = {
                        serial,
                        style: match.style_number,
                        size: match.size || 'N/A',
                        status: 'EXISTS',
                        message: 'Already in inventory/Sold'
                    };
                } else {
                    newItem = {
                        serial,
                        style: match.style_number,
                        size: match.size || 'N/A',
                        status: 'READY',
                        message: 'Ready to add'
                    };
                }
            }

            setStagedItems(prev => [newItem, ...prev]);
            setScanInput("");
        }
    };

    const removeFromStage = (serial: string) => {
        setStagedItems(prev => prev.filter(i => i.serial !== serial));
    };

    const handleCommit = async () => {
        const toCommit = stagedItems.filter(i => i.status === 'READY');
        
        // 1. Commit valid items
        if (toCommit.length > 0) {
            const serials = toCommit.map(i => i.serial);
            await bulkUpdateBarcodeStatusBySerial(serials, BarcodeStatus.COMMITTED_TO_STOCK);
            await loadInventory();
        }

        // 2. Prepare Report
        const success = toCommit;
        const skipped = stagedItems.filter(i => i.status === 'EXISTS' || i.status === 'DUPLICATE_SCAN');
        const errors = stagedItems.filter(i => i.status === 'ERROR');

        setReportData({ success, skipped, errors });
        
        // 3. Clear Stage
        setStagedItems([]);
    };

    // Helper for status icon
    const getStatusIcon = (status: StagedItem['status']) => {
        switch (status) {
            case 'READY': return <CheckCircle2 className="text-green-600" size={18} />;
            case 'EXISTS': return <AlertTriangle className="text-yellow-600" size={18} />;
            case 'DUPLICATE_SCAN': return <AlertTriangle className="text-orange-500" size={18} />;
            case 'ERROR': return <XOctagon className="text-red-600" size={18} />;
        }
    };

    // Helper for row class
    const getRowClass = (status: StagedItem['status']) => {
        switch (status) {
            case 'READY': return 'bg-green-50/50 border-green-100';
            case 'EXISTS': return 'bg-yellow-50/50 border-yellow-100';
            case 'DUPLICATE_SCAN': return 'bg-orange-50/50 border-orange-100';
            case 'ERROR': return 'bg-red-50/50 border-red-100';
        }
    };

    // Aggregate Data for Inventory Table
    const aggregated = inventory.reduce((acc, item) => {
        const key = `${item.style_number}-${item.size || 'Unsized'}`;
        if (!acc[key]) {
            acc[key] = { style: item.style_number, size: item.size || 'N/A', count: 0 };
        }
        acc[key].count++;
        return acc;
    }, {} as Record<string, { style: string, size: string, count: number }>);

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Boxes className="text-indigo-600"/> Inventory In-Scan
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* LEFT: Scanning Station */}
                <div className="lg:col-span-2 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Input Area */}
                    <div className="p-6 border-b bg-slate-50">
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <ScanLine size={18} className="text-indigo-600"/> Scan Barcode Input
                        </label>
                        <div className="relative">
                            <input 
                                ref={inputRef}
                                type="text"
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-lg shadow-sm bg-white text-black"
                                placeholder="Scan item..."
                                value={scanInput}
                                onChange={e => setScanInput(e.target.value)}
                                onKeyDown={handleScan}
                                autoComplete="off"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <Search size={20}/>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            Scan items one by one. Review list below before committing to stock.
                        </p>
                    </div>

                    {/* Staging List */}
                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30">
                        {stagedItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                <ScanLine size={48} className="mb-2"/>
                                <p>Ready to Scan</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stagedItems.map((item, idx) => (
                                    <div key={idx} className={`flex items-center p-3 rounded-lg border shadow-sm transition-all ${getRowClass(item.status)}`}>
                                        <div className="mr-3">
                                            {getStatusIcon(item.status)}
                                        </div>
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <div>
                                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Barcode</div>
                                                <div className="font-mono text-sm font-medium truncate" title={item.serial}>{item.serial}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Product</div>
                                                <div className="text-sm font-medium">{item.style} <span className="text-slate-400">/</span> {item.size}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Status</div>
                                                <div className={`text-sm font-bold ${
                                                    item.status === 'READY' ? 'text-green-700' :
                                                    item.status === 'ERROR' ? 'text-red-700' : 'text-yellow-700'
                                                }`}>
                                                    {item.message}
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => removeFromStage(item.serial)}
                                            className="ml-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                                        >
                                            <Trash2 size={18}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Bar */}
                    <div className="p-4 border-t bg-white flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                            Count: <span className="font-bold text-slate-800">{stagedItems.length}</span>
                        </div>
                        <button 
                            onClick={handleCommit}
                            disabled={stagedItems.length === 0}
                            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Save size={20}/>
                            Commit to Stock
                        </button>
                    </div>
                </div>

                {/* RIGHT: Current Stock View (Compact) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
                    <div className="p-4 border-b bg-slate-50 font-bold text-slate-700">
                        Current Inventory
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                                <tr>
                                    <th className="p-3">Style</th>
                                    <th className="p-3">Size</th>
                                    <th className="p-3 text-right">Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {Object.keys(aggregated).length === 0 ? (
                                    <tr><td colSpan={3} className="p-8 text-center text-slate-400">Empty</td></tr>
                                ) : (
                                    Object.values(aggregated).map((row: { style: string; size: string; count: number }, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium text-slate-700">{row.style}</td>
                                            <td className="p-3 text-slate-500">{row.size}</td>
                                            <td className="p-3 text-right font-mono font-bold text-green-600">{row.count}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* REPORT MODAL */}
            {reportData && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-up">
                        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                            <h3 className="text-xl font-bold text-slate-800">Scan Batch Report</h3>
                            <button onClick={() => setReportData(null)} className="text-slate-400 hover:text-slate-600"><X/></button>
                        </div>
                        
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* SUCCESS */}
                            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="text-green-600"/>
                                    <span className="font-bold text-green-800">Added ({reportData.success.length})</span>
                                </div>
                                <div className="text-xs text-green-700 bg-white/60 rounded p-2 h-32 overflow-y-auto font-mono">
                                    {reportData.success.length === 0 && <span className="opacity-50 italic">None</span>}
                                    {reportData.success.map((i, idx) => <div key={idx} className="truncate">{i.serial}</div>)}
                                </div>
                            </div>

                            {/* SKIPPED */}
                            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertTriangle className="text-yellow-600"/>
                                    <span className="font-bold text-yellow-800">Skipped ({reportData.skipped.length})</span>
                                </div>
                                <div className="text-xs text-yellow-700 bg-white/60 rounded p-2 h-32 overflow-y-auto font-mono">
                                    {reportData.skipped.length === 0 && <span className="opacity-50 italic">None</span>}
                                    {reportData.skipped.map((i, idx) => <div key={idx} className="truncate">{i.serial}</div>)}
                                </div>
                            </div>

                            {/* ERRORS */}
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <XOctagon className="text-red-600"/>
                                    <span className="font-bold text-red-800">Invalid ({reportData.errors.length})</span>
                                </div>
                                <div className="text-xs text-red-700 bg-white/60 rounded p-2 h-32 overflow-y-auto font-mono">
                                    {reportData.errors.length === 0 && <span className="opacity-50 italic">None</span>}
                                    {reportData.errors.map((i, idx) => <div key={idx} className="truncate">{i.serial}</div>)}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t bg-slate-50 text-right">
                             <button 
                                onClick={() => setReportData(null)}
                                className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold hover:bg-slate-900 transition"
                            >
                                OK, Close Report
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
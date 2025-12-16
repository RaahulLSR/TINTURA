
import React, { useEffect, useState, useRef } from 'react';
import { fetchBarcodes, commitBarcodesToStock, fetchBarcodesBySerialList, fetchStockCommits, fetchBarcodesByCommit } from '../services/db';
import { Barcode, BarcodeStatus, StockCommit } from '../types';
import { Boxes, ScanLine, Save, Trash2, CheckCircle2, AlertTriangle, XOctagon, X, Search, History, Printer, List, Camera, StopCircle } from 'lucide-react';

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
    // Tab State
    const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');

    // Inventory State
    const [inventory, setInventory] = useState<Barcode[]>([]);
    const [commits, setCommits] = useState<StockCommit[]>([]);
    const [historySearch, setHistorySearch] = useState('');
    
    // Staging State
    const [scanInput, setScanInput] = useState("");
    const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Report Modal State
    const [reportData, setReportData] = useState<ReportData | null>(null);

    // Camera State
    const [showCamera, setShowCamera] = useState(false);
    const scannerRef = useRef<any>(null);

    // Load actual inventory
    const loadInventory = () => fetchBarcodes(BarcodeStatus.COMMITTED_TO_STOCK).then(setInventory);
    const loadHistory = () => fetchStockCommits().then(setCommits);

    useEffect(() => { 
        loadInventory(); 
        if (activeTab === 'history') loadHistory();
    }, [activeTab]);

    // Focus input on load and after actions
    useEffect(() => {
        if (activeTab === 'scan' && !showCamera) inputRef.current?.focus();
    }, [stagedItems, reportData, activeTab, showCamera]);

    // --- SOUND LOGIC ---
    const playSound = (type: 'success' | 'error') => {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'success') {
            // High pitch beep
            osc.type = 'sine';
            osc.frequency.value = 1200;
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } else {
            // Low pitch error sound
            osc.type = 'sawtooth';
            osc.frequency.value = 150;
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        }
    };

    // --- PROCESSING LOGIC ---
    const processBarcode = async (serial: string) => {
        // 1. Check duplicate in staging
        // We use a functional update to get the latest state inside the callback
        let isDuplicate = false;
        setStagedItems(prev => {
            if (prev.find(i => i.serial === serial)) {
                isDuplicate = true;
                return prev;
            }
            return prev;
        });

        if (isDuplicate) {
            playSound('error'); // Duplicate scan
            return; 
        }

        // 2. Lookup
        const results = await fetchBarcodesBySerialList([serial]);
        const match = results[0];

        let newItem: StagedItem;

        if (!match) {
            newItem = {
                serial,
                style: 'Unknown',
                size: '?',
                status: 'ERROR',
                message: 'Not found'
            };
            playSound('error');
        } else {
            if (match.status === BarcodeStatus.COMMITTED_TO_STOCK || match.status === BarcodeStatus.SOLD) {
                newItem = {
                    serial,
                    style: match.style_number,
                    size: match.size || 'N/A',
                    status: 'EXISTS',
                    message: 'Already in Stock'
                };
                playSound('error');
            } else {
                newItem = {
                    serial,
                    style: match.style_number,
                    size: match.size || 'N/A',
                    status: 'READY',
                    message: 'Ready'
                };
                playSound('success');
            }
        }

        setStagedItems(prev => [newItem, ...prev]);
    };

    const handleScan = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const serial = scanInput.trim();
            if (!serial) return;
            await processBarcode(serial);
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
            await commitBarcodesToStock(serials);
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

    // --- CAMERA LOGIC ---
    useEffect(() => {
        if (showCamera) {
            // @ts-ignore - html5-qrcode loaded via CDN
            const Html5Qrcode = window.Html5Qrcode; 
            // @ts-ignore
            const Html5QrcodeSupportedFormats = window.Html5QrcodeSupportedFormats;

            const html5QrCode = new Html5Qrcode("reader");
            scannerRef.current = html5QrCode;

            const config = { 
                fps: 15, 
                // Rectangular box for 1D barcodes
                qrbox: { width: 280, height: 100 }, 
                aspectRatio: 1.0,
                // Prioritize CODE_128 for speed
                formatsToSupport: [ 
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.CODE_39
                ],
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };
            
            html5QrCode.start(
                { facingMode: "environment" }, 
                config, 
                (decodedText: string) => {
                   processBarcode(decodedText);
                },
                (errorMessage: any) => {
                    // parse error, ignore
                }
            ).catch((err: any) => {
                console.error("Camera start failed", err);
                setShowCamera(false);
            });

            return () => {
                if (html5QrCode && html5QrCode.isScanning) {
                    html5QrCode.stop().then(() => html5QrCode.clear());
                }
            };
        }
    }, [showCamera]);

    const stopCamera = () => {
        if (scannerRef.current) {
            scannerRef.current.stop().then(() => {
                scannerRef.current.clear();
                setShowCamera(false);
            }).catch((err: any) => console.log(err));
        } else {
            setShowCamera(false);
        }
    };

    // --- PRINTING UTILS ---
    const printReceipt = (title: string, ref: string, date: string, items: {desc: string, qty: number}[]) => {
        // ... (Keep existing print logic)
        const win = window.open('', 'Receipt', 'width=400,height=600');
        if (win) {
            win.document.write(`
                <html>
                <head>
                    <title>${title}</title>
                    <style>
                        body { font-family: 'Courier New', monospace; padding: 20px; font-size: 14px; text-align: center; }
                        .header { font-weight: bold; font-size: 1.2rem; margin-bottom: 10px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
                        .meta { text-align: left; margin-bottom: 20px; font-size: 12px; }
                        table { width: 100%; text-align: left; border-collapse: collapse; margin-top: 10px; }
                        th { border-bottom: 1px solid #000; padding: 4px; }
                        td { padding: 4px; border-bottom: 1px dashed #ccc; }
                        .total { font-weight: bold; margin-top: 20px; border-top: 1px solid #000; padding-top: 5px; }
                    </style>
                </head>
                <body>
                    <div class="header">TINTURA SST<br/>${title.toUpperCase()}</div>
                    <div class="meta">
                        Ref: ${ref}<br/>
                        Date: ${date}
                    </div>
                    <table>
                        <thead><tr><th>Item / Desc</th><th style="text-align:right">Qty</th></tr></thead>
                        <tbody>
                            ${items.map(i => `<tr><td>${i.desc}</td><td style="text-align:right">${i.qty}</td></tr>`).join('')}
                        </tbody>
                    </table>
                    <div class="total">TOTAL ITEMS: ${items.reduce((a,b) => a + b.qty, 0)}</div>
                    <script>window.print(); setTimeout(() => window.close(), 500);</script>
                </body>
                </html>
            `);
            win.document.close();
        }
    };

    const handlePrintCommit = async (commit: StockCommit) => {
        const items = await fetchBarcodesByCommit(commit.id);
        const aggregated = items.reduce((acc, b) => {
            const key = `${b.style_number} (${b.size})`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const rows = Object.entries(aggregated).map(([desc, qty]) => ({ desc, qty: qty as number }));
        printReceipt("Stock Commit Log", `COMMIT-#${commit.id}`, new Date(commit.created_at).toLocaleString(), rows);
    };

    const handlePrintAllStock = () => {
        const aggregated = inventory.reduce((acc, b) => {
            const key = `${b.style_number} - ${b.size}`;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const rows = Object.entries(aggregated).map(([desc, qty]) => ({ desc, qty: qty as number }));
        printReceipt("Current Inventory Report", `FULL-STOCK`, new Date().toLocaleString(), rows);
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

    // Filter commits
    const filteredCommits = commits.filter(c => 
        c.id.toString().includes(historySearch)
    );

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Boxes className="text-indigo-600"/> Inventory Management
                </h2>
                
                <div className="flex gap-2">
                     <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex">
                        <button 
                            onClick={() => setActiveTab('scan')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                activeTab === 'scan' 
                                ? 'bg-indigo-600 text-white shadow-sm' 
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            <ScanLine size={16}/> Scanner
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                activeTab === 'history' 
                                ? 'bg-indigo-600 text-white shadow-sm' 
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            <History size={16}/> Commit History
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'scan' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden animate-fade-in">
                {/* LEFT: Scanning Station */}
                <div className="lg:col-span-2 flex flex-col gap-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Input Area */}
                    <div className="p-6 border-b bg-slate-50">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-bold text-slate-700 flex items-center gap-2">
                                <ScanLine size={18} className="text-indigo-600"/> Scan Barcode Input
                            </label>
                            <button 
                                onClick={() => setShowCamera(true)}
                                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-indigo-700 shadow-sm"
                            >
                                <Camera size={14}/> Use Camera
                            </button>
                        </div>
                        <div className="relative">
                            <input 
                                ref={inputRef}
                                type="text"
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono text-lg shadow-sm bg-white text-slate-900"
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
                    <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex justify-between items-center">
                        <span>Current Inventory</span>
                        <button onClick={handlePrintAllStock} className="text-slate-500 hover:text-indigo-600" title="Print Inventory Report">
                            <Printer size={18} />
                        </button>
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
            )}

            {activeTab === 'history' && (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in flex flex-col">
                    <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <History size={18}/> Stock Commitment Logs
                        </div>
                        <div className="relative">
                            <input 
                                type="text"
                                placeholder="Search Commit ID..."
                                className="pl-9 pr-4 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 outline-none w-48 bg-white text-slate-900"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                            />
                            <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {filteredCommits.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">No matching history found.</div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                                    <tr>
                                        <th className="p-4">Date</th>
                                        <th className="p-4">Commit ID</th>
                                        <th className="p-4">Items Added</th>
                                        <th className="p-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredCommits.map(commit => (
                                        <tr key={commit.id} className="hover:bg-slate-50">
                                            <td className="p-4 text-slate-700">{new Date(commit.created_at).toLocaleString()}</td>
                                            <td className="p-4 font-mono text-sm text-slate-500">#{commit.id}</td>
                                            <td className="p-4 font-bold text-green-600">+{commit.total_items}</td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => handlePrintCommit(commit)}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded text-sm text-slate-600 hover:bg-white hover:text-indigo-600 shadow-sm"
                                                >
                                                    <Printer size={14}/> Receipt
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

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

            {/* CAMERA MODAL */}
            {showCamera && (
                <div className="fixed inset-0 bg-black z-[60] flex flex-col items-center justify-center">
                    <div className="absolute top-4 right-4 z-50">
                        <button onClick={stopCamera} className="text-white bg-black/50 p-2 rounded-full">
                            <X size={32}/>
                        </button>
                    </div>
                    <div className="w-full max-w-md bg-black relative">
                        <div id="reader" className="w-full h-full"></div>
                        <div className="absolute bottom-10 left-0 right-0 flex justify-center pointer-events-none">
                            <div className="bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                                Point camera at barcode
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex gap-4">
                        <button 
                            onClick={stopCamera}
                            className="bg-red-600 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2"
                        >
                            <StopCircle size={20}/> Stop Scanning
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

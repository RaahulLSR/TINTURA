
import React, { useEffect, useState, useRef } from 'react';
import { fetchBarcodes, createInvoice, fetchInvoices, fetchInvoiceItems } from '../services/db';
import { Barcode, BarcodeStatus, Invoice } from '../types';
import { ShoppingCart, FileText, ScanBarcode, Printer, X, CreditCard, History, LayoutGrid, Search, Camera, StopCircle } from 'lucide-react';

export const SalesDashboard: React.FC = () => {
    // Tabs
    const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');
    
    // Data
    const [stock, setStock] = useState<Barcode[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [historySearch, setHistorySearch] = useState('');
    
    // Cart
    const [cart, setCart] = useState<string[]>([]); // Barcode IDs
    const [scanInput, setScanInput] = useState("");
    
    // Checkout Modal State
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [checkoutForm, setCheckoutForm] = useState({
        clientName: '',
        invoiceNo: ''
    });

    // Camera State
    const [showCamera, setShowCamera] = useState(false);
    const scannerRef = useRef<any>(null);

    const scanInputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        loadStock();
        if (activeTab === 'history') loadHistory();
    }, [activeTab]);

    // Focus scanner input on load
    useEffect(() => {
        if (activeTab === 'pos' && !showCamera) scanInputRef.current?.focus();
    }, [stock, activeTab, showCamera]);

    const loadStock = () => {
        fetchBarcodes(BarcodeStatus.COMMITTED_TO_STOCK).then(setStock);
    };

    const loadHistory = () => {
        fetchInvoices().then(setInvoices);
    };

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

    const addToCart = (id: string) => {
        if (!cart.includes(id)) setCart(prev => [...prev, id]);
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(c => c !== id));
    };

    // --- PROCESSING LOGIC ---
    const processBarcode = (raw: string) => {
        // Find item in stock
        const item = stock.find(b => b.barcode_serial === raw);
        
        if (item) {
            // Check if already in cart (need to check current state)
            // Using functional update to access latest state
            let alreadyInCart = false;
            setCart(prev => {
                if (prev.includes(item.id)) {
                    alreadyInCart = true;
                    return prev;
                }
                return [...prev, item.id];
            });

            if (alreadyInCart) {
                playSound('error'); // Item already in cart
            } else {
                playSound('success'); // Added to cart
            }
        } else {
            playSound('error'); // Not in stock
        }
    };

    const handleScan = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const raw = scanInput.trim();
            if (!raw) return;
            
            // Manual entry logic (reuse processBarcode logic but handle alerts differently if needed)
            const item = stock.find(b => b.barcode_serial === raw);
            if (item) {
                if (cart.includes(item.id)) {
                    alert("Item is already in the cart.");
                } else {
                    addToCart(item.id);
                    setScanInput(""); 
                }
            } else {
                alert("Barcode not found in available stock, or already sold.");
                setScanInput("");
            }
        }
    };

    // --- CAMERA LOGIC ---
    useEffect(() => {
        if (showCamera) {
            // @ts-ignore - html5-qrcode loaded via CDN
            const Html5Qrcode = window.Html5Qrcode; 
            // @ts-ignore
            const Html5QrcodeSupportedFormats = window.Html5QrcodeSupportedFormats;

            const html5QrCode = new Html5Qrcode("pos-reader");
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
    }, [showCamera, stock]); // Re-bind if stock changes to ensure latest lookup

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

    const openCheckoutModal = () => {
        if (cart.length === 0) return;
        setCheckoutForm({
            clientName: '',
            invoiceNo: `INV-${Date.now().toString().slice(-6)}` // Auto-suggest
        });
        setIsCheckoutOpen(true);
    };

    const printInvoice = (inv: Invoice, items: Barcode[]) => {
        // Aggregate items by Style + Size
        const aggregated = items.reduce((acc, item) => {
            const key = `${item.style_number}::${item.size}`;
            if (!acc[key]) {
                acc[key] = { style: item.style_number, size: item.size || 'N/A', qty: 0, unitPrice: 25.00 };
            }
            acc[key].qty++;
            return acc;
        }, {} as Record<string, { style: string, size: string, qty: number, unitPrice: number }>);

        const win = window.open('', 'PrintInvoice', 'width=400,height=600');
        if (win) {
            win.document.write(`
                <html>
                <head>
                    <title>Invoice ${inv.invoice_no}</title>
                    <style>
                        body { font-family: 'Courier New', monospace; padding: 20px; font-size: 14px; }
                        .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
                        .title { font-weight: bold; font-size: 1.2rem; }
                        .meta { margin-bottom: 15px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                        th { text-align: left; border-bottom: 1px solid #000; padding: 5px 0; }
                        td { padding: 5px 0; vertical-align: top; }
                        .total-row { border-top: 2px dashed #000; font-weight: bold; font-size: 1.1rem; }
                        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #555; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="title">TINTURA SST</div>
                        <div>Manufacturing & Retail</div>
                    </div>
                    
                    <div class="meta">
                        <div><strong>Invoice:</strong> ${inv.invoice_no}</div>
                        <div><strong>Date:</strong> ${new Date(inv.created_at).toLocaleString()}</div>
                        <div><strong>Client:</strong> ${inv.customer_name}</div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th style="text-align:right">Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.values(aggregated).map(row => `
                                <tr>
                                    <td>
                                        ${row.style}<br/>
                                        <small>Size: ${row.size}</small>
                                    </td>
                                    <td>${row.qty}</td>
                                    <td style="text-align:right">$${(row.qty * row.unitPrice).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="2" class="total-row" style="padding-top: 10px;">TOTAL</td>
                                <td class="total-row" style="text-align:right; padding-top: 10px;">$${inv.total_amount.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div class="footer">
                        Thank you for your business!<br/>
                        No returns on sale items.
                    </div>
                    <script>
                        window.print();
                        setTimeout(() => window.close(), 1000);
                    </script>
                </body>
                </html>
            `);
            win.document.close();
        }
    };

    const handleFinalizeInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Create Invoice Record
        const inv = await createInvoice(checkoutForm.clientName, cart, checkoutForm.invoiceNo);
        
        // Get the items details for printing
        const cartItems = stock.filter(item => cart.includes(item.id));
        
        // Print
        printInvoice(inv, cartItems);

        // Cleanup
        setIsCheckoutOpen(false);
        setCart([]);
        setCheckoutForm({ clientName: '', invoiceNo: '' });
        loadStock(); // Refresh available stock
    };

    const handleReprint = async (inv: Invoice) => {
        const items = await fetchInvoiceItems(inv.id);
        printInvoice(inv, items);
    };

    const cartTotal = cart.length * 25.00;

    // Filter History
    const filteredInvoices = invoices.filter(i => 
        i.invoice_no.toLowerCase().includes(historySearch.toLowerCase()) || 
        i.customer_name.toLowerCase().includes(historySearch.toLowerCase())
    );

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] gap-6">
            
            {/* Top Bar / Navigation */}
            <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <ShoppingCart className="text-indigo-600"/> Sales & POS
                </h2>
                <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm flex">
                    <button 
                        onClick={() => setActiveTab('pos')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'pos' 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                        <LayoutGrid size={16}/> POS Terminal
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                            activeTab === 'history' 
                            ? 'bg-indigo-600 text-white shadow-sm' 
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                    >
                        <History size={16}/> Previous Bills
                    </button>
                </div>
            </div>

            {/* TAB: POS TERMINAL */}
            {activeTab === 'pos' && (
                <div className="flex-1 flex flex-col md:flex-row gap-6 animate-fade-in overflow-hidden">
                    {/* LEFT: Available Stock List */}
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                            <span className="font-bold text-lg text-slate-700">Available Stock ({stock.length})</span>
                            <span className="text-xs text-slate-500">Click to add manually</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
                            {stock.map(b => {
                                const inCart = cart.includes(b.id);
                                return (
                                    <button 
                                        key={b.id} 
                                        onClick={() => !inCart && addToCart(b.id)}
                                        disabled={inCart}
                                        className={`p-3 rounded-lg border text-left transition relative overflow-hidden ${
                                            inCart 
                                            ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed' 
                                            : 'bg-white border-slate-200 hover:border-indigo-500 hover:shadow-md'
                                        }`}
                                    >
                                        <div className="font-mono font-bold text-slate-800 text-sm truncate" title={b.barcode_serial}>
                                            {b.barcode_serial.split(';').pop()}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">{b.style_number} • Size {b.size}</div>
                                        {inCart && <div className="absolute top-1 right-1 text-green-500"><ScanBarcode size={16}/></div>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* RIGHT: Cart */}
                    <div className="w-full md:w-96 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col">
                        <div className="p-6 border-b bg-indigo-50">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-indigo-900 text-sm uppercase">Cart Scanner</span>
                                <button 
                                    onClick={() => setShowCamera(true)}
                                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-indigo-700 shadow-sm"
                                >
                                    <Camera size={14}/> Use Camera
                                </button>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <ScanBarcode className="text-slate-400" size={18} />
                                </div>
                                <input
                                    ref={scanInputRef}
                                    type="text"
                                    value={scanInput}
                                    onChange={(e) => setScanInput(e.target.value)}
                                    onKeyDown={handleScan}
                                    placeholder="Scan Barcode here..."
                                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm font-mono text-sm bg-white text-slate-900"
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50">
                            {cart.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <ShoppingCart size={48} className="mb-2 opacity-20"/>
                                    <p>Cart is empty</p>
                                    <p className="text-xs">Scan items to begin</p>
                                </div>
                            )}
                            {cart.map(id => {
                                const item = stock.find(s => s.id === id);
                                return (
                                    <div key={id} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded shadow-sm">
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{item?.style_number} - {item?.size}</div>
                                            <div className="text-xs text-slate-500 font-mono truncate w-40">{item?.barcode_serial}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-slate-700">$25</span>
                                            <button onClick={() => removeFromCart(id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="p-6 bg-white border-t border-slate-200 space-y-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                            <div className="flex justify-between text-slate-600 text-sm">
                                <span>Items</span>
                                <span>{cart.length}</span>
                            </div>
                            <div className="flex justify-between font-bold text-2xl text-slate-800">
                                <span>Total</span>
                                <span>${cartTotal.toFixed(2)}</span>
                            </div>
                            
                            <button 
                                onClick={openCheckoutModal}
                                disabled={cart.length === 0}
                                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CreditCard size={20} /> Checkout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in flex flex-col">
                    <div className="p-4 border-b bg-slate-50 font-bold text-slate-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <History size={18}/> Sales History
                        </div>
                        <div className="relative">
                            <input 
                                type="text"
                                placeholder="Search Invoice or Client..."
                                className="pl-9 pr-4 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-indigo-500 outline-none w-64 bg-white text-slate-900"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                            />
                            <Search className="absolute left-3 top-2 text-slate-400" size={14} />
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {filteredInvoices.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">No matching history found.</div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                                    <tr>
                                        <th className="p-4">Date</th>
                                        <th className="p-4">Invoice #</th>
                                        <th className="p-4">Customer</th>
                                        <th className="p-4 text-right">Amount</th>
                                        <th className="p-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredInvoices.map(inv => (
                                        <tr key={inv.id} className="hover:bg-slate-50">
                                            <td className="p-4 text-slate-700">{new Date(inv.created_at).toLocaleString()}</td>
                                            <td className="p-4 font-mono text-sm text-slate-500">{inv.invoice_no}</td>
                                            <td className="p-4 font-bold text-slate-800">{inv.customer_name}</td>
                                            <td className="p-4 text-right font-bold text-green-600">${inv.total_amount.toFixed(2)}</td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => handleReprint(inv)}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded text-sm text-slate-600 hover:bg-white hover:text-indigo-600 shadow-sm"
                                                >
                                                    <Printer size={14}/> Reprint Receipt
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

            {/* Checkout Modal */}
            {isCheckoutOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="text-indigo-600"/> Finalize Invoice
                            </h3>
                            <button onClick={() => setIsCheckoutOpen(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
                        </div>

                        <form onSubmit={handleFinalizeInvoice} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice Number</label>
                                <input 
                                    required
                                    type="text"
                                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-700 bg-white text-slate-900"
                                    value={checkoutForm.invoiceNo}
                                    onChange={e => setCheckoutForm({...checkoutForm, invoiceNo: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Client Name</label>
                                <input 
                                    required
                                    autoFocus
                                    type="text"
                                    placeholder="Enter Client Name"
                                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 bg-white text-slate-900"
                                    value={checkoutForm.clientName}
                                    onChange={e => setCheckoutForm({...checkoutForm, clientName: e.target.value})}
                                />
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg space-y-2 mt-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Total Items:</span>
                                    <span className="font-bold">{cart.length}</span>
                                </div>
                                <div className="flex justify-between text-lg font-bold border-t border-slate-200 pt-2">
                                    <span className="text-slate-700">Amount Due:</span>
                                    <span className="text-indigo-600">${cartTotal.toFixed(2)}</span>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200 transition-all mt-4 flex items-center justify-center gap-2"
                            >
                                <Printer size={20} /> Generate & Print Invoice
                            </button>
                        </form>
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
                        <div id="pos-reader" className="w-full h-full"></div>
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

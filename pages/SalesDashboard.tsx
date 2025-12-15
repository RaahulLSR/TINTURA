import React, { useEffect, useState, useRef } from 'react';
import { fetchBarcodes, createInvoice } from '../services/db';
import { Barcode, BarcodeStatus, Invoice } from '../types';
import { ShoppingCart, FileText, ScanBarcode, Printer, X, CreditCard } from 'lucide-react';

export const SalesDashboard: React.FC = () => {
    const [stock, setStock] = useState<Barcode[]>([]);
    const [cart, setCart] = useState<string[]>([]); // Barcode IDs
    const [scanInput, setScanInput] = useState("");
    
    // Checkout Modal State
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [checkoutForm, setCheckoutForm] = useState({
        clientName: '',
        invoiceNo: ''
    });

    const scanInputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        loadStock();
    }, []);

    // Focus scanner input on load
    useEffect(() => {
        scanInputRef.current?.focus();
    }, [stock]);

    const loadStock = () => {
        fetchBarcodes(BarcodeStatus.COMMITTED_TO_STOCK).then(setStock);
    };

    const addToCart = (id: string) => {
        if (!cart.includes(id)) setCart(prev => [...prev, id]);
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(c => c !== id));
    };

    const handleScan = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            const raw = scanInput.trim();
            if (!raw) return;

            // Find item in stock
            const item = stock.find(b => b.barcode_serial === raw);
            
            if (item) {
                if (cart.includes(item.id)) {
                    alert("Item is already in the cart.");
                } else {
                    addToCart(item.id);
                    setScanInput(""); // Clear for rapid scanning
                }
            } else {
                alert("Barcode not found in available stock, or already sold.");
                setScanInput("");
            }
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

    const cartTotal = cart.length * 25.00;

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-100px)] gap-6">
            
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
                                    {b.barcode_serial.split(';').pop()} {/* Show only the unique serial part for brevity */}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{b.style_number} • Size {b.size}</div>
                                {inCart && <div className="absolute top-1 right-1 text-green-500"><ScanBarcode size={16}/></div>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* RIGHT: POS / Cart */}
            <div className="w-full md:w-96 bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col">
                <div className="p-6 border-b bg-indigo-50">
                    <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2 mb-4">
                        <ShoppingCart className="text-indigo-600"/> Point of Sale
                    </h2>
                    
                    {/* Barcode Scanner Input */}
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
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm font-mono text-sm bg-white text-black"
                            autoComplete="off"
                        />
                    </div>
                </div>
                
                {/* Cart Items */}
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

                {/* Footer Totals */}
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
                                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-slate-700 bg-white text-black"
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
                                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 bg-white text-black"
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
        </div>
    );
};
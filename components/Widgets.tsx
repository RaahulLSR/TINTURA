
import React from 'react';
import { OrderStatus, BarcodeStatus } from '../types';

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let colorClass = 'bg-gray-100 text-gray-800';

  switch (status) {
    // Order Statuses
    case OrderStatus.ASSIGNED: colorClass = 'bg-blue-100 text-blue-800 border-blue-200'; break;
    case OrderStatus.IN_PROGRESS: colorClass = 'bg-yellow-100 text-yellow-800 border-yellow-200'; break;
    case OrderStatus.QC: colorClass = 'bg-orange-100 text-orange-800 border-orange-200'; break;
    case OrderStatus.QC_APPROVED: colorClass = 'bg-teal-100 text-teal-800 border-teal-200'; break;
    case OrderStatus.PACKED: colorClass = 'bg-purple-100 text-purple-800 border-purple-200'; break;
    case OrderStatus.COMPLETED: colorClass = 'bg-green-100 text-green-800 border-green-200'; break;
    
    // Barcode Statuses
    case BarcodeStatus.GENERATED: colorClass = 'bg-gray-100 text-gray-600 border-gray-200'; break;
    case BarcodeStatus.DETAILS_FILLED: colorClass = 'bg-blue-50 text-blue-600 border-blue-100'; break;
    case BarcodeStatus.PUSHED_OUT_OF_SUBUNIT: colorClass = 'bg-yellow-50 text-yellow-600 border-yellow-100'; break;
    case BarcodeStatus.QC_APPROVED: colorClass = 'bg-purple-50 text-purple-600 border-purple-100'; break;
    case BarcodeStatus.COMMITTED_TO_STOCK: colorClass = 'bg-indigo-100 text-indigo-700 border-indigo-200'; break;
    case BarcodeStatus.SOLD: colorClass = 'bg-green-100 text-green-700 border-green-200'; break;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export const BulkActionToolbar: React.FC<{ 
  selectedCount: number; 
  actions: { label: string; onClick: () => void; variant?: 'primary' | 'danger' }[] 
}> = ({ selectedCount, actions }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white border border-slate-200 shadow-2xl rounded-full px-6 py-3 flex items-center space-x-4 z-40 animate-slide-up">
      <span className="font-semibold text-slate-700">{selectedCount} Selected</span>
      <div className="h-4 w-px bg-slate-300"></div>
      {actions.map((action, idx) => (
        <button
          key={idx}
          onClick={action.onClick}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            action.variant === 'danger' 
            ? 'bg-red-50 text-red-600 hover:bg-red-100' 
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

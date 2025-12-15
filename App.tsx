import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, Layout } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { SubunitDashboard } from './pages/SubunitDashboard';
import { MaterialsDashboard } from './pages/MaterialsDashboard';
import { QCDashboard } from './pages/QCDashboard';
import { InventoryDashboard } from './pages/InventoryDashboard';
import { SalesDashboard } from './pages/SalesDashboard';

const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/subunit" element={<SubunitDashboard />} />
            <Route path="/materials" element={<MaterialsDashboard />} />
            <Route path="/qc" element={<QCDashboard />} />
            <Route path="/inventory" element={<InventoryDashboard />} />
            <Route path="/sales" element={<SalesDashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </HashRouter>
  );
};

export default App;

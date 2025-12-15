import React from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, Layout, useAuth } from './components/Layout';
import { AdminDashboard } from './pages/AdminDashboard';
import { SubunitDashboard } from './pages/SubunitDashboard';
import { MaterialsDashboard } from './pages/MaterialsDashboard';
import { QCDashboard } from './pages/QCDashboard';
import { InventoryDashboard } from './pages/InventoryDashboard';
import { SalesDashboard } from './pages/SalesDashboard';
import { Login } from './pages/Login';
import { UserRole } from './types';

// Protected Route Wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode, allowedRoles?: UserRole[] }> = ({ children, allowedRoles }) => {
    const { isAuthenticated, user } = useAuth();
    const location = useLocation();

    if (!isAuthenticated || !user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles) {
        // Special case for Inventory role accessing Sales page
        const effectiveRoles = [...allowedRoles];
        if (allowedRoles.includes(UserRole.INVENTORY)) {
             effectiveRoles.push(UserRole.SALES);
        }

        if (!effectiveRoles.includes(user.role) && user.role !== UserRole.ADMIN) {
            // Redirect to their home page based on role if they try to access unauthorized page
            if (user.role === UserRole.SUB_UNIT) return <Navigate to="/subunit" replace />;
            if (user.role === UserRole.MATERIALS) return <Navigate to="/materials" replace />;
            if (user.role === UserRole.INVENTORY) return <Navigate to="/inventory" replace />;
            return <Navigate to="/" replace />;
        }
    }

    return <>{children}</>;
};

const AppRoutes = () => {
    return (
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <AdminDashboard />
                </ProtectedRoute>
            } />
            
            <Route path="/subunit" element={
                <ProtectedRoute allowedRoles={[UserRole.SUB_UNIT, UserRole.ADMIN]}>
                    <SubunitDashboard />
                </ProtectedRoute>
            } />
            
            <Route path="/materials" element={
                <ProtectedRoute allowedRoles={[UserRole.MATERIALS, UserRole.ADMIN]}>
                    <MaterialsDashboard />
                </ProtectedRoute>
            } />
            
            <Route path="/qc" element={
                <ProtectedRoute allowedRoles={[UserRole.QC, UserRole.ADMIN]}>
                    <QCDashboard />
                </ProtectedRoute>
            } />
            
            <Route path="/inventory" element={
                <ProtectedRoute allowedRoles={[UserRole.INVENTORY, UserRole.SUB_UNIT, UserRole.ADMIN]}>
                    <InventoryDashboard />
                </ProtectedRoute>
            } />
            
            <Route path="/sales" element={
                <ProtectedRoute allowedRoles={[UserRole.SALES, UserRole.INVENTORY, UserRole.SUB_UNIT, UserRole.ADMIN]}>
                    <SalesDashboard />
                </ProtectedRoute>
            } />
            
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Layout>
    )
}

const App: React.FC = () => {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
};

export default App;
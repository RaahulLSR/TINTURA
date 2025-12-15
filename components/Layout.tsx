import React, { useState, createContext, useContext, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserRole } from '../types';
import { 
  LayoutDashboard, 
  Factory, 
  ClipboardCheck, 
  Package, 
  ShoppingCart, 
  Archive, 
  LogOut, 
  Menu,
  X,
  Layers
} from 'lucide-react';

interface AuthContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  user: string;
}

const AuthContext = createContext<AuthContextType>({ role: UserRole.ADMIN, setRole: () => {}, user: 'Demo User' });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole>(UserRole.ADMIN);
  return (
    <AuthContext.Provider value={{ role, setRole, user: 'Demo User' }}>
      {children}
    </AuthContext.Provider>
  );
};

interface SidebarItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ to, icon, label, active }) => (
  <Link 
    to={to} 
    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
      active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </Link>
);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, setRole, user } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { role: UserRole.ADMIN, to: '/', icon: <LayoutDashboard size={20} />, label: 'Admin HQ' },
    { role: UserRole.SUB_UNIT, to: '/subunit', icon: <Factory size={20} />, label: 'Sub-Unit Ops' },
    { role: UserRole.MATERIALS, to: '/materials', icon: <Archive size={20} />, label: 'Materials' },
    { role: UserRole.QC, to: '/qc', icon: <ClipboardCheck size={20} />, label: 'QC Department' },
    { role: UserRole.INVENTORY, to: '/inventory', icon: <Package size={20} />, label: 'Inventory' },
    { role: UserRole.SALES, to: '/sales', icon: <ShoppingCart size={20} />, label: 'Sales & POS' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          {/* NEW LOGO DESIGN */}
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2 rounded-lg text-white shadow-lg shadow-indigo-900/50">
                <Layers size={24} strokeWidth={2.5} />
             </div>
             <div>
                <h1 className="text-xl font-bold leading-none tracking-tight text-white">
                  Tintura <span className="text-indigo-400">SST</span>
                </h1>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Smart System</span>
             </div>
          </div>
          
          <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-slate-400">
            <X size={24} />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
             <SidebarItem 
               key={item.to} 
               to={item.to} 
               icon={item.icon} 
               label={item.label} 
               active={location.pathname === item.to}
             />
          ))}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-slate-800 bg-slate-900">
          <div className="mb-4">
             <label className="text-xs text-slate-500 uppercase font-semibold">Switch Role (Demo)</label>
             <select 
               className="w-full mt-1 bg-slate-800 text-slate-200 text-sm rounded border-none p-2 focus:ring-1 focus:ring-indigo-500"
               value={role}
               onChange={(e) => setRole(e.target.value as UserRole)}
             >
               {Object.values(UserRole).map(r => (
                 <option key={r} value={r}>{r}</option>
               ))}
             </select>
          </div>
          <div className="flex items-center space-x-3 text-slate-400">
             <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
               {user.charAt(0)}
             </div>
             <div className="text-sm">
               <p className="text-white">{user}</p>
               <p className="text-xs capitalize">{role.toLowerCase().replace('_', ' ')}</p>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-slate-200 p-4 md:hidden flex items-center justify-between">
            <button onClick={() => setMobileMenuOpen(true)} className="text-slate-600">
               <Menu size={24} />
            </button>
            <span className="font-bold text-slate-800 flex items-center gap-2">
                <Layers size={18} className="text-indigo-600"/> Tintura SST
            </span>
            <div className="w-6" /> 
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};
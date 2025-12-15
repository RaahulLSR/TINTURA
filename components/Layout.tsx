import React, { useState, createContext, useContext, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { UserRole, AppUser } from '../types';
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
  Layers,
  UserCircle
} from 'lucide-react';

interface AuthContextType {
  isAuthenticated: boolean;
  user: AppUser | null;
  login: (user: AppUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ 
  isAuthenticated: false, 
  user: null, 
  login: () => {}, 
  logout: () => {} 
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const navigate = useNavigate();

  // Check for stored session on load
  useEffect(() => {
    const stored = localStorage.getItem('tintura_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const login = (userData: AppUser) => {
    setUser(userData);
    localStorage.setItem('tintura_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('tintura_user');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout }}>
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
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If not authenticated, we don't render the layout (the wrapper in App.tsx handles redirect)
  if (!isAuthenticated || !user) {
    return <>{children}</>;
  }

  // Define All Routes
  const allNavItems = [
    { role: UserRole.ADMIN, to: '/', icon: <LayoutDashboard size={20} />, label: 'Admin HQ' },
    { role: UserRole.SUB_UNIT, to: '/subunit', icon: <Factory size={20} />, label: 'Sub-Unit Ops' },
    { role: UserRole.MATERIALS, to: '/materials', icon: <Archive size={20} />, label: 'Materials' },
    { role: UserRole.QC, to: '/qc', icon: <ClipboardCheck size={20} />, label: 'QC Department' },
    { role: UserRole.INVENTORY, to: '/inventory', icon: <Package size={20} />, label: 'Inventory' },
    { role: UserRole.SALES, to: '/sales', icon: <ShoppingCart size={20} />, label: 'Sales & POS' },
  ];

  // Filter based on Role
  const navItems = allNavItems.filter(item => {
    if (user.role === UserRole.ADMIN) return true; // Admin sees all
    
    // Inventory role sees Inventory AND Sales
    if (user.role === UserRole.INVENTORY) {
        return item.role === UserRole.INVENTORY || item.role === UserRole.SALES;
    }

    // Sub Unit role sees Subunit Ops, Inventory, AND Sales
    if (user.role === UserRole.SUB_UNIT) {
        return item.role === UserRole.SUB_UNIT || item.role === UserRole.INVENTORY || item.role === UserRole.SALES;
    }

    // Others see only their specific page (QC sees QC, Materials sees Materials)
    return item.role === user.role;
  });

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="flex flex-col p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2 rounded-lg text-white shadow-lg shadow-indigo-900/50">
                    <Layers size={24} strokeWidth={2.5} />
                </div>
                <div>
                    <h1 className="text-xl font-bold leading-none tracking-tight text-white">
                    Tintura <span className="text-indigo-400">SST</span>
                    </h1>
                </div>
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-slate-400">
                <X size={24} />
            </button>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold ml-1">A Product of LSR</p>
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
          <div className="flex items-center space-x-3 text-slate-400 mb-4">
             <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400 border border-slate-700">
               <UserCircle size={24}/>
             </div>
             <div className="text-sm overflow-hidden">
               <p className="text-white font-bold truncate">{user.full_name || user.username}</p>
               <p className="text-xs text-indigo-400 capitalize">{user.role.replace(/_/g, ' ').toLowerCase()}</p>
             </div>
          </div>
          
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut size={16}/> Sign Out
          </button>
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
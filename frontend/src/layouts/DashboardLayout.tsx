import { ReactNode, useState, createContext, useContext } from 'react';
import { Sidebar } from '../components/Sidebar';
import { useLicense } from '../contexts/LicenseContext';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface SidebarContextType {
  isCollapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { license } = useLicense();

  const toggle = () => setIsCollapsed(!isCollapsed);

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggle }}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isCollapsed={isCollapsed} toggle={toggle} />
        <main
          className={`flex-1 ${
            isCollapsed ? 'ml-20' : 'ml-64'
          } h-full overflow-y-auto p-8 relative scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent transition-all duration-300 ease-in-out`}
        >
          {/* Glow effect at top right */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
          {license?.grace_period && (
            <div className="flex items-center gap-3 p-3 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-700 dark:text-amber-300">
              <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
              <span>
                License validation offline. Grace period active until{' '}
                {license.grace_period_end ? new Date(license.grace_period_end).toLocaleString() : 'unknown'}.
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
};
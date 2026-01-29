import { ReactNode, useState } from 'react';
import { Sidebar } from '../components/Sidebar';

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar isCollapsed={isCollapsed} toggle={() => setIsCollapsed(!isCollapsed)} />
      <main 
        className={`flex-1 ${
          isCollapsed ? 'ml-20' : 'ml-64'
        } h-full overflow-y-auto p-8 relative scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent transition-all duration-300 ease-in-out`}
      >
        {/* Glow effect at top right */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] -z-10 pointer-events-none" />
        {children}
      </main>
    </div>
  );
};
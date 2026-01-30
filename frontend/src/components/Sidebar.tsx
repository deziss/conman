import { CubeIcon, CommandLineIcon, ChevronUpDownIcon, ServerStackIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { NavLink } from 'react-router-dom';
import { HomeIcon, Square3Stack3DIcon, PhotoIcon, SignalIcon, ArchiveBoxIcon, Cog6ToothIcon, SunIcon, MoonIcon, ChevronLeftIcon, ChevronRightIcon, UserIcon, KeyIcon, QuestionMarkCircleIcon, LifebuoyIcon } from '@heroicons/react/24/solid';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth, getInitials } from '../contexts/AuthContext';
import { useHost, LOCAL_HOST } from '../contexts/HostContext';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';
import { APP_CONFIG } from '../constants/app';
import { useState, useRef, useEffect } from 'react';

interface SidebarProps {
  isCollapsed: boolean;
  toggle: () => void;
}

export const Sidebar = ({ isCollapsed, toggle }: SidebarProps) => {
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { hosts, currentHost, setCurrentHost, isLocalHost } = useHost();
  const [hostDropdownOpen, setHostDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setHostDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } flex-shrink-0 flex flex-col h-screen glass border-r border-r-slate-200/50 dark:border-r-white/10 ml-0 rounded-r-none fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out`}
    >
      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'}`}>
         {/* Logo Section */}
         <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'scale-100' : 'scale-100'}`}>
            <h1 className="font-bold font-mono tracking-tighter whitespace-nowrap flex items-center">
              <span className={`text-cyan-600 dark:text-cyan-400 transition-all duration-300 ${isCollapsed ? 'text-2xl' : 'text-2xl'}`}>
                {isCollapsed ? 'C' : 'CON'}
              </span>
              <span className={`text-purple-600 dark:text-purple-400 transition-all duration-300 ${isCollapsed ? 'text-2xl' : 'text-2xl'}`}>
                {isCollapsed ? 'M' : 'MAN'}
              </span>
            </h1>
         </div>
         
         {!isCollapsed && (
            <p className="fixed left-6 top-14 text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest font-semibold whitespace-nowrap opacity-100 transition-opacity duration-300 delay-100">
              {APP_CONFIG.TAGLINE}
            </p>
         )}

        <button
          onClick={toggle}
          className={`p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-colors ${isCollapsed ? '' : ''}`}
        >
          {isCollapsed ? <ChevronRightIcon className="w-5 h-5" /> : <ChevronLeftIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Host Selector */}
      <div className="px-4 mb-2" ref={dropdownRef}>
        <div 
          onClick={() => !isCollapsed && setHostDropdownOpen(!hostDropdownOpen)}
          className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} p-2 rounded-lg bg-gradient-to-r from-cyan-500/5 to-blue-500/5 border border-cyan-500/20 cursor-pointer hover:bg-cyan-500/10 transition-colors`}
        >
          <div className="flex items-center space-x-2 min-w-0">
            {isLocalHost ? (
              <ComputerDesktopIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            ) : (
              <ServerStackIcon className="w-4 h-4 text-purple-400 flex-shrink-0" />
            )}
            {!isCollapsed && (
              <span className="text-sm font-medium text-slate-200 truncate">
                {currentHost?.name || 'Select Host'}
              </span>
            )}
          </div>
          {!isCollapsed && <ChevronUpDownIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />}
        </div>

        {/* Dropdown */}
        {hostDropdownOpen && !isCollapsed && (
          <div className="absolute left-4 right-4 mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
            {/* Local Docker */}
            <button
              onClick={() => { setCurrentHost(LOCAL_HOST); setHostDropdownOpen(false); }}
              className={`w-full flex items-center space-x-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors ${isLocalHost ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300'}`}
            >
              <ComputerDesktopIcon className="w-4 h-4" />
              <span>Local Docker</span>
            </button>
            
            {hosts.length > 0 && <div className="border-t border-white/5 my-1" />}
            
            {/* Remote Hosts */}
            {hosts.map(host => (
              <button
                key={host.id}
                onClick={() => { setCurrentHost(host); setHostDropdownOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 transition-colors ${currentHost?.id === host.id ? 'bg-purple-500/10 text-purple-400' : 'text-slate-300'}`}
              >
                <div className="flex items-center space-x-2">
                  <ServerStackIcon className="w-4 h-4" />
                  <span className="truncate">{host.name}</span>
                </div>
                <span className={`w-2 h-2 rounded-full ${host.status === 'healthy' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-2 overflow-y-auto overflow-x-hidden">
              <NavLink
                to="/"
                title={isCollapsed ? "Dashboard" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <HomeIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Dashboard
                </span>
              </NavLink>

              <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'h-0 opacity-0' : 'h-8 opacity-100 pt-4 pb-2'}`}>
                 <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Manage</p>
              </div>
              {isCollapsed && <div className="h-4" />}

              <NavLink
                to="/containers"
                title={isCollapsed ? "Containers" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <Square3Stack3DIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Containers
                </span>
              </NavLink>

              <NavLink
                to="/images"
                title={isCollapsed ? "Images" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <PhotoIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Images
                </span>
              </NavLink>

              <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'h-0 opacity-0' : 'h-8 opacity-100 pt-4 pb-2'}`}>
                 <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Parameters</p>
              </div>
              {isCollapsed && <div className="h-4" />}

              <NavLink
                to="/networks"
                title={isCollapsed ? "Networks" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <SignalIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Networks
                </span>
              </NavLink>

              <NavLink
                to="/volumes"
                title={isCollapsed ? "Volumes" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <ArchiveBoxIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Volumes
                </span>
              </NavLink>

               <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'h-0 opacity-0' : 'h-8 opacity-100 pt-4 pb-2'}`}>
                 <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">System</p>
              </div>
              {isCollapsed && <div className="h-4" />}
              
              <NavLink
                to="/users"
                title={isCollapsed ? "Users" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <UserIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Users
                </span>
              </NavLink>
              
              <NavLink
                to="/profile"
                title={isCollapsed ? "Profile" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <KeyIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Profile
                </span>
              </NavLink>

               <NavLink
                to="/settings"
                title={isCollapsed ? "Settings" : ""}
                className={({ isActive }) =>
                  `flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-4'} py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`
                }
              >
                <div className={`p-1 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-all duration-300 ${isCollapsed ? 'mr-0' : 'mr-3'}`}>
                    <Cog6ToothIcon className="w-5 h-5" />
                </div>
                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                  Settings
                </span>
              </NavLink>
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-white/5">
        {/* User Profile Section */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center flex-col gap-4' : 'justify-between'} p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 transition-all duration-300`}>
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user ? getInitials(user.name) : 'U'}
            </div>
            <div className={`ml-3 overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-200 whitespace-nowrap truncate max-w-[140px]">{user?.name || 'User'}</p>
              <p className="text-xs text-slate-500 whitespace-nowrap truncate max-w-[140px]">{user?.email || ''}</p>
            </div>
          </div>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
          </button>
           <button 
            onClick={logout}
            className="p-2 rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
            title="Logout"
          >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
          </button>
        </div>
        
        {/* Help, Contact & Support Links */}
        <div className={`mt-3 flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-center gap-4'} transition-all duration-300`}>
          <a 
            href={APP_CONFIG.HELP_URL}
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
            title="Help"
          >
            <QuestionMarkCircleIcon className="w-4 h-4" />
            <span className={`${isCollapsed ? 'hidden' : ''}`}>Help</span>
          </a>
          <a 
            href={`mailto:${APP_CONFIG.CONTACT_EMAIL}`}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            title="Contact"
          >
            <EnvelopeIcon className="w-4 h-4" />
            <span className={`${isCollapsed ? 'hidden' : ''}`}>Contact</span>
          </a>
          <a 
            href={APP_CONFIG.SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
            title="Support"
          >
            <LifebuoyIcon className="w-4 h-4" />
            <span className={`${isCollapsed ? 'hidden' : ''}`}>Support</span>
          </a>
        </div>
        
        {/* Version Info */}
        <div className={`mt-3 text-center transition-all duration-300 ${isCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
          <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
            {APP_CONFIG.FULL_VERSION}
          </p>
        </div>
      </div>
    </div>
  );
};

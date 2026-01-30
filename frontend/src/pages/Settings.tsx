import React, { useState } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    ClockIcon, 
    ShieldCheckIcon, 
    SwatchIcon, 
    BellIcon, 
    UserGroupIcon, 
    KeyIcon, 
    WrenchIcon,
    MagnifyingGlassIcon,
    ChevronRightIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline';

interface SettingCategory {
    id: string;
    title: string;
    description: string;
    icon: any;
    color: string;
    href: string; // Internal tab or route
}

const CATEGORIES: SettingCategory[] = [
    {
        id: 'jobs',
        title: 'Job Schedule',
        description: 'Configure how often CONMAN background jobs run',
        icon: ClockIcon,
        color: 'text-indigo-500',
        href: '#jobs'
    },
    {
        id: 'security',
        title: 'Security',
        description: 'Manage authentication and security settings',
        icon: ShieldCheckIcon,
        color: 'text-emerald-500',
        href: '#security'
    },
    {
        id: 'appearance',
        title: 'Appearance',
        description: 'Customize navigation, theme, and interface behavior',
        icon: SwatchIcon,
        color: 'text-purple-500',
        href: '#appearance'
    },
    {
        id: 'notifications',
        title: 'Notifications',
        description: 'Configure email and Discord notifications for events',
        icon: BellIcon,
        color: 'text-amber-500',
        href: '#notifications'
    },
    {
        id: 'users',
        title: 'Users',
        description: 'Manage user accounts and access control',
        icon: UserGroupIcon,
        color: 'text-blue-500',
        href: '/users' // External route
    },
    {
        id: 'api-keys',
        title: 'API Keys',
        description: 'Create and manage API keys for programmatic access',
        icon: KeyIcon,
        color: 'text-pink-500',
        href: '/profile' // External route
    },
    {
        id: 'timeouts',
        title: 'Timeouts',
        description: 'Configure operation timeouts for slow networks',
        icon: WrenchIcon,
        color: 'text-cyan-500',
        href: '#timeouts'
    }
];

export const Settings = () => {
    const [search, setSearch] = useState('');

    const filteredCategories = CATEGORIES.filter(c => 
        c.title.toLowerCase().includes(search.toLowerCase()) || 
        c.description.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 p-8 shadow-2xl">
                 <div className="absolute top-0 right-0 p-40 bg-purple-500/5 blur-3xl rounded-full pointer-events-none transform translate-x-1/3 -translate-y-1/2" />
                 
                 <div className="relative z-10">
                    <div className="flex items-center space-x-4 mb-6">
                        <div className="p-3 bg-purple-100 dark:bg-purple-500/10 rounded-xl">
                            <Cog6ToothIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Settings</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Configure and customize your CONMAN experience</p>
                        </div>
                    </div>

                    <div className="relative max-w-xl">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="Search settings..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-slate-100 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-3 text-slate-900 dark:text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                        />
                    </div>
                 </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCategories.map((cat) => (
                    <GlassCard 
                        key={cat.id} 
                        className="p-0 group hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer border-slate-200 dark:border-transparent hover:border-slate-300 dark:hover:border-white/10"
                    >
                        <a href={cat.href} className="block p-6 h-full">
                            <div className="flex items-start justify-between">
                                <div className={`p-2 rounded-lg bg-slate-100 dark:bg-white/5 ${cat.color}`}>
                                    <cat.icon className="w-6 h-6" />
                                </div>
                                <ChevronRightIcon className="w-5 h-5 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors" />
                            </div>
                            
                            <div className="mt-4">
                                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    {cat.title}
                                </h3>
                                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                                    {cat.description}
                                </p>
                            </div>
                        </a>
                    </GlassCard>
                ))}
            </div>

            {filteredCategories.length === 0 && (
                <div className="text-center py-10 text-slate-500">
                    No settings found matching "{search}"
                </div>
            )}
        </div>
    );
};

export default Settings;
import { useState } from 'react';
import { Tab } from '@headlessui/react';
import { Cog6ToothIcon, BellIcon, InformationCircleIcon, AdjustmentsHorizontalIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { NotificationSettings } from '../components/settings/NotificationSettings';
import { LicenseSettings } from '../components/settings/LicenseSettings';
import { AboutTab } from '../components/settings/AboutTab';
import { PageTransition } from '../components/ui/PageTransition';

export const Settings = () => {
    const categories = [
        { name: 'General', icon: AdjustmentsHorizontalIcon, component: GeneralSettings },
        { name: 'Notifications', icon: BellIcon, component: NotificationSettings },
        { name: 'License', icon: ShieldCheckIcon, component: LicenseSettings },
        { name: 'About', icon: InformationCircleIcon, component: AboutTab },
    ];

    return (
        <PageTransition>
            <div className="space-y-6 pb-20 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center space-x-4 mb-8">
                    <div className="p-3 bg-purple-100 dark:bg-purple-500/10 rounded-xl">
                        <Cog6ToothIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Settings</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Configure Conman preferences and manage connections</p>
                    </div>
                </div>

                <Tab.Group>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Sidebar Navigation */}
                        <div className="lg:col-span-1">
                            <Tab.List className="flex lg:flex-col space-x-2 lg:space-x-0 lg:space-y-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                                {categories.map((category) => (
                                    <Tab
                                        key={category.name}
                                        className={({ selected }) =>
                                            `flex items-center space-x-3 w-full px-4 py-3 text-sm font-medium rounded-xl transition-all outline-none whitespace-nowrap
                                            ${selected 
                                                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-sm ring-1 ring-cyan-500/20' 
                                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                                            }`
                                        }
                                    >
                                        <category.icon className="w-5 h-5" />
                                        <span>{category.name}</span>
                                    </Tab>
                                ))}
                            </Tab.List>
                        </div>

                        {/* Content Area */}
                        <div className="lg:col-span-3">
                            <Tab.Panels>
                                {categories.map((category, idx) => (
                                    <Tab.Panel
                                        key={idx}
                                        className="outline-none focus:outline-none"
                                    >
                                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                                            <category.component />
                                        </div>
                                    </Tab.Panel>
                                ))}
                            </Tab.Panels>
                        </div>
                    </div>
                </Tab.Group>
            </div>
        </PageTransition>
    );
};

export default Settings;
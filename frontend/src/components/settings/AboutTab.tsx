import { APP_CONFIG } from '../../constants/app';
import { GlassCard } from '../ui/GlassCard';

export const AboutTab = () => {
    return (
        <GlassCard className="p-8 text-center space-y-6">
            <div className="flex justify-center mb-6">
                <div className="relative">
                    <div className="absolute inset-0 bg-cyan-500 blur-2xl opacity-20 rounded-full animate-pulse" />
                    <h1 className="relative font-bold font-mono tracking-tighter text-4xl">
                        <span className="text-cyan-600 dark:text-cyan-400">CON</span>
                        <span className="text-purple-600 dark:text-purple-400">MAN</span>
                    </h1>
                </div>
            </div>

            <p className="text-lg text-slate-600 dark:text-slate-300 font-medium max-w-lg mx-auto leading-relaxed">
                The next-generation Docker container manager designed for performance, aesthetics, and ease of use.
            </p>

            <div className="flex justify-center items-center space-x-6 py-6">
                <div className="text-center px-6 border-r border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Version</p>
                    <p className="text-xl font-mono text-slate-900 dark:text-white mt-1">{APP_CONFIG.VERSION}</p>
                </div>
                 <div className="text-center px-6">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Build</p>
                    <p className="text-xl font-mono text-slate-900 dark:text-white mt-1">v1.0.1</p>
                </div>
            </div>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                <p className="text-sm text-slate-500">
                    Designed & Developed by <span className="font-semibold text-slate-700 dark:text-slate-200">Deziss</span>
                </p>
                <div className="flex justify-center space-x-4 mt-4">
                     <a href={APP_CONFIG.GITHUB_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-cyan-500 transition-colors">GitHub</a>
                     <a href={APP_CONFIG.FALLOW_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-cyan-500 transition-colors">Updates</a>
                     <a href={APP_CONFIG.SUPPORT_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-cyan-500 transition-colors">Support</a>
                </div>
            </div>
        </GlassCard>
    );
};

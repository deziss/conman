import { useState, useEffect } from 'react';
import api from '../services/api';
import { KeyIcon, TrashIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface APIKey {
  ID: number;
  Name: string;
  Key: string;
  Role: string;
}

export const Profile = () => {
    const [keys, setKeys] = useState<APIKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState('');

    useEffect(() => {
        fetchKeys();
    }, []);

    const fetchKeys = async () => {
        try {
            const response = await api.get('/profile/keys');
            setKeys(response.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateKey = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await api.post('/profile/keys', { name: newKeyName });
            toast.success('API Key generated');
            setKeys([...keys, response.data]);
            setNewKeyName('');
        } catch (error) {
             toast.error('Failed to generate key');
        }
    };

     const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center bg-white/50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 backdrop-blur-xl shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400">
                    My Profile & API Keys
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your access keys for programmatic access</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Create Key */}
                <div className="bg-white/50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 backdrop-blur-xl shadow-sm h-fit">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Generate New API Key</h2>
                    <form onSubmit={handleCreateKey} className="space-y-4">
                        <div>
                             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Key Name</label>
                             <input type="text" required 
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
                                    placeholder="e.g. CI/CD Runner"
                                    value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                                />
                        </div>
                        <button type="submit" className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg shadow-green-500/20 flex justify-center items-center">
                            <KeyIcon className="w-5 h-5 mr-2" />
                            Generate Key
                        </button>
                    </form>
                </div>

                {/* List Keys */}
                <div className="lg:col-span-2 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-white/5 backdrop-blur-xl overflow-hidden shadow-sm">
                     <div className="p-6 border-b border-slate-200/50 dark:border-white/5">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Active API Keys</h2>
                     </div>
                     <div className="p-0">
                         {loading ? (
                             <div className="p-8 text-center text-slate-500">Loading keys...</div>
                         ) : keys.length === 0 ? (
                             <div className="p-8 text-center text-slate-500">No API keys found. Generate one to get started.</div>
                         ) : (
                             <div className="divide-y divide-slate-200/50 dark:divide-white/5">
                                 {keys.map((key) => (
                                     <div key={key.ID} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                                         <div>
                                             <p className="font-medium text-slate-900 dark:text-white mb-1">{key.Name}</p>
                                             <div className="flex items-center gap-2">
                                                 <code className="bg-slate-100 dark:bg-black/20 px-2 py-0.5 rounded text-xs font-mono text-slate-600 dark:text-slate-400">
                                                     {key.Key}
                                                 </code>
                                                 <button onClick={() => copyToClipboard(key.Key)} className="text-slate-400 hover:text-green-500 transition-colors">
                                                     <ClipboardDocumentIcon className="w-4 h-4" />
                                                 </button>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-4">
                                              <span className="text-xs text-slate-500 font-mono hidden sm:block">ID: {key.ID}</span>
                                              <button className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                  <TrashIcon className="w-5 h-5" />
                                              </button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         )}
                     </div>
                </div>
            </div>
        </div>
    );
};

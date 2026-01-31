import { useState, useEffect } from 'react';
import api from '../services/api';
import { UserIcon, PlusIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface User {
  ID: number;
  Email: string;
  FullName: string;
  Role: string;
}

export const Users = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState({ email: '', password: '', full_name: '', role: 'viewer' });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await api.get('/users');
            setUsers(response.data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to fetch users. Access denied?');
        } finally {
            setLoading(false);
        }
    };

    const openCreateModal = () => {
        setEditingUser(null);
        setFormData({ email: '', password: '', full_name: '', role: 'viewer' });
        setIsModalOpen(true);
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        setFormData({ 
            email: user.Email, 
            password: '', // Empty means don't change
            full_name: user.FullName, 
            role: user.Role 
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await api.put(`/users/${editingUser.ID}`, formData);
                toast.success('User updated successfully');
            } else {
                await api.post('/users', formData);
                toast.success('User created successfully');
            }
            setIsModalOpen(false);
            fetchUsers();
        } catch (error) {
             toast.error(editingUser ? 'Failed to update user' : 'Failed to create user');
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center bg-white/50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 backdrop-blur-xl shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-600 to-orange-600 dark:from-rose-400 dark:to-orange-400">
                    User Management
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage system users and their roles</p>
                </div>
                <button 
                  onClick={openCreateModal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center shadow-lg shadow-rose-500/20"
                >
                    <PlusIcon className="w-5 h-5 mr-2" />
                    Create User
                </button>
            </div>

            <div className="bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-white/5 backdrop-blur-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/50 dark:divide-white/5">
                             {loading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading...</td></tr>
                             ) : users.map((user) => (
                                <tr key={user.ID} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                                    <td className="p-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">
                                            {user.FullName ? user.FullName.substring(0, 2).toUpperCase() : 'U'}
                                        </div>
                                        {user.FullName}
                                    </td>
                                    <td className="p-4 text-slate-600 dark:text-slate-400">{user.Email}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wide
                                            ${user.Role === 'admin' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30' : 
                                              user.Role === 'operator' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30' :
                                              'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400 border border-slate-200 dark:border-slate-500/30'
                                            }
                                        `}>
                                            {user.Role}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-400 text-xs font-mono">{user.ID}</td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => openEditModal(user)}
                                            className="p-1.5 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/10 rounded-lg transition-colors"
                                            title="Edit User"
                                        >
                                            <PencilSquareIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
            </div>

             {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md p-6">
                        <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
                            {editingUser ? 'Edit User' : 'Create New User'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                                <input type="text" required 
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 dark:text-white"
                                    value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                                <input type="email" required 
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 dark:text-white"
                                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Password {editingUser && <span className="text-xs font-normal text-slate-500">(Leave blank to keep current)</span>}
                                </label>
                                <input type="password" 
                                    required={!editingUser}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 dark:text-white"
                                    value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
                                <select 
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 dark:text-white"
                                    value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="operator">Operator</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-lg shadow-rose-500/20">
                                    {editingUser ? 'Save Changes' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

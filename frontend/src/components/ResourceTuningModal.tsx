import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { CpuChipIcon, WrenchScrewdriverIcon, BoltIcon, XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import api from '../services/api';
import { toast } from 'react-hot-toast';

interface ResourceTuningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  containerId: string;
  containerName: string;
  currentHostId?: string;
  currentHostConfig?: {
    Memory?: number;
    MemorySwap?: number;
    CpuQuota?: number;
    CpuPeriod?: number;
    CpuShares?: number;
    RestartPolicy?: {
      Name?: string;
    };
  };
}

export const ResourceTuningModal = ({
  isOpen,
  onClose,
  onSuccess,
  containerId,
  containerName,
  currentHostId,
  currentHostConfig,
}: ResourceTuningModalProps) => {
  // Memory in MB (0 = unlimited)
  const [memoryMB, setMemoryMB] = useState<number>(0);
  // Memory Swap in MB (-1 = unlimited, 0 = unset)
  const [memorySwapMB, setMemorySwapMB] = useState<number>(0);
  // CPU cores limit (0 = unlimited)
  const [cpuCores, setCpuCores] = useState<number>(0);
  // CPU Shares
  const [cpuShares, setCpuShares] = useState<number>(1024);
  // Restart Policy
  const [restartPolicy, setRestartPolicy] = useState<string>('unless-stopped');
  const [loading, setLoading] = useState<boolean>(false);

  // Sync with current container config when modal opens
  useEffect(() => {
    if (isOpen && currentHostConfig) {
      const memBytes = currentHostConfig.Memory || 0;
      setMemoryMB(memBytes > 0 ? Math.round(memBytes / (1024 * 1024)) : 0);

      const swapBytes = currentHostConfig.MemorySwap || 0;
      if (swapBytes === -1) {
        setMemorySwapMB(-1);
      } else if (swapBytes > 0) {
        setMemorySwapMB(Math.round(swapBytes / (1024 * 1024)));
      } else {
        setMemorySwapMB(0);
      }

      const quota = currentHostConfig.CpuQuota || 0;
      const period = currentHostConfig.CpuPeriod || 100000;
      if (quota > 0 && period > 0) {
        setCpuCores(parseFloat((quota / period).toFixed(2)));
      } else {
        setCpuCores(0);
      }

      setCpuShares(currentHostConfig.CpuShares || 1024);
      setRestartPolicy(currentHostConfig.RestartPolicy?.Name || 'unless-stopped');
    }
  }, [isOpen, currentHostConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const toastId = toast.loading('Applying live resource limits...');

    try {
      const payload: Record<string, any> = {
        memory: memoryMB > 0 ? memoryMB * 1024 * 1024 : 0,
        memory_swap: memorySwapMB === -1 ? -1 : memorySwapMB > 0 ? memorySwapMB * 1024 * 1024 : 0,
        cpu_shares: cpuShares > 0 ? cpuShares : 1024,
        restart_policy: restartPolicy,
      };

      if (cpuCores > 0) {
        payload.cpu_period = 100000;
        payload.cpu_quota = Math.round(cpuCores * 100000);
      } else {
        payload.cpu_period = 100000;
        payload.cpu_quota = 0; // unlimited
      }

      const endpoint = currentHostId
        ? `/agents/${currentHostId}/containers/${containerId}/update`
        : `/containers/${containerId}/update`;

      const response = await api.post(endpoint, payload);

      if (response.data?.warnings && response.data.warnings.length > 0) {
        toast(response.data.warnings.join(', '), { icon: '⚠️', id: toastId });
      } else {
        toast.success('Container resource limits updated live!', { id: toastId });
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to update container resources', error);
      const msg = error?.response?.data?.message || error?.response?.data?.error || error.message || 'Update failed';
      toast.error(`Resource update failed: ${msg}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => { if (!loading) onClose(); }}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-2xl text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <form onSubmit={handleSubmit}>
                  {/* Header */}
                  <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-500/30 rounded-xl">
                        <WrenchScrewdriverIcon className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <div>
                        <Dialog.Title as="h3" className="text-lg font-bold text-slate-900 dark:text-white">
                          Live Resource Tuning
                        </Dialog.Title>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Container: <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{containerName}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={onClose}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="p-6 space-y-6">
                    {/* Zero-Downtime Guarantee Callout */}
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start space-x-3">
                      <BoltIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        <strong>Zero-Downtime Cgroups Update:</strong> Changes apply instantly via <code className="font-mono bg-emerald-500/20 px-1 py-0.5 rounded">docker update</code> without stopping, terminating, or recreating the running container.
                      </div>
                    </div>

                    {/* Memory Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Memory Limit (RAM)
                        </label>
                        <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                          {memoryMB === 0 ? 'Unlimited' : `${memoryMB} MB (${(memoryMB / 1024).toFixed(2)} GB)`}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2 mb-2">
                        {[0, 256, 512, 1024, 2048].map((mb) => (
                          <button
                            type="button"
                            key={mb}
                            onClick={() => setMemoryMB(mb)}
                            className={clsx(
                              "py-1.5 px-2 text-xs rounded-lg border font-mono transition-all",
                              memoryMB === mb
                                ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-sm"
                                : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                            )}
                          >
                            {mb === 0 ? 'Unlimited' : `${mb}MB`}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          step="64"
                          value={memoryMB}
                          onChange={(e) => setMemoryMB(Math.max(0, parseInt(e.target.value) || 0))}
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Enter custom RAM limit in MB (0 for unlimited)"
                        />
                        <span className="text-xs font-mono text-slate-500">MB</span>
                      </div>
                    </div>

                    {/* CPU Limit */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          CPU Cores Allocation
                        </label>
                        <span className="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                          {cpuCores === 0 ? 'Unlimited' : `${cpuCores} Core${cpuCores > 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-2 mb-2">
                        {[0, 0.5, 1, 2, 4].map((cores) => (
                          <button
                            type="button"
                            key={cores}
                            onClick={() => setCpuCores(cores)}
                            className={clsx(
                              "py-1.5 px-2 text-xs rounded-lg border font-mono transition-all",
                              cpuCores === cores
                                ? "bg-cyan-600 text-white border-cyan-600 font-bold shadow-sm"
                                : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-400"
                            )}
                          >
                            {cores === 0 ? 'Unlimited' : `${cores} Core`}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0"
                          max="128"
                          step="0.1"
                          value={cpuCores}
                          onChange={(e) => setCpuCores(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder="CPU limit (e.g. 1.5, 0 = unlimited)"
                        />
                        <span className="text-xs font-mono text-slate-500">Cores</span>
                      </div>
                    </div>

                    {/* CPU Shares & Restart Policy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          CPU Relative Shares
                        </label>
                        <input
                          type="number"
                          min="2"
                          max="262144"
                          value={cpuShares}
                          onChange={(e) => setCpuShares(parseInt(e.target.value) || 1024)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Default 1024"
                        />
                        <p className="text-[10px] text-slate-400">Relative weight (2 - 262144, standard: 1024)</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Restart Policy
                        </label>
                        <select
                          value={restartPolicy}
                          onChange={(e) => setRestartPolicy(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="unless-stopped">Unless Stopped</option>
                          <option value="always">Always</option>
                          <option value="on-failure">On Failure</option>
                          <option value="no">Never (No)</option>
                        </select>
                        <p className="text-[10px] text-slate-400">How Docker restarts this container upon host boot/crash</p>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3 bg-slate-50/50 dark:bg-slate-800/20">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 rounded-xl transition-all shadow-md shadow-indigo-500/25 disabled:opacity-50"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <CpuChipIcon className="w-4 h-4" />
                      )}
                      <span>{loading ? 'Applying Changes...' : 'Apply Live Limits'}</span>
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

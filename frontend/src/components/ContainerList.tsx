import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChartBarIcon, TrashIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import type { Container, ContainerStats } from '../types';
import { containerService } from '../services/api';

export default function ContainerList() {
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: containers, isLoading } = useQuery<Container[]>({
    queryKey: ['containers'],
    queryFn: () => containerService.list(),
  });

  const { data: containerStats } = useQuery<ContainerStats>({
    queryKey: ['container-stats', selectedContainer],
    queryFn: () => containerService.getStats(selectedContainer!),
    enabled: !!selectedContainer,
    refetchInterval: 2000, // Poll every 2 seconds when stats are visible
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => containerService.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container started successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to start container: ${error.message}`);
    },
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => containerService.stop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container stopped successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to stop container: ${error.message}`);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => containerService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container removed successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to remove container: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 text-indigo-600">
          <ChartBarIcon />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Containers
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            A list of all Docker containers in your system
          </p>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Image
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Ports
                  </th>
                  <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {containers?.map((container) => (
                  <tr key={container.id} onClick={() => setSelectedContainer(container.id)} className="cursor-pointer hover:bg-gray-50">
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                      {container.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          container.status === 'running'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {container.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {container.image}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {container.ports?.join(', ') || 'None'}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                      <div className="flex justify-end space-x-2">
                        {container.status === 'running' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              stopMutation.mutate(container.id);
                            }}
                            className="text-yellow-600 hover:text-yellow-900"
                          >
                            <StopIcon className="h-5 w-5" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startMutation.mutate(container.id);
                            }}
                            className="text-green-600 hover:text-green-900"
                          >
                            <PlayIcon className="h-5 w-5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMutation.mutate(container.id);
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedContainer && containerStats && (
        <div className="mt-6 bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Container Statistics</h3>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">CPU Usage</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  {containerStats.cpuUsage.toFixed(2)}%
                </dd>
              </div>
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Memory Usage</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  {Math.round(containerStats.memoryUsage / 1024 / 1024)} MB
                </dd>
              </div>
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Network I/O</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  ↓{Math.round(containerStats.networkIO.rx / 1024)} KB/s
                  <br />
                  <span className="text-sm text-gray-500">
                    ↑{Math.round(containerStats.networkIO.tx / 1024)} KB/s
                  </span>
                </dd>
              </div>
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <dt className="truncate text-sm font-medium text-gray-500">Disk I/O</dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                  ↓{Math.round(containerStats.diskIO.read / 1024)} KB/s
                  <br />
                  <span className="text-sm text-gray-500">
                    ↑{Math.round(containerStats.diskIO.write / 1024)} KB/s
                  </span>
                </dd>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

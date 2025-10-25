import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dockerService } from '../services/api';

export default function Settings() {
  const [configChanged, setConfigChanged] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => dockerService.getSystemInfo(),
  });

  return (
    <div>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Settings
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              Manage your Docker daemon settings and system preferences
            </p>
          </div>
        </div>

        {isLoading ? (
          <div>Loading settings...</div>
        ) : (
          <div className="mt-8 divide-y divide-gray-200">
            <div className="space-y-10">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">System Information</h3>
                <div className="mt-6 max-w-xl space-y-6">
                  <div className="flex flex-col space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Docker Version</label>
                    <span className="text-sm text-gray-500">{settings?.version || 'Unknown'}</span>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <label className="block text-sm font-medium text-gray-700">API Version</label>
                    <span className="text-sm text-gray-500">{settings?.apiVersion || 'Unknown'}</span>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Operating System</label>
                    <span className="text-sm text-gray-500">{settings?.os || 'Unknown'}</span>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Architecture</label>
                    <span className="text-sm text-gray-500">{settings?.arch || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-10">
                <h3 className="text-lg font-medium leading-6 text-gray-900">System Maintenance</h3>
                <div className="mt-6 max-w-xl space-y-4">
                  <button
                    type="button"
                    onClick={() => dockerService.pruneContainers()}
                    className="inline-flex justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    Prune Unused Containers
                  </button>

                  <button
                    type="button"
                    onClick={() => dockerService.pruneImages()}
                    className="inline-flex justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    Prune Unused Images
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
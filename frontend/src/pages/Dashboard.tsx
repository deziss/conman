import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChartBarIcon, CircleStackIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { dockerService } from '../services/api';

interface SystemInfo {
  containers: number;
  images: number;
  memoryUsage: string;
  cpuUsage: string;
}

export default function Dashboard() {
  const { data: systemInfo, isLoading } = useQuery<SystemInfo>({
    queryKey: ['system-info'],
    queryFn: () => dockerService.getSystemInfo(),
  });

  if (isLoading) {
    return <div>Loading system information...</div>;
  }

  const stats = [
    {
      name: 'Total Containers',
      value: systemInfo?.containers || 0,
      icon: CircleStackIcon,
      change: '+4.75%',
      changeType: 'positive',
    },
    {
      name: 'Total Images',
      value: systemInfo?.images || 0,
      icon: ChartBarIcon,
      change: '+54.02%',
      changeType: 'negative',
    },
    {
      name: 'Memory Usage',
      value: systemInfo?.memoryUsage || '0%',
      icon: CpuChipIcon,
      change: '-1.39%',
      changeType: 'positive',
    },
    {
      name: 'CPU Usage',
      value: systemInfo?.cpuUsage || '0%',
      icon: CpuChipIcon,
      change: '+10.18%',
      changeType: 'negative',
    },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight mb-8">
        Dashboard
      </h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.name}
            className="relative overflow-hidden rounded-lg bg-white px-4 pb-12 pt-5 shadow sm:px-6 sm:pt-6"
          >
            <dt>
              <div className="absolute rounded-md bg-indigo-500 p-3">
                <item.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-gray-500">{item.name}</p>
            </dt>
            <dd className="ml-16 flex items-baseline pb-6 sm:pb-7">
              <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
              <p
                className={`
                  ml-2 flex items-baseline text-sm font-semibold
                  ${item.changeType === 'positive' ? 'text-green-600' : 'text-red-600'}
                `}
              >
                {item.change}
              </p>
            </dd>
          </div>
        ))}
      </div>
    </div>
  );
}
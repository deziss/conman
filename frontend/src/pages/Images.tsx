import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dockerService } from '../services/api';

interface Image {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export default function Images() {
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data: images, isLoading } = useQuery<Image[]>({
    queryKey: ['images'],
    queryFn: () => dockerService.listImages(),
  });

  const removeMutation = useMutation({
    mutationFn: (imageId: string) => dockerService.removeImage(imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });

  const pullMutation = useMutation({
    mutationFn: (imageName: string) => dockerService.pullImage(imageName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });

  const handlePull = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchTerm) {
      pullMutation.mutate(searchTerm);
      setSearchTerm('');
    }
  };

  const filteredImages = images?.filter(
    (image) =>
      image.repository.toLowerCase().includes(searchTerm.toLowerCase()) ||
      image.tag.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Docker Images
          </h2>
          <p className="mt-2 text-sm text-gray-700">
            A list of all Docker images on your system
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <form onSubmit={handlePull} className="flex space-x-2">
            <input
              type="text"
              placeholder="Enter image name to pull"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
            <button
              type="submit"
              disabled={pullMutation.status === 'pending'}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {pullMutation.status === 'pending' ? 'Pulling...' : 'Pull Image'}
            </button>
          </form>
        </div>
      </div>

      {isLoading ? (
        <div>Loading images...</div>
      ) : (
        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0"
                    >
                      Repository
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Tag
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Size
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900"
                    >
                      Created
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredImages?.map((image) => (
                    <tr key={image.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                        {image.repository}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {image.tag}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {image.size}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {image.created}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                        <button
                          onClick={() => removeMutation.mutate(image.id)}
                          disabled={removeMutation.status === 'pending'}
                          className="text-red-600 hover:text-red-900"
                        >
                          {removeMutation.status === 'pending' ? 'Removing...' : 'Remove'}
                          <span className="sr-only">, {image.repository}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
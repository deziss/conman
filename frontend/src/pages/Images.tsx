import { useState, useEffect } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { 
    CloudArrowDownIcon, 
    TrashIcon, 
    Square3Stack3DIcon, 
    ArrowPathIcon,
    TagIcon,
    ClockIcon,
    EyeIcon
} from '@heroicons/react/24/solid';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { InspectModal } from '../components/InspectModal';

interface Image {
  id: string;
  tags: string[];
  size: number;
  created: number;
}

export const Images = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [pullImageName, setPullImageName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);

  const fetchImages = async () => {
    try {
      const { data } = await api.get('/docker/images');
      setImages(data || []);
    } catch (error) {
      console.error("Failed to fetch images", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const handlePullImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pullImageName) return;

    setPulling(true);
    const toastId = toast.loading(`Pulling image ${pullImageName}...`);

    try {
        await api.post('/docker/images/pull', { image: pullImageName });
        toast.success(`Successfully pulled ${pullImageName}`, { id: toastId });
        setPullImageName('');
        fetchImages();
    } catch (error) {
        toast.error(`Failed to pull image ${pullImageName}`, { id: toastId });
    } finally {
        setPulling(false);
    }
  };

  const handleRemoveImage = async (id: string) => {
      if (!confirm('Are you sure you want to remove this image?')) return;
      try {
          await api.delete(`/docker/images/${id}`);
          toast.success('Image removed');
          fetchImages();
      } catch (error) {
          toast.error('Failed to remove image');
      }
  };

  const handleInspect = async (id: string) => {
      console.log('Inspecting image:', id);
      try {
          // Use /docker/inspect endpoint (Simplest)
          const { data } = await api.get(`/docker/inspect?id=${encodeURIComponent(id)}`);
          setInspectData(data);
          setInspectModalOpen(true);
      } catch (error) {
          console.error("Inspect error:", error);
          toast.error("Failed to inspect image");
      }
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1000;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (created: number) => {
      return new Date(created * 1000).toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
          Images
        </h2>
        <GlassCard className="px-4 py-2 flex items-center space-x-2 text-sm text-cyan-600 dark:text-cyan-400 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" role="button" onClick={fetchImages}>
            <ArrowPathIcon className="w-4 h-4" />
            <span>Refresh</span>
        </GlassCard>
      </div>

        {/* Pull Image Section */}
        <GlassCard className="p-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-200 mb-4 flex items-center">
                <CloudArrowDownIcon className="w-5 h-5 mr-2 text-cyan-600 dark:text-cyan-400" />
                Pull New Image
            </h3>
            <form onSubmit={handlePullImage} className="flex gap-4">
                <input 
                    type="text" 
                    value={pullImageName}
                    onChange={(e) => setPullImageName(e.target.value)}
                    placeholder="e.g. alpine:latest, nginx:alpine"
                    className="flex-1 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 rounded-lg px-4 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                />
                <button 
                    type="submit" 
                    disabled={pulling || !pullImageName}
                    className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-cyan-500/20 flex items-center"
                >
                    {pulling ? 'Pulling...' : 'Pull Image'}
                </button>
            </form>
        </GlassCard>

      {/* Image List */}
      <div className="space-y-4">
        {loading ? (
           <div className="text-slate-500 text-center py-10 animate-pulse">Loading images...</div>
        ) : images.length === 0 ? (
            <div className="text-slate-500 text-center py-10">No images found.</div>
        ) : (
            images.map((img) => (
                <GlassCard key={img.id} className="p-4 flex items-center justify-between group hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <div className="flex items-center space-x-4 overflow-hidden">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                            <Square3Stack3DIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
                                <h4 className="font-semibold text-slate-900 dark:text-slate-200 truncate" title={img.tags && img.tags[0]}>
                                    {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[0] : '<none>'}
                                </h4>
                                <span className="text-xs font-mono text-slate-600 dark:text-slate-500 bg-slate-200 dark:bg-slate-900/50 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-800">
                                    {img.tags && img.tags.length > 0 ? img.tags[0].split(':')[1] || 'latest' : '<none>'}
                                </span>
                            </div>
                             <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 font-mono">
                                <span className="flex items-center">
                                    <TagIcon className="w-3 h-3 mr-1" />
                                    {img.id.substring(7, 19)}
                                </span>
                                <span className="flex items-center">
                                    <ClockIcon className="w-3 h-3 mr-1" />
                                    {formatTime(img.created)}
                                </span>
                                <span>
                                    {formatSize(img.size)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="ml-4 flex items-center space-x-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleInspect(img.id); }}
                            className="p-2 text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-500/10 rounded-lg transition-colors"
                            title="Inspect Image"
                        >
                            <EyeIcon className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleRemoveImage(img.id); }}
                            className="p-2 text-slate-500 hover:text-rose-600 dark:hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Remove Image"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                </GlassCard>
            ))
        )}
      </div>

      <InspectModal 
        isOpen={inspectModalOpen} 
        onClose={() => setInspectModalOpen(false)} 
        title="Image Details" 
        data={inspectData} 
      />
    </div>
  );
};

export default Images;
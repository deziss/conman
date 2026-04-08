import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';

interface HostInfo {
    hostname?: string;
    os?: string;
    runtime_type?: string;
    runtime_version?: string;
    docker_version?: string;
    kernel?: string;
    cpu_count?: number;
    mem_total?: number;
}

interface Host {
    id: string;
    name: string;
    host_info?: HostInfo;
    status: string;
    mode?: string;
    containers?: any[];
    images?: any[];
    volumes?: any[];
    networks?: any[];
}

interface HostContextType {
    hosts: Host[];
    currentHost: Host | null;
    setCurrentHost: (host: Host | null) => void;
    refreshHosts: () => Promise<void>;
    loading: boolean;
}

// Special "local" host representing the server's own Docker
// const LOCAL_HOST: Host = { ... }; // Removed in Unified Arch

const HostContext = createContext<HostContextType | undefined>(undefined);

export const HostProvider = ({ children }: { children: ReactNode }) => {
    const [hosts, setHosts] = useState<Host[]>([]);
    const [currentHost, setCurrentHostState] = useState<Host | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshHosts = async () => {
        try {
            const { data } = await api.get('/agents');
            setHosts(data || []);
        } catch (error) {
            console.error('Failed to fetch hosts', error);
            setHosts([]);
        } finally {
            setLoading(false);
        }
    };

    // Load saved host from localStorage on mount
    useEffect(() => {
        refreshHosts();
    }, []);

    // Update current host when hosts are loaded
    useEffect(() => {
        const savedHostId = localStorage.getItem('currentHostId');
        
        if (hosts.length > 0) {
            let selected: Host | undefined;

            // 1. Try to find saved host
            if (savedHostId) {
                selected = hosts.find(h => h.id === savedHostId);
            }

            // 2. If not found, try to find "Local Agent"
            if (!selected) {
                selected = hosts.find(h => h.name === 'Local Agent');
            }

            // 3. Fallback to first available host
            if (!selected) {
                selected = hosts[0];
            }

            setCurrentHostState(selected || null);
            if (selected) {
                 localStorage.setItem('currentHostId', selected.id);
            }
        } else {
            setCurrentHostState(null);
        }
    }, [hosts]);

    const setCurrentHost = (host: Host | null) => {
        setCurrentHostState(host);
        if (host) {
            localStorage.setItem('currentHostId', host.id);
        } else {
            localStorage.removeItem('currentHostId');
        }
    };

    return (
        <HostContext.Provider value={{
            hosts,
            currentHost,
            setCurrentHost,
            refreshHosts,
            loading
        }}>
            {children}
        </HostContext.Provider>
    );
};

export const useHost = () => {
    const context = useContext(HostContext);
    if (context === undefined) {
        throw new Error('useHost must be used within a HostProvider');
    }
    return context;
};

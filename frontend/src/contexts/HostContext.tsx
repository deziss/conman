import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';

interface HostInfo {
    hostname?: string;
    os?: string;
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
    isLocalHost: boolean;
    refreshHosts: () => Promise<void>;
    loading: boolean;
}

// Special "local" host representing the server's own Docker
const LOCAL_HOST: Host = {
    id: 'local',
    name: 'Local Docker',
    status: 'healthy',
    mode: 'local'
};

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
        const savedHostId = localStorage.getItem('currentHostId');
        if (savedHostId && savedHostId !== 'local') {
            // Will be set once hosts are loaded
        } else {
            setCurrentHostState(LOCAL_HOST);
        }
        refreshHosts();
    }, []);

    // Update current host when hosts are loaded
    useEffect(() => {
        const savedHostId = localStorage.getItem('currentHostId');
        if (savedHostId && savedHostId !== 'local') {
            const found = hosts.find(h => h.id === savedHostId);
            if (found) {
                setCurrentHostState(found);
            } else if (currentHost === null) {
                setCurrentHostState(LOCAL_HOST);
            }
        }
    }, [hosts]);

    const setCurrentHost = (host: Host | null) => {
        const selectedHost = host || LOCAL_HOST;
        setCurrentHostState(selectedHost);
        localStorage.setItem('currentHostId', selectedHost.id);
    };

    const isLocalHost = currentHost?.id === 'local';

    return (
        <HostContext.Provider value={{
            hosts,
            currentHost,
            setCurrentHost,
            isLocalHost,
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

// Export LOCAL_HOST for reference
export { LOCAL_HOST };

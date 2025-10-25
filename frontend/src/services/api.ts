import axios from 'axios';
import { Container, ContainerStats, User } from '../types/models';

const api = axios.create({
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add token to requests if available and valid
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        if (authService.isTokenExpired()) {
            localStorage.removeItem('token');
            window.location.href = '/login';
            return Promise.reject('Token expired');
        }
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle authentication errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const containerService = {
    async list(): Promise<Container[]> {
        const response = await api.get('/api/v1/containers');
        return response.data;
    },

    async getStats(containerId: string): Promise<ContainerStats> {
        const response = await api.get(`/api/v1/containers/${containerId}/stats`);
        return response.data;
    },

    async start(containerId: string): Promise<void> {
        await api.post(`/api/v1/containers/${containerId}/start`);
    },

    async stop(containerId: string): Promise<void> {
        await api.post(`/api/v1/containers/${containerId}/stop`);
    },

    async remove(containerId: string): Promise<void> {
        await api.delete(`/api/v1/containers/${containerId}`);
    },
};

export const authService = {
    async login(username: string, password: string): Promise<string> {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        const response = await api.post('/auth/token', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        const token = response.data.access_token;
        localStorage.setItem('token', token);
        return token;
    },

    async getCurrentUser(): Promise<User> {
        const response = await api.get('/api/v1/users/me');
        return response.data;
    },

    logout(): void {
        localStorage.removeItem('token');
    },

    isTokenExpired(): boolean {
        const token = localStorage.getItem('token');
        if (!token) return true;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000; // Convert to milliseconds
            return Date.now() >= exp;
        } catch (e) {
            return true;
        }
    },
};

export const dockerService = {
    async getSystemInfo(): Promise<any> {
        const response = await api.get('/api/v1/docker/system/info');
        return response.data;
    },

    async pruneContainers(): Promise<any> {
        const response = await api.post('/api/v1/docker/prune/containers');
        return response.data;
    },

    async pruneImages(): Promise<any> {
        const response = await api.post('/api/v1/docker/prune/images');
        return response.data;
    },
};
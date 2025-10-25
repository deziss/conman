export interface Container {
    id: string;
    name: string;
    status: string;
    image: string;
    created: string;
    ports: string[];
    state: string;
}

export interface ContainerStats {
    cpuUsage: number;
    memoryUsage: number;
    networkIO: {
        rx: number;
        tx: number;
    };
    diskIO: {
        read: number;
        write: number;
    };
}

export interface User {
    id: number;
    username: string;
    email: string;
    role: string;
    attributes: Record<string, any>;
}

export interface DockerImage {
    id: string;
    repository: string;
    tag: string;
    size: string;
    created: string;
}

export interface SystemInfo {
    version: string;
    apiVersion: string;
    os: string;
    arch: string;
    containers: number;
    images: number;
    memoryUsage: string;
    cpuUsage: string;
}
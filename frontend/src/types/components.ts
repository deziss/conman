import type { ReactNode, ComponentType } from 'react';

export interface NavigationItem {
    name: string;
    href: string;
    icon: ComponentType<any>;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
}

export interface CardProps {
    title: string;
    children: ReactNode;
    className?: string;
}

export interface TabProps {
    label: string;
    value: string;
    icon?: ComponentType<any>;
}

export interface TableProps<T> {
    data: T[];
    columns: {
        header: string;
        accessorKey: keyof T;
        cell?: (row: T) => ReactNode;
    }[];
    isLoading?: boolean;
    emptyMessage?: string;
}

export interface ChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        backgroundColor?: string;
        borderColor?: string;
    }[];
}
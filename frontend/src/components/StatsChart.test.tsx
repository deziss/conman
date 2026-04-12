import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StatsChart } from './StatsChart';
import '@testing-library/jest-dom';

// Mock Recharts since it's hard to test ResponsiveContainer in JSDOM
vi.mock('recharts', async () => {
    const original = await vi.importActual('recharts');
    return {
        ...original,
        ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    };
});

const mockData = [
    { time: '10:00', value: 10.123 },
    { time: '10:01', value: 20.5 },
];

describe('StatsChart', () => {
    it('renders label and current value correctly with unit', () => {
        render(<StatsChart data={mockData} label="CPU" unit="%" />);
        
        expect(screen.getByText('CPU')).toBeInTheDocument();
        // 20.50 % (toFixed(2) and space before unit)
        expect(screen.getByText('20.50 %')).toBeInTheDocument();
    });

    it('renders correctly without unit', () => {
        render(<StatsChart data={mockData} label="Count" />);
        expect(screen.getByText('20.50')).toBeInTheDocument();
    });

    it('renders dash when data is empty', () => {
        render(<StatsChart data={[]} label="RAM" unit="MB" />);
        expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('uses fixed height for the wrapper div', () => {
        const { container } = render(<StatsChart data={mockData} label="CPU" />);
        // When label is present, height should be 120
        const wrapper = container.querySelector('div[style*="height: 120px"]');
        expect(wrapper).toBeInTheDocument();
    });

    it('uses alternative height when no label is present', () => {
        const { container } = render(<StatsChart data={mockData} />);
        // When label is missing, height should be 140
        const wrapper = container.querySelector('div[style*="height: 140px"]');
        expect(wrapper).toBeInTheDocument();
    });
});

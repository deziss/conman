import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DataPoint {
  time: string;
  value: number;
}

interface StatsChartProps {
  data: DataPoint[];
  color?: string;
  unit: string;
  label: string;
}

export const StatsChart = ({ data, color = '#22d3ee', unit, label }: StatsChartProps) => {
  return (
    <div className="h-48 w-full">
      <div className="flex justify-between items-center mb-2 px-2">
         <span className="text-xs font-mono text-slate-400 uppercase">{label}</span>
         <span className="text-sm font-bold text-slate-200">
           {data.length > 0 ? `${data[data.length - 1].value.toFixed(2)}${unit}` : '-'}
         </span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" hide />
          <YAxis domain={[0, 'auto']} hide />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
            itemStyle={{ color: '#e2e8f0', fontSize: '12px', fontFamily: 'monospace' }}
            formatter={(val: number) => [`${val.toFixed(2)}${unit}`, label]}
            labelStyle={{ display: 'none' }}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2}
            fillOpacity={1} 
            fill={`url(#gradient-${label})`} 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

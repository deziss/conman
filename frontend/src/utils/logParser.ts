export interface LogEntry {
  raw: string;
  timestamp: string;
  level: string;
  message: string;
  fields: Record<string, string>;
  id: string; // Unique ID for keying
}

// Simple Logfmt parser
// Basic implementation: key=value or key="value with spaces"
const parseLogfmt = (line: string): Record<string, string> => {
  const fields: Record<string, string> = {};
  // Regex to match key=value where value can be quoted
  // This is a simplified regex and might not cover all edge cases
  const regex = /([a-zA-Z0-9_\-\.]+)=(".*?"|[^"\s]+)/g;
  
  let match;
  while ((match = regex.exec(line)) !== null) {
      const key = match[1];
      let value = match[2];
      // strip quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
      }
      fields[key] = value;
  }
  return fields;
};

// Colors for levels
export const getLevelColorClass = (level: string) => {
    if (!level || typeof level !== 'string') return 'text-slate-300';
    const l = level.toLowerCase();
    if (l === 'error' || l === 'err' || l === 'fatal' || l === 'crit') return 'text-rose-400';
    if (l === 'warn' || l === 'warning') return 'text-amber-400';
    if (l === 'info') return 'text-emerald-400';
    if (l === 'debug') return 'text-blue-400';
    return 'text-slate-300';
};

export const parseLogLine = (line: string, index: number): LogEntry => {
    const entry: LogEntry = {
        raw: line,
        timestamp: '',
        level: '',
        message: '',
        fields: {},
        id: `log-${index}-${Date.now()}` // simplified ID
    };

    // 1. Try JSON
    try {
        if (line.trim().startsWith('{')) {
            const json = JSON.parse(line);
            entry.fields = {};
            
            // Standardize generic JSON fields to string map
            for (const [k, v] of Object.entries(json)) {
                if (typeof v === 'object') {
                    entry.fields[k] = JSON.stringify(v);
                } else {
                    entry.fields[k] = String(v);
                }
            }

            // Extract Standard Fields
            entry.timestamp = entry.fields['time'] || entry.fields['timestamp'] || entry.fields['date'] || '';
            entry.level = entry.fields['level'] || entry.fields['severity'] || '';
            entry.message = entry.fields['msg'] || entry.fields['message'] || entry.fields['error'] || '';
            
            return entry;
        }
    } catch (e) {
        // Not JSON, continue
    }

    // 2. Try Logfmt (Heuristic: contains "=" and doesn't start with typical text)
    // Actually, let's just run regex. If we find > 1 fields, assume it's structured.
    const fields = parseLogfmt(line);
    if (Object.keys(fields).length > 0) {
        entry.fields = fields;
        entry.timestamp = fields['time'] || fields['ts'] || fields['date'] || '';
        entry.level = fields['level'] || fields['lvl'] || '';
        entry.message = fields['msg'] || fields['message'] || fields['err'] || '';
        
        // If we didn't find specific fields but found others, standard might be implied or positioned
        // But for "Grafana-like" usually explicit keys are used.
        
        return entry;
    }

    // 3. Fallback: Raw Text
    // Try to extract timestamp if docker raw format?
    // "2024-01-01T... msg"
    const dockerMatch = line.match(/^(\d{4}-\d{2}-\d{2}T.*?) (.*)/);
    if (dockerMatch) {
        entry.timestamp = dockerMatch[1];
        entry.message = dockerMatch[2];
        
        // Detect level in message
        const lowerMsg = entry.message.toLowerCase();
        if (lowerMsg.includes('error')) entry.level = 'ERROR';
        else if (lowerMsg.includes('warn')) entry.level = 'WARN';
        else if (lowerMsg.includes('info')) entry.level = 'INFO';
    } else {
        entry.message = line;
    }

    return entry;
};

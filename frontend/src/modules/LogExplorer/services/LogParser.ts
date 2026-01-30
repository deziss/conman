
export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  level: 'info' | 'warn' | 'error' | 'debug' | 'trace' | 'unknown';
  message: string;
  fields: Record<string, string>; // Structured fields
  raw: string;
}

// Helper to determine level from string
const detectLevel = (text: string): LogEntry['level'] => {
  const t = text.toLowerCase();
  if (t.includes('err') || t.includes('fatal') || t.includes('crit')) return 'error';
  if (t.includes('warn')) return 'warn';
  if (t.includes('info')) return 'info';
  if (t.includes('debug')) return 'debug';
  if (t.includes('trace')) return 'trace';
  return 'unknown';
};

export class LogParser {
  static parse(line: string, index: number): LogEntry {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: '',
      level: 'unknown',
      message: '',
      fields: {},
      raw: line,
    };

    if (!line || !line.trim()) return entry;

    // 1. Try JSON
    if (line.trim().startsWith('{')) {
      try {
        const json = JSON.parse(line);
        // Flatten simple objects? or just keep 1 level
        // Standardize generic fields
        const keys = Object.keys(json);
        keys.forEach(k => {
          const val = json[k];
          if (typeof val === 'object' && val !== null) {
              entry.fields[k] = JSON.stringify(val);
          } else {
              entry.fields[k] = String(val);
          }
        });

        // Extract Standard Fields
        entry.timestamp = entry.fields['time'] || entry.fields['timestamp'] || entry.fields['date'] || entry.fields['ts'] || '';
        
        const lvl = entry.fields['level'] || entry.fields['severity'] || entry.fields['lvl'];
        if (lvl) entry.level = detectLevel(lvl);
        
        entry.message = entry.fields['msg'] || entry.fields['message'] || entry.fields['error'] || entry.fields['err'] || '';
        
        // If message is empty but we have raw json, maybe use that? 
        // Or if message is empty, use the remaining fields?
        if (!entry.message) {
             // Fallback to raw if no message found, or construct one
             entry.message = line; 
        }

        return entry;
      } catch (e) {
        // Not JSON
      }
    }

    // 2. Try Logfmt / Key-Value
    // Regex for key=value
    const logfmtRegex = /([a-zA-Z0-9_\-\.]+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
    let match;
    let hasFields = false;
    while ((match = logfmtRegex.exec(line)) !== null) {
      hasFields = true;
      const key = match[1];
      let value = match[2];
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/\\"/g, '"');
      }
      entry.fields[key] = value;
    }

    if (hasFields) {
        entry.timestamp = entry.fields['time'] || entry.fields['ts'] || entry.fields['date'] || '';
        const lvl = entry.fields['level'] || entry.fields['lvl'] || entry.fields['severity'];
        if (lvl) entry.level = detectLevel(lvl);
        entry.message = entry.fields['msg'] || entry.fields['message'] || entry.fields['error'] || '';
        
        // If message is still empty, maybe the whole line is the message minus fields?
        // Or just show raw.
        if (!entry.message) {
            // entry.message = line; // Logic: show raw line if no specific msg field
            // Or try to strip fields?
            // Let's stick to raw for message if explicit msg field missing to avoid hiding info
             entry.message = line;
        }
    } else {
        // 3. Raw Text
        // Try to extract Docker timestamp: "2024-01-01T... msg"
        const dockerMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*?) (.*)/);
        if (dockerMatch) {
            entry.timestamp = dockerMatch[1];
            entry.message = dockerMatch[2];
        } else {
            entry.message = line;
        }
        entry.level = detectLevel(entry.message);
    }

    return entry;
  }
}

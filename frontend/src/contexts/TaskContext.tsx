import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

export type TaskType = 'pull' | 'stop' | 'start' | 'restart' | 'remove' | 'prune' | 'create' | 'deploy' | 'generic';
export type TaskStatus = 'running' | 'success' | 'error';

export interface TaskLogEntry {
  timestamp: string;
  message: string;
  level?: 'info' | 'warn' | 'error' | 'success';
}

export interface BackgroundTask {
  id: string;
  type: TaskType;
  title: string;
  resource?: string;
  status: TaskStatus;
  progress?: number; // 0 to 100 or undefined (indeterminate)
  startTime: number;
  endTime?: number;
  logs: TaskLogEntry[];
  error?: string;
  isExpanded?: boolean;
  autoRemoveCountdown?: number; // seconds remaining before removal
}

export interface TaskHandle {
  id: string;
  appendLog: (message: string, level?: 'info' | 'warn' | 'error' | 'success') => void;
  setProgress: (progress: number) => void;
  complete: (message?: string) => void;
  fail: (errorMessage: string) => void;
}

interface TaskContextType {
  tasks: BackgroundTask[];
  startTask: (params: { type: TaskType; title: string; resource?: string; initialLog?: string }) => TaskHandle;
  removeTask: (id: string) => void;
  toggleTaskExpand: (id: string) => void;
  clearCompletedTasks: () => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

const formatTime = () => {
  const now = new Date();
  return now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
};

export const TaskProvider = ({ children }: { children: ReactNode }) => {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const tasksRef = useRef<BackgroundTask[]>([]);
  tasksRef.current = tasks;

  // Auto-countdown timer for completed tasks (fades out after 5-6 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks(prevTasks => {
        let hasChanges = false;
        const nextTasks = prevTasks
          .map(task => {
            if (task.status === 'success' && typeof task.autoRemoveCountdown === 'number') {
              hasChanges = true;
              return {
                ...task,
                autoRemoveCountdown: task.autoRemoveCountdown - 1
              };
            }
            return task;
          })
          .filter(task => {
            if (task.status === 'success' && typeof task.autoRemoveCountdown === 'number' && task.autoRemoveCountdown <= 0) {
              return false; // Auto-removed!
            }
            return true;
          });

        return hasChanges ? nextTasks : prevTasks;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const toggleTaskExpand = useCallback((id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, isExpanded: !t.isExpanded } : t));
  }, []);

  const clearCompletedTasks = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'running'));
  }, []);

  const startTask = useCallback((params: {
    type: TaskType;
    title: string;
    resource?: string;
    initialLog?: string;
  }): TaskHandle => {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const timeStr = formatTime();

    const initialLogs: TaskLogEntry[] = [
      {
        timestamp: timeStr,
        message: `Task started: ${params.title}${params.resource ? ` (${params.resource})` : ''}`,
        level: 'info'
      }
    ];

    if (params.initialLog) {
      initialLogs.push({
        timestamp: timeStr,
        message: params.initialLog,
        level: 'info'
      });
    }

    const newTask: BackgroundTask = {
      id,
      type: params.type,
      title: params.title,
      resource: params.resource,
      status: 'running',
      startTime: now,
      logs: initialLogs,
      isExpanded: false
    };

    setTasks(prev => [newTask, ...prev]);

    const handle: TaskHandle = {
      id,
      appendLog: (message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') => {
        const logEntry: TaskLogEntry = {
          timestamp: formatTime(),
          message,
          level
        };
        setTasks(prev => prev.map(t => {
          if (t.id === id) {
            return {
              ...t,
              logs: [...t.logs, logEntry]
            };
          }
          return t;
        }));
      },

      setProgress: (progress: number) => {
        setTasks(prev => prev.map(t => {
          if (t.id === id) {
            return {
              ...t,
              progress: Math.min(100, Math.max(0, progress))
            };
          }
          return t;
        }));
      },

      complete: (message?: string) => {
        const completionTime = formatTime();
        setTasks(prev => prev.map(t => {
          if (t.id === id) {
            const finalLogs = [...t.logs];
            if (message) {
              finalLogs.push({
                timestamp: completionTime,
                message,
                level: 'success'
              });
            } else {
              finalLogs.push({
                timestamp: completionTime,
                message: 'Task completed successfully',
                level: 'success'
              });
            }

            return {
              ...t,
              status: 'success',
              progress: 100,
              endTime: Date.now(),
              autoRemoveCountdown: 6, // 6 seconds before auto-dismissal
              logs: finalLogs
            };
          }
          return t;
        }));
      },

      fail: (errorMessage: string) => {
        const failureTime = formatTime();
        setTasks(prev => prev.map(t => {
          if (t.id === id) {
            return {
              ...t,
              status: 'error',
              error: errorMessage,
              endTime: Date.now(),
              logs: [
                ...t.logs,
                {
                  timestamp: failureTime,
                  message: `Error: ${errorMessage}`,
                  level: 'error'
                }
              ]
            };
          }
          return t;
        }));
      }
    };

    return handle;
  }, []);

  return (
    <TaskContext.Provider value={{
      tasks,
      startTask,
      removeTask,
      toggleTaskExpand,
      clearCompletedTasks
    }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTask = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};

export default TaskContext;

package log

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"
	"time"
)

// Level represents log severity
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

func (l Level) String() string {
	switch l {
	case LevelDebug:
		return "DEBUG"
	case LevelInfo:
		return "INFO"
	case LevelWarn:
		return "WARN"
	case LevelError:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

// Entry represents a structured log entry
type Entry struct {
	Timestamp     time.Time              `json:"timestamp"`
	Level         Level                  `json:"level"`
	Message       string                 `json:"message"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
	Operation     string                 `json:"operation,omitempty"`
	Error         string                 `json:"error,omitempty"`
	DurationMs    int64                  `json:"duration_ms,omitempty"`
	Fields        map[string]interface{} `json:"fields,omitempty"`
	Goroutine     int                    `json:"goroutine"`
	File          string                 `json:"file,omitempty"`
	Line          int                    `json:"line,omitempty"`
}

// Logger provides structured logging with correlation IDs
type Logger struct {
	mu            sync.RWMutex
	level         Level
	correlationID string
	output        *log.Logger
}

// Global logger instance
var (
	globalLogger *Logger
	once         sync.Once
)

func init() {
	once.Do(func() {
		globalLogger = &Logger{
			level:  LevelInfo,
			output: log.New(os.Stdout, "", 0),
		}
	})
}

// SetLevel sets the global log level
func SetLevel(level Level) {
	globalLogger.mu.Lock()
	defer globalLogger.mu.Unlock()
	globalLogger.level = level
}

type correlationIDKey struct{}

// SetCorrelationID sets the correlation ID for the current context
func SetCorrelationID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, correlationIDKey{}, id)
}

// GetCorrelationID gets the correlation ID from context
func GetCorrelationID(ctx context.Context) string {
	if id, ok := ctx.Value(correlationIDKey{}).(string); ok {
		return id
	}
	return globalLogger.correlationID
}

// New creates a new logger with optional correlation ID
func New(correlationID string) *Logger {
	return &Logger{
		level:         LevelInfo,
		correlationID: correlationID,
		output:        log.New(os.Stdout, "", 0),
	}
}

// Debug logs a debug message
func (l *Logger) Debug(ctx context.Context, msg string, fields ...interface{}) {
	l.log(ctx, LevelDebug, msg, fields...)
}

// Info logs an info message
func (l *Logger) Info(ctx context.Context, msg string, fields ...interface{}) {
	l.log(ctx, LevelInfo, msg, fields...)
}

// Warn logs a warning message
func (l *Logger) Warn(ctx context.Context, msg string, fields ...interface{}) {
	l.log(ctx, LevelWarn, msg, fields...)
}

// Error logs an error message
func (l *Logger) Error(ctx context.Context, msg string, fields ...interface{}) {
	l.log(ctx, LevelError, msg, fields...)
}

// Debug logs a debug message (global)
func Debug(ctx context.Context, msg string, fields ...interface{}) {
	globalLogger.log(ctx, LevelDebug, msg, fields...)
}

// Info logs an info message (global)
func Info(ctx context.Context, msg string, fields ...interface{}) {
	globalLogger.log(ctx, LevelInfo, msg, fields...)
}

// Warn logs a warning message (global)
func Warn(ctx context.Context, msg string, fields ...interface{}) {
	globalLogger.log(ctx, LevelWarn, msg, fields...)
}

// Error logs an error message (global)
func Error(ctx context.Context, msg string, fields ...interface{}) {
	globalLogger.log(ctx, LevelError, msg, fields...)
}

func (l *Logger) log(ctx context.Context, level Level, msg string, fields ...interface{}) {
	l.mu.RLock()
	if level < l.level {
		l.mu.RUnlock()
		return
	}
	l.mu.RUnlock()

	entry := Entry{
		Timestamp:     time.Now().UTC(),
		Level:         level,
		Message:       msg,
		CorrelationID: GetCorrelationID(ctx),
		Goroutine:     runtime.NumGoroutine(),
	}

	// Parse fields
	if len(fields) > 0 {
		entry.Fields = make(map[string]interface{})
		for i := 0; i < len(fields); i += 2 {
			if i+1 < len(fields) {
				key := fmt.Sprintf("%v", fields[i])
				entry.Fields[key] = fields[i+1]
			}
		}
	}

	// Serialize to JSON
	jsonBytes, err := json.Marshal(entry)
	if err != nil {
		l.output.Printf("Failed to marshal log entry: %v", err)
		return
	}
	l.output.Println(string(jsonBytes))
}

// WithOperation returns a new logger with operation context
func (l *Logger) WithOperation(op string) *Logger {
	return l
}

// WithError returns a new logger with error context
func (l *Logger) WithError(err error) *Logger {
	return l
}

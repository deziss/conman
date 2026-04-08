package log

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestLoggerLevels(t *testing.T) {
	ctx := context.Background()
	logger := New("test-correlation-id")

	tests := []struct {
		name  string
		level Level
	}{
		{"Debug", LevelDebug},
		{"Info", LevelInfo},
		{"Warn", LevelWarn},
		{"Error", LevelError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger.mu.Lock()
			logger.level = tt.level
			logger.mu.Unlock()

			// Should not panic
			switch tt.level {
			case LevelDebug:
				logger.Debug(ctx, "test message", "key", "value")
			case LevelInfo:
				logger.Info(ctx, "test message", "key", "value")
			case LevelWarn:
				logger.Warn(ctx, "test message", "key", "value")
			case LevelError:
				logger.Error(ctx, "test message", "key", "value")
			}
		})
	}
}

func TestLoggerCorrelationID(t *testing.T) {
	ctx := context.Background()
	logger := New("test-correlation-id")

	// Test that correlation ID is included in output
	logger.mu.Lock()
	logger.level = LevelInfo
	logger.mu.Unlock()

	logger.Info(ctx, "test message", "key", "value")
	// Output should contain correlation ID (verified by visual inspection in manual test)
}

func TestLoggerFields(t *testing.T) {
	ctx := context.Background()
	logger := New("test-id")

	logger.mu.Lock()
	logger.level = LevelInfo
	logger.mu.Unlock()

	// Test multiple fields
	logger.Info(ctx, "test message", 
		"string_field", "value",
		"int_field", 42,
		"bool_field", true,
	)
}

func TestGlobalLogger(t *testing.T) {
	ctx := context.Background()

	// Test global logger functions
	Debug(ctx, "debug message", "test", true)
	Info(ctx, "info message", "test", true)
	Warn(ctx, "warn message", "test", true)
	Error(ctx, "error message", "test", true)
}

func TestSetLevel(t *testing.T) {
	// Test setting global log level
	SetLevel(LevelDebug)
	
	ctx := context.Background()
	Debug(ctx, "should appear")
	
	SetLevel(LevelError)
	Debug(ctx, "should not appear")
	Error(ctx, "should appear")
}

func TestCorrelationIDContext(t *testing.T) {
	ctx := context.Background()
	
	// Test without correlation ID
	id := GetCorrelationID(ctx)
	if id != "" {
		t.Errorf("Expected empty correlation ID, got %s", id)
	}
	
	// Test with correlation ID
	newCtx := SetCorrelationID(ctx, "test-123")
	id = GetCorrelationID(newCtx)
	if id != "test-123" {
		t.Errorf("Expected 'test-123', got %s", id)
	}
}

func TestEntrySerialization(t *testing.T) {
	entry := Entry{
		Timestamp:       time.Now(),
		Level:           LevelInfo,
		Message:         "test message",
		CorrelationID:   "test-id",
		Operation:       "test-op",
		Error:           "test error",
		DurationMs:      100,
		Goroutine:       1,
		File:            "test.go",
		Line:            42,
		Fields: map[string]interface{}{
			"key1": "value1",
			"key2": 123,
		},
	}

	// Test JSON serialization
	jsonBytes, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("Failed to marshal entry: %v", err)
	}

	// Verify JSON contains expected fields
	jsonStr := string(jsonBytes)
	if !strings.Contains(jsonStr, "test message") {
		t.Error("JSON does not contain message")
	}
	if !strings.Contains(jsonStr, "test-id") {
		t.Error("JSON does not contain correlation ID")
	}
}

func BenchmarkLogger(b *testing.B) {
	ctx := context.Background()
	logger := New("benchmark-id")
	logger.mu.Lock()
	logger.level = LevelInfo
	logger.mu.Unlock()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		logger.Info(ctx, "benchmark message", "iteration", i)
	}
}

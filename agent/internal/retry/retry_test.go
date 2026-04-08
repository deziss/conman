package retry

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDo_Success(t *testing.T) {
	attempts := 0
	cfg := DefaultConfig()
	ctx := context.Background()

	err := Do(ctx, cfg, func() error {
		attempts++
		return nil
	})

	if err != nil {
		t.Fatalf("Do() returned error: %v", err)
	}
	if attempts != 1 {
		t.Errorf("Expected 1 attempt, got %d", attempts)
	}
}

func TestDo_RetryOnFailure(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cfg := Config{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		Timeout:       0,
	}

	attempts := 0
	maxFailures := 2

	err := Do(ctx, cfg, func() error {
		attempts++
		if attempts <= maxFailures {
			return errors.New("temporary failure")
		}
		return nil
	})

	if err != nil {
		t.Fatalf("Do() returned error: %v", err)
	}
	if attempts != maxFailures+1 {
		t.Errorf("Expected %d attempts, got %d", maxFailures+1, attempts)
	}
}

func TestDo_MaxAttemptsExceeded(t *testing.T) {
	ctx := context.Background()
	cfg := Config{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		Timeout:       0,
	}

	attempts := 0
	err := Do(ctx, cfg, func() error {
		attempts++
		return errors.New("permanent failure")
	})

	if err == nil {
		t.Fatal("Do() should have returned an error")
	}
	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
}

func TestDo_ContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cfg := Config{
		MaxAttempts:   10,
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		Timeout:       0,
	}

	attempts := 0
	go func() {
		time.Sleep(150 * time.Millisecond)
		cancel()
	}()

	err := Do(ctx, cfg, func() error {
		attempts++
		return errors.New("failure")
	})

	if err == nil {
		t.Fatal("Do() should have returned an error")
	}
	if attempts < 2 {
		t.Errorf("Expected at least 2 attempts, got %d", attempts)
	}
}

func TestDoWithResult_Success(t *testing.T) {
	ctx := context.Background()
	cfg := DefaultConfig()

	result, err := DoWithResult(ctx, cfg, func() (int, error) {
		return 42, nil
	})

	if err != nil {
		t.Fatalf("DoWithResult() returned error: %v", err)
	}
	if result != 42 {
		t.Errorf("Expected 42, got %d", result)
	}
}

func TestDoWithResult_RetryOnFailure(t *testing.T) {
	ctx := context.Background()
	cfg := Config{
		MaxAttempts:   3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
		Timeout:       0,
	}

	attempts := 0
	result, err := DoWithResult(ctx, cfg, func() (int, error) {
		attempts++
		if attempts < 3 {
			return 0, errors.New("temporary failure")
		}
		return 100, nil
	})

	if err != nil {
		t.Fatalf("DoWithResult() returned error: %v", err)
	}
	if result != 100 {
		t.Errorf("Expected 100, got %d", result)
	}
	if attempts != 3 {
		t.Errorf("Expected 3 attempts, got %d", attempts)
	}
}

func TestCalculateDelay(t *testing.T) {
	cfg := Config{
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      10 * time.Second,
		BackoffFactor: 2.0,
	}

	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{1, 100 * time.Millisecond},      // 100 * 2^0
		{2, 200 * time.Millisecond},      // 100 * 2^1
		{3, 400 * time.Millisecond},      // 100 * 2^2
		{10, 10 * time.Second},           // capped at max
		{20, 10 * time.Second},           // still capped
	}

	for _, tt := range tests {
		delay := calculateDelay(tt.attempt, cfg)
		if delay != tt.expected {
			t.Errorf("attempt %d: expected %v, got %v", tt.attempt, tt.expected, delay)
		}
	}
}

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		retryable bool
	}{
		{"nil error", nil, false},
		{"connection refused", errors.New("connection refused"), true},
		{"connection reset", errors.New("connection reset"), true},
		{"timeout", errors.New("i/o timeout"), true},
		{"network unreachable", errors.New("network is unreachable"), true},
		{"permanent error", errors.New("permanent error"), false},
		{"validation error", errors.New("invalid input"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			retryable := IsRetryable(tt.err)
			if retryable != tt.retryable {
				t.Errorf("IsRetryable() = %v, want %v", retryable, tt.retryable)
			}
		})
	}
}

func TestConfigModifiers(t *testing.T) {
	cfg := DefaultConfig()

	cfg = cfg.WithMaxAttempts(5)
	if cfg.MaxAttempts != 5 {
		t.Errorf("MaxAttempts = %d, want 5", cfg.MaxAttempts)
	}

	cfg = cfg.WithInitialDelay(500 * time.Millisecond)
	if cfg.InitialDelay != 500*time.Millisecond {
		t.Errorf("InitialDelay = %v, want 500ms", cfg.InitialDelay)
	}

	cfg = cfg.WithMaxDelay(30 * time.Second)
	if cfg.MaxDelay != 30*time.Second {
		t.Errorf("MaxDelay = %v, want 30s", cfg.MaxDelay)
	}

	cfg = cfg.WithTimeout(60 * time.Second)
	if cfg.Timeout != 60*time.Second {
		t.Errorf("Timeout = %v, want 60s", cfg.Timeout)
	}
}

func BenchmarkDo_Success(b *testing.B) {
	ctx := context.Background()
	cfg := DefaultConfig()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Do(ctx, cfg, func() error {
			return nil
		})
	}
}

func BenchmarkDo_Retry(b *testing.B) {
	ctx := context.Background()
	cfg := Config{
		MaxAttempts:   3,
		InitialDelay:  1 * time.Millisecond,
		MaxDelay:      10 * time.Millisecond,
		BackoffFactor: 2.0,
		Timeout:       0,
	}

	attempts := 0
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		attempts = 0
		Do(ctx, cfg, func() error {
			attempts++
			if attempts < 2 {
				return errors.New("fail")
			}
			return nil
		})
	}
}

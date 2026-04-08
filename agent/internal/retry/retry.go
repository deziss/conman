package retry

import (
	"context"
	"fmt"
	"math"
	"time"
)

// Config defines retry behavior
type Config struct {
	MaxAttempts   int           // Maximum number of attempts (default: 3)
	InitialDelay  time.Duration // Initial delay between retries (default: 100ms)
	MaxDelay      time.Duration // Maximum delay between retries (default: 10s)
	BackoffFactor float64       // Multiplier for exponential backoff (default: 2.0)
	Timeout       time.Duration // Overall timeout for all attempts (default: 30s)
}

// DefaultConfig returns a sensible default configuration
func DefaultConfig() Config {
	return Config{
		MaxAttempts:   3,
		InitialDelay:  100 * time.Millisecond,
		MaxDelay:      10 * time.Second,
		BackoffFactor: 2.0,
		Timeout:       30 * time.Second,
	}
}

// WithMaxAttempts sets maximum retry attempts
func (c Config) WithMaxAttempts(n int) Config {
	c.MaxAttempts = n
	return c
}

// WithInitialDelay sets initial retry delay
func (c Config) WithInitialDelay(d time.Duration) Config {
	c.InitialDelay = d
	return c
}

// WithMaxDelay sets maximum retry delay
func (c Config) WithMaxDelay(d time.Duration) Config {
	c.MaxDelay = d
	return c
}

// WithTimeout sets overall timeout
func (c Config) WithTimeout(d time.Duration) Config {
	c.Timeout = d
	return c
}

// Do executes the given function with retry logic
func Do(ctx context.Context, cfg Config, fn func() error) error {
	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = 3
	}
	if cfg.InitialDelay <= 0 {
		cfg.InitialDelay = 100 * time.Millisecond
	}
	if cfg.MaxDelay <= 0 {
		cfg.MaxDelay = 10 * time.Second
	}
	if cfg.BackoffFactor <= 0 {
		cfg.BackoffFactor = 2.0
	}

	var lastErr error
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		// Check overall timeout
		if cfg.Timeout > 0 {
			deadline, ok := ctx.Deadline()
			if ok && time.Now().After(deadline) {
				return fmt.Errorf("retry timeout after %d attempts: %w", attempt-1, lastErr)
			}
		}

		err := fn()
		if err == nil {
			return nil
		}
		lastErr = err

		// Don't sleep after last attempt
		if attempt == cfg.MaxAttempts {
			break
		}

		// Calculate delay with exponential backoff
		delay := calculateDelay(attempt, cfg)

		// Wait for delay or context cancellation
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled after %d attempts: %w", attempt, lastErr)
		case <-time.After(delay):
			// Continue to next attempt
		}
	}

	return fmt.Errorf("failed after %d attempts: %w", cfg.MaxAttempts, lastErr)
}

// DoWithResult executes the given function with retry logic and returns the result
func DoWithResult[T any](ctx context.Context, cfg Config, fn func() (T, error)) (T, error) {
	var zero T
	if cfg.MaxAttempts <= 0 {
		cfg.MaxAttempts = 3
	}
	if cfg.InitialDelay <= 0 {
		cfg.InitialDelay = 100 * time.Millisecond
	}
	if cfg.MaxDelay <= 0 {
		cfg.MaxDelay = 10 * time.Second
	}
	if cfg.BackoffFactor <= 0 {
		cfg.BackoffFactor = 2.0
	}

	var lastErr error
	for attempt := 1; attempt <= cfg.MaxAttempts; attempt++ {
		// Check overall timeout
		if cfg.Timeout > 0 {
			deadline, ok := ctx.Deadline()
			if ok && time.Now().After(deadline) {
				return zero, fmt.Errorf("retry timeout after %d attempts: %w", attempt-1, lastErr)
			}
		}

		result, err := fn()
		if err == nil {
			return result, nil
		}
		lastErr = err

		// Don't sleep after last attempt
		if attempt == cfg.MaxAttempts {
			break
		}

		// Calculate delay with exponential backoff
		delay := calculateDelay(attempt, cfg)

		// Wait for delay or context cancellation
		select {
		case <-ctx.Done():
			return zero, fmt.Errorf("context cancelled after %d attempts: %w", attempt, lastErr)
		case <-time.After(delay):
			// Continue to next attempt
		}
	}

	return zero, fmt.Errorf("failed after %d attempts: %w", cfg.MaxAttempts, lastErr)
}

// calculateDelay calculates the delay for a given attempt using exponential backoff
func calculateDelay(attempt int, cfg Config) time.Duration {
	// Exponential backoff: initialDelay * (backoffFactor ^ (attempt - 1))
	delay := float64(cfg.InitialDelay) * math.Pow(cfg.BackoffFactor, float64(attempt-1))

	// Cap at max delay
	if delay > float64(cfg.MaxDelay) {
		delay = float64(cfg.MaxDelay)
	}

	return time.Duration(delay)
}

// IsRetryable checks if an error should be retried
func IsRetryable(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()
	retryablePatterns := []string{
		"connection refused",
		"connection reset",
		"connection timeout",
		"i/o timeout",
		"network is unreachable",
		"temporary failure",
		"try again",
	}

	for _, pattern := range retryablePatterns {
		if contains(errStr, pattern) {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

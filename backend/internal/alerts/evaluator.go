package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"conman-backend/internal/models"

	"gorm.io/gorm"
)

// AgentStateProvider is implemented by AgentHandler to expose agent state for evaluation.
type AgentStateProvider interface {
	GetAgentStates() map[string]AgentInfo
}

// AgentInfo is a minimal view of agent state needed for alert evaluation.
type AgentInfo struct {
	ID            string
	Name          string
	Status        string
	LastHeartbeat time.Time
	Containers    int
}

// AgentOfflineConfig is the JSON config for "agent_offline" rules.
type AgentOfflineConfig struct {
	TimeoutMinutes int `json:"timeout_minutes"` // How long before considered offline (default 5)
}

// WebhookChannelConfig is the JSON config for "webhook" channels.
type WebhookChannelConfig struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers,omitempty"`
}

// WebhookPayload is sent to webhook channels when an alert fires.
type WebhookPayload struct {
	AlertName string    `json:"alert_name"`
	RuleType  string    `json:"rule_type"`
	AgentID   string    `json:"agent_id,omitempty"`
	AgentName string    `json:"agent_name,omitempty"`
	Message   string    `json:"message"`
	FiredAt   time.Time `json:"fired_at"`
	Severity  string    `json:"severity"`
}

// Evaluator periodically checks alert rules against current system state.
type Evaluator struct {
	db       *gorm.DB
	provider AgentStateProvider
	interval time.Duration
}

// NewEvaluator creates a new alert evaluator.
func NewEvaluator(db *gorm.DB, provider AgentStateProvider) *Evaluator {
	return &Evaluator{
		db:       db,
		provider: provider,
		interval: 60 * time.Second,
	}
}

// Run starts the evaluator loop. Blocks until context is cancelled.
func (e *Evaluator) Run(ctx context.Context) {
	log.Println("Alert evaluator started (interval: 60s)")
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("Alert evaluator stopped")
			return
		case <-ticker.C:
			e.evaluate()
		}
	}
}

func (e *Evaluator) evaluate() {
	var rules []models.AlertRule
	if err := e.db.Where("enabled = ?", true).Find(&rules).Error; err != nil {
		log.Printf("Alert evaluator: failed to load rules: %v", err)
		return
	}

	if len(rules) == 0 {
		return
	}

	states := e.provider.GetAgentStates()

	for _, rule := range rules {
		switch rule.Type {
		case "agent_offline":
			e.evaluateAgentOffline(rule, states)
		default:
			log.Printf("Alert evaluator: unknown rule type %q", rule.Type)
		}
	}
}

func (e *Evaluator) evaluateAgentOffline(rule models.AlertRule, states map[string]AgentInfo) {
	cfg := AgentOfflineConfig{TimeoutMinutes: 5}
	if len(rule.Config) > 0 {
		json.Unmarshal(rule.Config, &cfg)
	}
	if cfg.TimeoutMinutes <= 0 {
		cfg.TimeoutMinutes = 5
	}

	timeout := time.Duration(cfg.TimeoutMinutes) * time.Minute

	for _, agent := range states {
		if time.Since(agent.LastHeartbeat) > timeout {
			// Check if we already have an unresolved alert for this agent+rule
			var existing models.AlertEvent
			err := e.db.Where("rule_id = ? AND agent_id = ? AND resolved = ?", rule.ID, agent.ID, false).First(&existing).Error
			if err == nil {
				continue // Already alerted, skip
			}

			msg := fmt.Sprintf("Agent %q (%s) has been offline for >%d minutes (last heartbeat: %s)",
				agent.Name, agent.ID[:8], cfg.TimeoutMinutes, agent.LastHeartbeat.Format(time.RFC3339))

			// Record the alert event
			event := models.AlertEvent{
				RuleID:  rule.ID,
				AgentID: agent.ID,
				Message: msg,
				FiredAt: time.Now(),
			}
			e.db.Create(&event)

			log.Printf("ALERT FIRED: %s", msg)
			e.notify(rule, agent, msg)
		} else {
			// Resolve any existing alert for this agent if it's back online
			e.db.Model(&models.AlertEvent{}).
				Where("rule_id = ? AND agent_id = ? AND resolved = ?", rule.ID, agent.ID, false).
				Update("resolved", true)
		}
	}
}

func (e *Evaluator) notify(rule models.AlertRule, agent AgentInfo, message string) {
	var channels []models.AlertChannel
	if err := e.db.Find(&channels).Error; err != nil || len(channels) == 0 {
		return
	}

	payload := WebhookPayload{
		AlertName: rule.Name,
		RuleType:  rule.Type,
		AgentID:   agent.ID,
		AgentName: agent.Name,
		Message:   message,
		FiredAt:   time.Now(),
		Severity:  "warning",
	}

	for _, ch := range channels {
		switch ch.Type {
		case "webhook", "slack":
			go sendWebhook(ch, payload)
		default:
			log.Printf("Alert: unsupported channel type %q", ch.Type)
		}
	}
}

func sendWebhook(channel models.AlertChannel, payload WebhookPayload) {
	var cfg WebhookChannelConfig
	if err := json.Unmarshal(channel.Config, &cfg); err != nil {
		log.Printf("Alert webhook: invalid config for channel %q: %v", channel.Name, err)
		return
	}

	if cfg.URL == "" {
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	req, err := http.NewRequest("POST", cfg.URL, bytes.NewBuffer(data))
	if err != nil {
		return
	}

	req.Header.Set("Content-Type", "application/json")
	for k, v := range cfg.Headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Alert webhook: failed to send to %q: %v", channel.Name, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("Alert webhook: %q returned status %d", channel.Name, resp.StatusCode)
	}
}

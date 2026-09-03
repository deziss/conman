package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"conman-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// AlertHandler manages alert rules, channels, and events via REST API.
type AlertHandler struct {
	DB *gorm.DB
}

func NewAlertHandler(db *gorm.DB) *AlertHandler {
	return &AlertHandler{DB: db}
}

// Request and Response DTOs
type AlertRulePayload struct {
	Name    string          `json:"name"`
	Type    string          `json:"type"`
	Config  json.RawMessage `json:"config"`
	Enabled *bool           `json:"enabled"`
}

type AlertRuleResponse struct {
	ID        uint      `json:"ID"`
	CreatedAt time.Time `json:"CreatedAt"`
	UpdatedAt time.Time `json:"UpdatedAt"`
	Name      string    `json:"Name"`
	Type      string    `json:"Type"`
	Config    string    `json:"Config"`
	Enabled   bool      `json:"Enabled"`
}

type AlertChannelPayload struct {
	Name   string          `json:"name"`
	Type   string          `json:"type"`
	Config json.RawMessage `json:"config"`
}

type AlertChannelResponse struct {
	ID        uint      `json:"ID"`
	CreatedAt time.Time `json:"CreatedAt"`
	UpdatedAt time.Time `json:"UpdatedAt"`
	Name      string    `json:"Name"`
	Type      string    `json:"Type"`
	Config    string    `json:"Config"`
}

func parseConfigBytes(raw json.RawMessage) []byte {
	if len(raw) == 0 {
		return []byte("{}")
	}
	// If it's a quoted JSON string, unquote it
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		return []byte(str)
	}
	return []byte(raw)
}

func toRuleResponse(r models.AlertRule) AlertRuleResponse {
	cfg := string(r.Config)
	if cfg == "" {
		cfg = "{}"
	}
	return AlertRuleResponse{
		ID:        r.ID,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
		Name:      r.Name,
		Type:      r.Type,
		Config:    cfg,
		Enabled:   r.Enabled,
	}
}

func toChannelResponse(c models.AlertChannel) AlertChannelResponse {
	cfg := string(c.Config)
	if cfg == "" {
		cfg = "{}"
	}
	return AlertChannelResponse{
		ID:        c.ID,
		CreatedAt: c.CreatedAt,
		UpdatedAt: c.UpdatedAt,
		Name:      c.Name,
		Type:      c.Type,
		Config:    cfg,
	}
}

// RegisterRoutes registers alert management routes.
func (h *AlertHandler) RegisterRoutes(r chi.Router) {
	r.Route("/alerts", func(r chi.Router) {
		// Rules
		r.Get("/rules", h.ListRules)
		r.Post("/rules", h.CreateRule)
		r.Put("/rules/{id}", h.UpdateRule)
		r.Delete("/rules/{id}", h.DeleteRule)

		// Channels
		r.Get("/channels", h.ListChannels)
		r.Post("/channels", h.CreateChannel)
		r.Put("/channels/{id}", h.UpdateChannel)
		r.Delete("/channels/{id}", h.DeleteChannel)
		r.Post("/channels/{id}/test", h.TestChannel)

		// Events (read-only)
		r.Get("/events", h.ListEvents)
	})
}

// --- Rules ---

func (h *AlertHandler) ListRules(w http.ResponseWriter, r *http.Request) {
	var rules []models.AlertRule
	h.DB.Find(&rules)

	resp := make([]AlertRuleResponse, len(rules))
	for i, rule := range rules {
		resp[i] = toRuleResponse(rule)
	}
	WriteJSON(w, http.StatusOK, resp)
}

func (h *AlertHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	var payload AlertRulePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}
	if payload.Name == "" || payload.Type == "" {
		ErrorJSON(w, http.StatusBadRequest, "Name and type are required")
		return
	}

	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}

	rule := models.AlertRule{
		Name:    payload.Name,
		Type:    payload.Type,
		Config:  parseConfigBytes(payload.Config),
		Enabled: enabled,
	}

	if err := h.DB.Create(&rule).Error; err != nil {
		ErrorJSON(w, http.StatusConflict, "Rule already exists or DB error: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, toRuleResponse(rule))
}

func (h *AlertHandler) UpdateRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.AlertRule
	if err := h.DB.First(&existing, id).Error; err != nil {
		ErrorJSON(w, http.StatusNotFound, "Rule not found")
		return
	}

	var payload AlertRulePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if payload.Name != "" {
		existing.Name = payload.Name
	}
	if payload.Type != "" {
		existing.Type = payload.Type
	}
	if len(payload.Config) > 0 {
		existing.Config = parseConfigBytes(payload.Config)
	}
	if payload.Enabled != nil {
		existing.Enabled = *payload.Enabled
	}

	if err := h.DB.Save(&existing).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, toRuleResponse(existing))
}

func (h *AlertHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.DB.Delete(&models.AlertRule{}, id)
	h.DB.Where("rule_id = ?", id).Delete(&models.AlertEvent{})
	WriteJSON(w, http.StatusOK, map[string]string{"message": "Rule deleted"})
}

// --- Channels ---

func (h *AlertHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	var channels []models.AlertChannel
	h.DB.Find(&channels)

	resp := make([]AlertChannelResponse, len(channels))
	for i, ch := range channels {
		resp[i] = toChannelResponse(ch)
	}
	WriteJSON(w, http.StatusOK, resp)
}

func (h *AlertHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	var payload AlertChannelPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}
	if payload.Name == "" {
		ErrorJSON(w, http.StatusBadRequest, "Name is required")
		return
	}
	channelType := payload.Type
	if channelType == "" {
		channelType = "webhook"
	}

	channel := models.AlertChannel{
		Name:   payload.Name,
		Type:   channelType,
		Config: parseConfigBytes(payload.Config),
	}

	if err := h.DB.Create(&channel).Error; err != nil {
		ErrorJSON(w, http.StatusConflict, "Channel already exists or DB error: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, toChannelResponse(channel))
}

func (h *AlertHandler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.AlertChannel
	if err := h.DB.First(&existing, id).Error; err != nil {
		ErrorJSON(w, http.StatusNotFound, "Channel not found")
		return
	}

	var payload AlertChannelPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if payload.Name != "" {
		existing.Name = payload.Name
	}
	if payload.Type != "" {
		existing.Type = payload.Type
	}
	if len(payload.Config) > 0 {
		existing.Config = parseConfigBytes(payload.Config)
	}

	if err := h.DB.Save(&existing).Error; err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, toChannelResponse(existing))
}

func (h *AlertHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.DB.Delete(&models.AlertChannel{}, id)
	WriteJSON(w, http.StatusOK, map[string]string{"message": "Channel deleted"})
}

// TestChannel sends a ping to the configured webhook channel
func (h *AlertHandler) TestChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var channel models.AlertChannel
	if err := h.DB.First(&channel, id).Error; err != nil {
		ErrorJSON(w, http.StatusNotFound, "Channel not found")
		return
	}

	var cfg struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(channel.Config, &cfg); err != nil || cfg.URL == "" {
		ErrorJSON(w, http.StatusBadRequest, "Invalid channel webhook URL")
		return
	}

	payload := map[string]interface{}{
		"alert_name": "Test Notification",
		"rule_type":  "test",
		"message":    "This is a test notification from Conman container manager.",
		"fired_at":   time.Now(),
		"severity":   "info",
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(r.Context(), "POST", cfg.URL, bytes.NewBuffer(body))
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		ErrorJSON(w, http.StatusBadGateway, fmt.Sprintf("Failed to reach webhook: %v", err))
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode >= 400 {
		ErrorJSON(w, http.StatusBadGateway, fmt.Sprintf("Webhook returned status %d", resp.StatusCode))
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Test notification sent successfully"})
}

// --- Events ---

func (h *AlertHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	var events []models.AlertEvent
	query := h.DB.Preload("Rule").Order("fired_at DESC").Limit(100)

	if agentID := r.URL.Query().Get("agent_id"); agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}
	if resolved := r.URL.Query().Get("resolved"); resolved == "false" {
		query = query.Where("resolved = ?", false)
	}

	query.Find(&events)
	WriteJSON(w, http.StatusOK, events)
}

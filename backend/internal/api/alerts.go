package api

import (
	"encoding/json"
	"net/http"

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

		// Events (read-only)
		r.Get("/events", h.ListEvents)
	})
}

// --- Rules ---

func (h *AlertHandler) ListRules(w http.ResponseWriter, r *http.Request) {
	var rules []models.AlertRule
	h.DB.Find(&rules)
	WriteJSON(w, http.StatusOK, rules)
}

func (h *AlertHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	var rule models.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if rule.Name == "" || rule.Type == "" {
		ErrorJSON(w, http.StatusBadRequest, "Name and type are required")
		return
	}
	if err := h.DB.Create(&rule).Error; err != nil {
		ErrorJSON(w, http.StatusConflict, "Rule already exists or DB error: "+err.Error())
		return
	}
	WriteJSON(w, http.StatusCreated, rule)
}

func (h *AlertHandler) UpdateRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.AlertRule
	if err := h.DB.First(&existing, id).Error; err != nil {
		ErrorJSON(w, http.StatusNotFound, "Rule not found")
		return
	}

	var updates models.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if updates.Name != "" {
		existing.Name = updates.Name
	}
	if updates.Type != "" {
		existing.Type = updates.Type
	}
	if updates.Config != nil {
		existing.Config = updates.Config
	}
	existing.Enabled = updates.Enabled

	h.DB.Save(&existing)
	WriteJSON(w, http.StatusOK, existing)
}

func (h *AlertHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.DB.Delete(&models.AlertRule{}, id)
	// Also clean up events for this rule
	h.DB.Where("rule_id = ?", id).Delete(&models.AlertEvent{})
	WriteJSON(w, http.StatusOK, map[string]string{"message": "Rule deleted"})
}

// --- Channels ---

func (h *AlertHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	var channels []models.AlertChannel
	h.DB.Find(&channels)
	WriteJSON(w, http.StatusOK, channels)
}

func (h *AlertHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	var channel models.AlertChannel
	if err := json.NewDecoder(r.Body).Decode(&channel); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if channel.Name == "" || channel.Type == "" {
		ErrorJSON(w, http.StatusBadRequest, "Name and type are required")
		return
	}
	if err := h.DB.Create(&channel).Error; err != nil {
		ErrorJSON(w, http.StatusConflict, "Channel already exists or DB error: "+err.Error())
		return
	}
	WriteJSON(w, http.StatusCreated, channel)
}

func (h *AlertHandler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var existing models.AlertChannel
	if err := h.DB.First(&existing, id).Error; err != nil {
		ErrorJSON(w, http.StatusNotFound, "Channel not found")
		return
	}

	var updates models.AlertChannel
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if updates.Name != "" {
		existing.Name = updates.Name
	}
	if updates.Type != "" {
		existing.Type = updates.Type
	}
	if updates.Config != nil {
		existing.Config = updates.Config
	}

	h.DB.Save(&existing)
	WriteJSON(w, http.StatusOK, existing)
}

func (h *AlertHandler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	h.DB.Delete(&models.AlertChannel{}, id)
	WriteJSON(w, http.StatusOK, map[string]string{"message": "Channel deleted"})
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

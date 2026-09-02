package api

import (
	"net/http"
	"strconv"
	"time"

	"conman-backend/internal/service"
)

type ActivityHandler struct {
	activityService *service.ActivityService
}

func NewActivityHandler(activityService *service.ActivityService) *ActivityHandler {
	return &ActivityHandler{
		activityService: activityService,
	}
}

// ListActivities returns paginated and filtered activities
func (h *ActivityHandler) ListActivities(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	agentID := q.Get("agent_id")
	entityType := q.Get("type")
	action := q.Get("action")
	severity := q.Get("severity")
	search := q.Get("search")
	targetName := q.Get("target_name")

	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit < 1 || limit > 200 {
		limit = 50
	}

	var sinceDuration time.Duration
	sinceStr := q.Get("since")
	if sinceStr != "" {
		if d, err := time.ParseDuration(sinceStr); err == nil {
			sinceDuration = d
		}
	}

	activities, total, err := h.activityService.ListActivities(
		agentID, entityType, action, severity, search, targetName,
		page, limit, sinceDuration,
	)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Failed to retrieve activities: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"activities": activities,
		"total":      total,
		"page":       page,
		"limit":      limit,
	})
}

// GetStats returns summary counts of recent activity
func (h *ActivityHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	agentID := r.URL.Query().Get("agent_id")
	stats, err := h.activityService.GetActivityStats(agentID)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Failed to retrieve activity stats: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, stats)
}

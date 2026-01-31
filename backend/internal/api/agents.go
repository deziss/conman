package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"conman-backend/internal/models"
	"conman-backend/pkg/protocol"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

// AgentHandler handles agent-related API endpoints
type AgentHandler struct {
	mu     sync.RWMutex
	agents map[string]*AgentState
	DB     *gorm.DB
}

// AgentState holds the current state of a registered agent
type AgentState struct {
	ID            string                 `json:"id"`
	Name          string                 `json:"name"`
	HostInfo      *protocol.HostInfo     `json:"host_info"`
	Stats         *protocol.SystemStats  `json:"stats,omitempty"`
	LastHeartbeat time.Time              `json:"last_heartbeat"`
	LastReport    time.Time              `json:"last_report"`
	Status        string                 `json:"status"`
	Mode          string                 `json:"mode"`
	ScrapeURL     string                         `json:"scrape_url,omitempty"`
	Containers    []protocol.Container           `json:"containers,omitempty"`
	Metrics       map[string]protocol.ContainerMetrics `json:"metrics,omitempty"` // Added field
	Images        []protocol.Image               `json:"images,omitempty"`
	Networks      []protocol.Network             `json:"networks,omitempty"`
	Volumes       []protocol.Volume              `json:"volumes,omitempty"`
	Events        []protocol.ContainerEvent      `json:"events,omitempty"`
}

// NewAgentHandler creates a new agent handler
func NewAgentHandler(db *gorm.DB) *AgentHandler {
	h := &AgentHandler{
		agents: make(map[string]*AgentState),
		DB:     db,
	}
	h.loadAgents()
	return h
}

func (h *AgentHandler) loadAgents() {
	var dbAgents []models.Agent
	if err := h.DB.Find(&dbAgents).Error; err != nil {
		log.Printf("Error loading agents from DB: %v", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for _, a := range dbAgents {
		var hostInfo *protocol.HostInfo
		if len(a.HostInfo) > 0 {
			json.Unmarshal(a.HostInfo, &hostInfo)
		}

		h.agents[a.AgentID] = &AgentState{
			ID:            a.AgentID,
			Name:          a.Name,
			HostInfo:      hostInfo,
			LastHeartbeat: a.LastHeartbeat,
			LastReport:    a.LastReport,
			Status:        "offline", // Assume offline on startup until heartbeat
			Mode:          a.Mode,
			ScrapeURL:     a.ScrapeURL,
			Events:        make([]protocol.ContainerEvent, 0),
		}
		log.Printf("Loaded agent from DB: %s (%s)", a.Name, a.AgentID)
	}
}

// RegisterRoutes registers agent API routes (protected - requires auth)
func (h *AgentHandler) RegisterRoutes(r chi.Router) {
	// Agent endpoints (protected)
	r.Get("/agents", h.ListAgents)
	r.Get("/agents/{id}", h.GetAgent)
	r.Delete("/agents/{id}", h.DeleteAgent)
	r.Get("/agents/{id}/containers", h.GetAgentContainers)
	r.Get("/agents/{id}/containers", h.GetAgentContainers)
	r.Get("/agents/{id}/images", h.GetAgentImages)
	r.Get("/agents/{id}/networks", h.GetAgentNetworks)
	r.Get("/agents/{id}/volumes", h.GetAgentVolumes)
	
	// Host-centric endpoints (aggregate from all agents)
	r.Get("/hosts", h.ListHosts)
	r.Get("/hosts/{id}/containers", h.GetHostContainers)
	r.Get("/hosts/{id}/images", h.GetHostImages)
}

// RegisterPublicRoutes registers agent API routes that don't require auth (for agent self-registration)
func (h *AgentHandler) RegisterPublicRoutes(r chi.Router) {
	r.Post("/agents/register", h.Register)
	r.Post("/agents/{id}/heartbeat", h.Heartbeat)
	r.Post("/agents/{id}/report", h.ReceiveReport)
	r.Post("/agents/{id}/events", h.ReceiveEvent)
}

// Register handles agent registration
func (h *AgentHandler) Register(w http.ResponseWriter, r *http.Request) {
	var reg protocol.AgentRegistration
	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Persist to DB
	hostInfoJSON, _ := json.Marshal(reg.HostInfo)
	dbAgent := models.Agent{
		AgentID:       reg.AgentID,
		Name:          reg.AgentName,
		Status:        "healthy",
		LastHeartbeat: time.Now(),
		Mode:          reg.Mode,
		HostInfo:      hostInfoJSON,
		ScrapeURL:     reg.ScrapeURL,
		Approved:      true, // Auto-approve for now
	}

	var existing models.Agent
	if err := h.DB.Where("agent_id = ?", reg.AgentID).First(&existing).Error; err == nil {
		// Update existing
		existing.Name = dbAgent.Name
		existing.LastHeartbeat = dbAgent.LastHeartbeat
		existing.HostInfo = dbAgent.HostInfo
		existing.Status = "healthy"
		existing.ScrapeURL = dbAgent.ScrapeURL
		h.DB.Save(&existing)
	} else {
		// Create new
		h.DB.Create(&dbAgent)
	}

	h.mu.Lock()
	h.agents[reg.AgentID] = &AgentState{
		ID:            reg.AgentID,
		Name:          reg.AgentName,
		HostInfo:      reg.HostInfo,
		LastHeartbeat: time.Now(),
		Status:        "healthy",
		Mode:          reg.Mode,
		ScrapeURL:     reg.ScrapeURL,
		Events:        make([]protocol.ContainerEvent, 0),
	}
	h.mu.Unlock()

	log.Printf("Agent registered and persisted: %s (%s)", reg.AgentName, reg.AgentID)

	WriteJSON(w, http.StatusOK, protocol.AgentRegistrationResponse{
		Success:       true,
		Message:       "Registration successful",
		ServerVersion: "1.0.0",
	})
}

// ListAgents returns all registered agents
func (h *AgentHandler) ListAgents(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	agents := make([]*AgentState, 0, len(h.agents))
	for _, agent := range h.agents {
		// Update status based on last heartbeat
		if time.Since(agent.LastHeartbeat) > 2*time.Minute {
			agent.Status = "offline"
		} else if time.Since(agent.LastHeartbeat) > time.Minute {
			agent.Status = "degraded"
		}
		agents = append(agents, agent)
	}

	WriteJSON(w, http.StatusOK, agents)
}

// GetAgent returns a specific agent
func (h *AgentHandler) GetAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	WriteJSON(w, http.StatusOK, agent)
}

// DeleteAgent removes an agent
func (h *AgentHandler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.Lock()
	delete(h.agents, id)
	h.mu.Unlock()

	h.DB.Where("agent_id = ?", id).Delete(&models.Agent{})

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Agent removed"})
}

// Heartbeat handles agent heartbeat
func (h *AgentHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var heartbeat protocol.AgentHeartbeat
	if err := json.NewDecoder(r.Body).Decode(&heartbeat); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	h.mu.Lock()
	agent, exists := h.agents[id]
	if !exists {
		// Try to load from DB (lazy load/recovery)
		var dbAgent models.Agent
		if err := h.DB.Where("agent_id = ?", id).First(&dbAgent).Error; err == nil {
			var hostInfo *protocol.HostInfo
			if len(dbAgent.HostInfo) > 0 {
				json.Unmarshal(dbAgent.HostInfo, &hostInfo)
			}
			agent = &AgentState{
				ID:            dbAgent.AgentID,
				Name:          dbAgent.Name,
				HostInfo:      hostInfo,
				LastHeartbeat: dbAgent.LastHeartbeat,
				LastReport:    dbAgent.LastReport,
				Status:        dbAgent.Status,
				Mode:          dbAgent.Mode,
				ScrapeURL:     dbAgent.ScrapeURL,
				Events:        make([]protocol.ContainerEvent, 0),
			}
			h.agents[id] = agent
			exists = true
		}
	}

	if exists {
		agent.LastHeartbeat = time.Now()
		agent.Status = heartbeat.Status
	}
	h.mu.Unlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not registered")
		return
	}

	// Persist
	go func() {
		h.DB.Model(&models.Agent{}).Where("agent_id = ?", id).Updates(map[string]interface{}{
			"last_heartbeat": time.Now(),
			"status":         heartbeat.Status,
		})
	}()

	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ReceiveReport handles agent data report
func (h *AgentHandler) ReceiveReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var bodyBytes []byte
	if r.Body != nil {
		bodyBytes, _ = io.ReadAll(r.Body)
	}
	// Restore the io.ReadCloser to its original state
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	// Write to file for debug
	if err := os.WriteFile("agent_report_dump.json", bodyBytes, 0644); err != nil {
		log.Printf("Failed to write report dump: %v", err)
	}

	var report protocol.AgentReport
	if err := json.NewDecoder(bytes.NewBuffer(bodyBytes)).Decode(&report); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	h.mu.Lock()
	agent, exists := h.agents[id]
	if !exists {
		// Try to load from DB (lazy load/recovery)
		var dbAgent models.Agent
		if err := h.DB.Where("agent_id = ?", id).First(&dbAgent).Error; err == nil {
			var hostInfo *protocol.HostInfo
			if len(dbAgent.HostInfo) > 0 {
				json.Unmarshal(dbAgent.HostInfo, &hostInfo)
			}
			agent = &AgentState{
				ID:            dbAgent.AgentID,
				Name:          dbAgent.Name,
				HostInfo:      hostInfo,
				LastHeartbeat: dbAgent.LastHeartbeat,
				LastReport:    dbAgent.LastReport,
				Status:        dbAgent.Status,
				Mode:          dbAgent.Mode,
				ScrapeURL:     dbAgent.ScrapeURL,
				Events:        make([]protocol.ContainerEvent, 0),
			}
			h.agents[id] = agent
			exists = true
		}
	}

	if exists {
		agent.LastReport = time.Now()
		agent.Containers = report.Containers
		agent.Images = report.Images
		agent.Networks = report.Networks
		agent.Volumes = report.Volumes
		if report.HostInfo != nil {
			agent.HostInfo = report.HostInfo
		}
		if report.Stats != nil {
			agent.Stats = report.Stats
		}
		
		// Map metrics by container ID
		if len(report.Metrics) > 0 {
			if agent.Metrics == nil {
				agent.Metrics = make(map[string]protocol.ContainerMetrics)
			}
			for _, m := range report.Metrics {
				agent.Metrics[m.ContainerID] = m
			}
		}
	}
	h.mu.Unlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not registered")
		return
	}

	// Persist LastReport timestamp
	go func() {
		h.DB.Model(&models.Agent{}).Where("agent_id = ?", id).Update("last_report", time.Now())
	}()

	WriteJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

// ReceiveEvent handles container events from agent
func (h *AgentHandler) ReceiveEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var event protocol.ContainerEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	h.mu.Lock()
	if agent, exists := h.agents[id]; exists {
		// Keep only last 100 events
		agent.Events = append(agent.Events, event)
		if len(agent.Events) > 100 {
			agent.Events = agent.Events[len(agent.Events)-100:]
		}
	}
	h.mu.Unlock()

	log.Printf("Event from %s: %s %s", id[:8], event.Action, event.ContainerName)

	WriteJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

// GetAgentContainers returns containers from a specific agent
func (h *AgentHandler) GetAgentContainers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	WriteJSON(w, http.StatusOK, agent.Containers)
}

// GetAgentImages returns images from a specific agent
func (h *AgentHandler) GetAgentImages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	WriteJSON(w, http.StatusOK, agent.Images)
}

// GetAgentNetworks returns networks from a specific agent
func (h *AgentHandler) GetAgentNetworks(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	WriteJSON(w, http.StatusOK, agent.Networks)
}

// GetAgentVolumes returns volumes from a specific agent
func (h *AgentHandler) GetAgentVolumes(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	WriteJSON(w, http.StatusOK, agent.Volumes)
}


// ListHosts returns all hosts (same as agents for now)
func (h *AgentHandler) ListHosts(w http.ResponseWriter, r *http.Request) {
	h.ListAgents(w, r)
}

// GetHostContainers returns containers from a specific host
func (h *AgentHandler) GetHostContainers(w http.ResponseWriter, r *http.Request) {
	h.GetAgentContainers(w, r)
}

// GetHostImages returns images from a specific host
func (h *AgentHandler) GetHostImages(w http.ResponseWriter, r *http.Request) {
	h.GetAgentImages(w, r)
}

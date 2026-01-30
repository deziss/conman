package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"conman-backend/pkg/protocol"

	"github.com/go-chi/chi/v5"
)

// AgentHandler handles agent-related API endpoints
type AgentHandler struct {
	mu     sync.RWMutex
	agents map[string]*AgentState
}

// AgentState holds the current state of a registered agent
type AgentState struct {
	ID            string                 `json:"id"`
	Name          string                 `json:"name"`
	HostInfo      *protocol.HostInfo     `json:"host_info"`
	LastHeartbeat time.Time              `json:"last_heartbeat"`
	LastReport    time.Time              `json:"last_report"`
	Status        string                 `json:"status"`
	Mode          string                 `json:"mode"`
	ScrapeURL     string                 `json:"scrape_url,omitempty"`
	Containers    []protocol.Container   `json:"containers,omitempty"`
	Images        []protocol.Image       `json:"images,omitempty"`
	Networks      []protocol.Network     `json:"networks,omitempty"`
	Volumes       []protocol.Volume      `json:"volumes,omitempty"`
	Events        []protocol.ContainerEvent `json:"events,omitempty"`
}

// NewAgentHandler creates a new agent handler
func NewAgentHandler() *AgentHandler {
	return &AgentHandler{
		agents: make(map[string]*AgentState),
	}
}

// RegisterRoutes registers agent API routes
func (h *AgentHandler) RegisterRoutes(r chi.Router) {
	r.Route("/agents", func(r chi.Router) {
		r.Post("/register", h.Register)
		r.Get("/", h.ListAgents)
		r.Get("/{id}", h.GetAgent)
		r.Delete("/{id}", h.DeleteAgent)
		r.Post("/{id}/heartbeat", h.Heartbeat)
		r.Post("/{id}/report", h.ReceiveReport)
		r.Post("/{id}/events", h.ReceiveEvent)
		r.Get("/{id}/containers", h.GetAgentContainers)
		r.Get("/{id}/images", h.GetAgentImages)
	})
	
	// Host-centric endpoints (aggregate from all agents)
	r.Route("/hosts", func(r chi.Router) {
		r.Get("/", h.ListHosts)
		r.Get("/{id}/containers", h.GetHostContainers)
		r.Get("/{id}/images", h.GetHostImages)
	})
}

// Register handles agent registration
func (h *AgentHandler) Register(w http.ResponseWriter, r *http.Request) {
	var reg protocol.AgentRegistration
	if err := json.NewDecoder(r.Body).Decode(&reg); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
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

	log.Printf("Agent registered: %s (%s)", reg.AgentName, reg.AgentID)

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
	if agent, exists := h.agents[id]; exists {
		agent.LastHeartbeat = time.Now()
		agent.Status = heartbeat.Status
	}
	h.mu.Unlock()

	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ReceiveReport handles agent data report
func (h *AgentHandler) ReceiveReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var report protocol.AgentReport
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	h.mu.Lock()
	if agent, exists := h.agents[id]; exists {
		agent.LastReport = time.Now()
		agent.Containers = report.Containers
		agent.Images = report.Images
		agent.Networks = report.Networks
		agent.Volumes = report.Volumes
		if report.HostInfo != nil {
			agent.HostInfo = report.HostInfo
		}
	}
	h.mu.Unlock()

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

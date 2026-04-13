package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"conman-backend/internal/alerts"
	"conman-backend/internal/buildinfo"
	"conman-backend/internal/license"
	"conman-backend/internal/metrics"
	"conman-backend/internal/models"
	"conman-backend/internal/observability"
	"conman-backend/pkg/protocol"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// AgentHandler handles agent-related API endpoints

// persistJob represents an async DB write operation queued by report ingestion.
type persistJob struct {
	agentID string
	state   *AgentState                // snapshot to persist (nil = heartbeat-only)
	metrics []protocol.ContainerMetrics // metrics to write (nil = skip)
}

type AgentHandler struct {
	mu           sync.RWMutex
	agents       map[string]*AgentState
	DB           *gorm.DB
	MetricsStore *metrics.MetricsStore
	License      *license.LicenseService
	writeQueue   chan persistJob
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
	RuntimeType   string                          `json:"runtime_type,omitempty"`
	Tags          []string                       `json:"tags,omitempty"`
	Containers    []protocol.Container           `json:"containers,omitempty"`
	Metrics       map[string]protocol.ContainerMetrics `json:"metrics,omitempty"` // Added field
	Images        []protocol.Image               `json:"images,omitempty"`
	Networks      []protocol.Network             `json:"networks,omitempty"`
	Volumes       []protocol.Volume              `json:"volumes,omitempty"`
	Events        []protocol.ContainerEvent      `json:"events,omitempty"`
}

// AgentImageResponse is the API response for images with computed usage status.
type AgentImageResponse struct {
	ID              string            `json:"id"`
	RepoTags        []string          `json:"repo_tags"`
	RepoDigests     []string          `json:"repo_digests,omitempty"`
	Created         int64             `json:"created"`
	Size            int64             `json:"size"`
	VirtualSize     int64             `json:"virtual_size"`
	Labels          map[string]string `json:"labels,omitempty"`
	Containers      int               `json:"containers"`
	Status          string            `json:"status"`
	UpdateAvailable bool              `json:"update_available"`
}

// AgentContainerResponse is the API response for containers with merged metrics.
type AgentContainerResponse struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Image       string            `json:"image"`
	ImageID     string            `json:"image_id"`
	Command     string            `json:"command"`
	Created     int64             `json:"created"`
	State       string            `json:"state"`
	Status      string            `json:"status"`
	Ports       []protocol.Port   `json:"ports,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	NetworkMode string            `json:"network_mode"`
	Mounts      []protocol.Mount  `json:"mounts,omitempty"`
	CPUUsage    string            `json:"cpu_usage"`
	MemoryUsage string            `json:"memory_usage"`
	DiskIO      string            `json:"disk_io"`
	NetworkRx   uint64            `json:"network_rx"`
	NetworkTx   uint64            `json:"network_tx"`
}

// formatMetricBytes formats a byte count into a human-readable string.
func formatMetricBytes(bytes uint64) string {
	if bytes == 0 {
		return "0 B"
	}
	b := float64(bytes)
	const k = 1024
	sizes := []string{"B", "KB", "MB", "GB", "TB"}
	i := 0
	for b >= k && i < len(sizes)-1 {
		b /= k
		i++
	}
	return fmt.Sprintf("%.2f %s", b, sizes[i])
}

// computeUsedImageIDs builds a set of image IDs and names that are in use by containers.
func computeUsedImageIDs(containers []protocol.Container) map[string]bool {
	used := make(map[string]bool)
	for _, c := range containers {
		if c.ImageID != "" {
			used[c.ImageID] = true
		}
		if c.Image != "" {
			used[c.Image] = true
		}
	}
	return used
}

const writeQueueSize = 256
const writeWorkers = 4

// NewAgentHandler creates a new agent handler with a background write queue.
func NewAgentHandler(db *gorm.DB, metricsStore *metrics.MetricsStore, lic *license.LicenseService) *AgentHandler {
	h := &AgentHandler{
		agents:       make(map[string]*AgentState),
		DB:           db,
		MetricsStore: metricsStore,
		License:      lic,
		writeQueue:   make(chan persistJob, writeQueueSize),
	}
	h.loadAgents()

	// Start write workers
	for i := 0; i < writeWorkers; i++ {
		go h.writeWorker()
	}

	return h
}

// writeWorker processes persist jobs from the write queue.
func (h *AgentHandler) writeWorker() {
	for job := range h.writeQueue {
		// Persist agent timestamp
		h.DB.Model(&models.Agent{}).Where("agent_id = ?", job.agentID).Update("last_report", time.Now())

		// Persist snapshot
		if job.state != nil {
			h.persistSnapshot(job.agentID, job.state)
		}

		// Write metrics
		if h.MetricsStore != nil && len(job.metrics) > 0 {
			if err := h.MetricsStore.WriteMetrics(job.agentID, job.metrics); err != nil {
				log.Printf("Write worker: failed to write metrics for agent %s: %v", job.agentID, err)
			}
		}
	}
}

func (h *AgentHandler) loadAgents() {
	var dbAgents []models.Agent
	if err := h.DB.Find(&dbAgents).Error; err != nil {
		log.Printf("Error loading agents from DB: %v", err)
		return
	}

	// Load snapshots indexed by agent ID for fast lookup
	var snapshots []models.AgentSnapshot
	h.DB.Find(&snapshots)
	snapshotMap := make(map[string]*models.AgentSnapshot, len(snapshots))
	for i := range snapshots {
		snapshotMap[snapshots[i].AgentID] = &snapshots[i]
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for _, a := range dbAgents {
		// Try to restore full state from snapshot first
		if snap, ok := snapshotMap[a.AgentID]; ok && len(snap.ReportJSON) > 0 {
			var state AgentState
			if err := json.Unmarshal(snap.ReportJSON, &state); err == nil {
				state.Status = "offline" // Assume offline until heartbeat arrives
				h.agents[a.AgentID] = &state
				log.Printf("Restored agent from snapshot: %s (%s)", state.Name, a.AgentID)
				continue
			}
		}

		// Fallback: minimal state from Agent table
		var hostInfo *protocol.HostInfo
		if len(a.HostInfo) > 0 {
			json.Unmarshal(a.HostInfo, &hostInfo)
		}
		var tags []string
		if len(a.Tags) > 0 {
			json.Unmarshal(a.Tags, &tags)
		}

		h.agents[a.AgentID] = &AgentState{
			ID:            a.AgentID,
			Name:          a.Name,
			HostInfo:      hostInfo,
			LastHeartbeat: a.LastHeartbeat,
			LastReport:    a.LastReport,
			Status:        "offline",
			Mode:          a.Mode,
			ScrapeURL:     a.ScrapeURL,
			Tags:          tags,
			Events:        make([]protocol.ContainerEvent, 0),
		}
		log.Printf("Loaded agent from DB (no snapshot): %s (%s)", a.Name, a.AgentID)
	}
}

// persistSnapshot saves the current AgentState to the database as a JSON snapshot.
func (h *AgentHandler) persistSnapshot(agentID string, state *AgentState) {
	data, err := json.Marshal(state)
	if err != nil {
		log.Printf("Failed to marshal agent snapshot for %s: %v", agentID, err)
		return
	}

	snapshot := models.AgentSnapshot{
		AgentID:    agentID,
		ReportJSON: data,
		Timestamp:  time.Now(),
	}

	// Upsert: update if exists, create if not
	var existing models.AgentSnapshot
	if err := h.DB.Where("agent_id = ?", agentID).First(&existing).Error; err == nil {
		existing.ReportJSON = data
		existing.Timestamp = time.Now()
		h.DB.Save(&existing)
	} else {
		h.DB.Create(&snapshot)
	}
}

// updateGauges refreshes Prometheus gauge values for agents and containers.
func (h *AgentHandler) updateGauges() {
	h.mu.RLock()
	defer h.mu.RUnlock()

	healthy, offline := 0, 0
	containers := 0
	for _, a := range h.agents {
		if time.Since(a.LastHeartbeat) > 2*time.Minute {
			offline++
		} else {
			healthy++
		}
		containers += len(a.Containers)
	}
	observability.AgentsTotal.WithLabelValues("healthy").Set(float64(healthy))
	observability.AgentsTotal.WithLabelValues("offline").Set(float64(offline))
	observability.ContainersTotal.Set(float64(containers))
}

// RegisterRoutes registers agent API routes (protected - requires auth)
func (h *AgentHandler) RegisterRoutes(r chi.Router) {
	// Agent endpoints (protected)
	r.Get("/agents", h.ListAgents)
	r.Get("/agents/{id}", h.GetAgent)
	r.Put("/agents/{id}/tags", h.UpdateAgentTags)
	r.Delete("/agents/{id}", h.DeleteAgent)
	r.Get("/agents/{id}/containers", h.GetAgentContainers)
	r.Get("/agents/{id}/images", h.GetAgentImages)
	r.Get("/agents/{id}/networks", h.GetAgentNetworks)
	r.Get("/agents/{id}/volumes", h.GetAgentVolumes)
	
	// Remote Control Proxies
	r.Get("/agents/{id}/containers/{containerId}/exec", h.ProxyStreamExec)
	r.Get("/agents/{id}/containers/{containerId}/files", h.ProxyListContainerFiles)
	r.Get("/agents/{id}/containers/{containerId}/logs", h.ProxyStreamLogs)
	r.Get("/agents/{id}/containers/{containerId}/stats", h.ProxyStreamStats)
    r.Get("/agents/{id}/containers/{containerId}/files/download", h.ProxyDownloadFile)

    // Container Management
	// Container Management
    r.Get("/agents/{id}/containers/{containerId}", h.ProxyInspectContainer)
	r.Post("/agents/{id}/containers/{containerId}/start", h.ProxyStartContainer)
	r.Post("/agents/{id}/containers/{containerId}/stop", h.ProxyStopContainer)
	r.Post("/agents/{id}/containers/{containerId}/restart", h.ProxyRestartContainer)
	r.Delete("/agents/{id}/containers/{containerId}", h.ProxyRemoveContainer)
    
	// Image Management
    r.Get("/agents/{id}/images/{imageId}", h.ProxyInspectImage)
	r.Post("/agents/{id}/images/pull", h.ProxyPullImage)
	r.Delete("/agents/{id}/images/{imageId}", h.ProxyRemoveImage)
    r.Get("/agents/{id}/images/{imageId}/check-update", h.ProxyCheckImageUpdate)
    
	// Volume Management
    r.Get("/agents/{id}/volumes/{name}", h.ProxyInspectVolume)
	r.Post("/agents/{id}/volumes", h.ProxyCreateVolume)
	r.Delete("/agents/{id}/volumes/{name}", h.ProxyRemoveVolume)
    r.Post("/agents/{id}/volumes/{name}/browse", h.ProxyBrowseVolume)
    
	// Network Management
    r.Get("/agents/{id}/networks/{networkId}", h.ProxyInspectNetwork)
	r.Post("/agents/{id}/networks", h.ProxyCreateNetwork)
	r.Delete("/agents/{id}/networks/{networkId}", h.ProxyRemoveNetwork)
    r.Post("/agents/{id}/networks/{networkId}/connect", h.ProxyConnectNetwork) 
    r.Post("/agents/{id}/networks/{networkId}/duplicate", h.ProxyDuplicateNetwork)
	
	// Host-centric endpoints (aggregate from all agents)
	r.Get("/hosts", h.ListHosts)
	r.Get("/hosts/{id}/containers", h.GetHostContainers)
	r.Get("/hosts/{id}/images", h.GetHostImages)
	r.Get("/agents/{id}/system/df", h.ProxySystemDF)

    // Stack Management
    r.Get("/agents/{id}/stacks", h.ProxyListStacks)
    r.Post("/agents/{id}/stacks", h.ProxyCreateStack)
    r.Post("/agents/{id}/stacks/{stackName}/up", h.ProxyUpStack)
    r.Post("/agents/{id}/stacks/{stackName}/restart", h.ProxyRestartStack)
    r.Delete("/agents/{id}/stacks/{stackName}", h.ProxyRemoveStack)

    // Prune
    r.Post("/agents/{id}/containers/prune", h.ProxyPruneContainers)
    r.Post("/agents/{id}/images/prune", h.ProxyPruneImages)
    r.Post("/agents/{id}/volumes/prune", h.ProxyPruneVolumes)
    r.Post("/agents/{id}/networks/prune", h.ProxyPruneNetworks)
    r.Post("/agents/{id}/system/prune", h.ProxySystemPrune)

	// Historical Metrics
	r.Get("/metrics/containers/{containerId}", h.QueryContainerMetrics)
	r.Get("/agents/{id}/metrics", h.QueryAgentMetrics)
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
		RuntimeType:   reg.RuntimeType,
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
		// Create new — check host limit
		if h.License != nil && !h.License.CanAddHost() {
			state := h.License.GetState()
			ErrorJSON(w, http.StatusForbidden, fmt.Sprintf(
				"Host limit reached. Your %s plan allows %d host(s). Upgrade to add more.",
				state.Tier, state.MaxHosts))
			return
		}
		h.DB.Create(&dbAgent)
	}

	state := &AgentState{
		ID:            reg.AgentID,
		Name:          reg.AgentName,
		HostInfo:      reg.HostInfo,
		LastHeartbeat: time.Now(),
		Status:        "healthy",
		Mode:          reg.Mode,
		RuntimeType:   reg.RuntimeType,
		ScrapeURL:     reg.ScrapeURL,
		Events:        make([]protocol.ContainerEvent, 0),
	}

	h.mu.Lock()
	h.agents[reg.AgentID] = state
	h.mu.Unlock()

	// Persist snapshot to DB (async)
	go h.persistSnapshot(reg.AgentID, state)

	log.Printf("Agent registered and persisted: %s (%s)", reg.AgentName, reg.AgentID)

	WriteJSON(w, http.StatusOK, protocol.AgentRegistrationResponse{
		Success:       true,
		Message:       "Registration successful",
		ServerVersion: buildinfo.Version,
	})
}

// RegisterLocalAgent registers an agent programmatically (no HTTP request). Used for auto-detecting
// the local host when the server starts on a machine with a container runtime.
func (h *AgentHandler) RegisterLocalAgent(reg protocol.AgentRegistration) {
	hostInfoJSON, _ := json.Marshal(reg.HostInfo)
	dbAgent := models.Agent{
		AgentID:       reg.AgentID,
		Name:          reg.AgentName,
		Status:        "healthy",
		LastHeartbeat: time.Now(),
		Mode:          reg.Mode,
		RuntimeType:   reg.RuntimeType,
		HostInfo:      hostInfoJSON,
		Approved:      true,
	}

	var existing models.Agent
	if err := h.DB.Where("agent_id = ?", reg.AgentID).First(&existing).Error; err == nil {
		existing.Name = dbAgent.Name
		existing.LastHeartbeat = dbAgent.LastHeartbeat
		existing.HostInfo = dbAgent.HostInfo
		existing.Status = "healthy"
		h.DB.Save(&existing)
	} else {
		h.DB.Create(&dbAgent)
	}

	state := &AgentState{
		ID:            reg.AgentID,
		Name:          reg.AgentName,
		HostInfo:      reg.HostInfo,
		LastHeartbeat: time.Now(),
		Status:        "healthy",
		Mode:          reg.Mode,
		RuntimeType:   reg.RuntimeType,
		Events:        make([]protocol.ContainerEvent, 0),
	}

	h.mu.Lock()
	h.agents[reg.AgentID] = state
	h.mu.Unlock()

	go h.persistSnapshot(reg.AgentID, state)
}

// ListAgents returns all registered agents. Supports ?tag= and ?runtime= query params for filtering.
func (h *AgentHandler) ListAgents(w http.ResponseWriter, r *http.Request) {
	filterTag := r.URL.Query().Get("tag")
	filterRuntime := r.URL.Query().Get("runtime")

	h.mu.RLock()
	defer h.mu.RUnlock()

	agents := make([]*AgentState, 0, len(h.agents))
	for _, agent := range h.agents {
		// Compute display status without mutating (avoid write under RLock)
		displayStatus := agent.Status
		if time.Since(agent.LastHeartbeat) > 2*time.Minute {
			displayStatus = "offline"
		} else if time.Since(agent.LastHeartbeat) > time.Minute {
			displayStatus = "degraded"
		}

		// Filter by runtime if specified
		if filterRuntime != "" && agent.RuntimeType != filterRuntime {
			continue
		}

		// Filter by tag if specified
		if filterTag != "" {
			found := false
			for _, t := range agent.Tags {
				if t == filterTag {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}

		// Return a copy with computed status to avoid data races
		agentCopy := *agent
		agentCopy.Status = displayStatus
		agents = append(agents, &agentCopy)
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

// DeleteAgent removes an agent and all associated data.
func (h *AgentHandler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.Lock()
	delete(h.agents, id)
	h.mu.Unlock()

	// Clean up all associated data
	h.DB.Where("agent_id = ?", id).Delete(&models.Agent{})
	h.DB.Where("agent_id = ?", id).Delete(&models.AgentSnapshot{})
	h.DB.Where("agent_id = ?", id).Delete(&models.AlertEvent{})
	if h.MetricsStore != nil {
		h.MetricsStore.DeleteByAgent(id)
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Agent removed"})
}

// UpdateAgentTags updates the tags for an agent.
// PUT /api/v1/agents/{id}/tags with body {"tags": ["prod", "us-east"]}
func (h *AgentHandler) UpdateAgentTags(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Update in-memory state
	h.mu.Lock()
	agent, exists := h.agents[id]
	if exists {
		agent.Tags = body.Tags
	}
	h.mu.Unlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	// Persist to DB
	tagsJSON, _ := json.Marshal(body.Tags)
	h.DB.Model(&models.Agent{}).Where("agent_id = ?", id).Update("tags", tagsJSON)

	WriteJSON(w, http.StatusOK, map[string]interface{}{"message": "Tags updated", "tags": body.Tags})
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

	h.updateGauges()
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ReceiveReport handles agent data report
func (h *AgentHandler) ReceiveReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	observability.ReportIngestTotal.Inc()

	var report protocol.AgentReport
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		observability.ReportIngestErrors.Inc()
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

	// Enqueue DB writes via worker pool (non-blocking)
	h.mu.RLock()
	snapshotAgent := h.agents[id]
	h.mu.RUnlock()

	select {
	case h.writeQueue <- persistJob{
		agentID: id,
		state:   snapshotAgent,
		metrics: report.Metrics,
	}:
	default:
		log.Printf("Write queue full, dropping persist job for agent %s", id)
	}

	h.updateGauges()
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

// GetAgentContainers returns containers from a specific agent with merged metrics.
func (h *AgentHandler) GetAgentContainers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	result := make([]AgentContainerResponse, 0, len(agent.Containers))
	for _, c := range agent.Containers {
		cpuUsage := "0.00%"
		memUsage := "0 B"
		diskIO := "0 B / 0 B"
		var networkRx, networkTx uint64

		if m, ok := agent.Metrics[c.ID]; ok {
			cpuUsage = fmt.Sprintf("%.2f%%", m.CPUPercent)
			memUsage = formatMetricBytes(m.MemoryUsage)
			diskIO = fmt.Sprintf("%s / %s", formatMetricBytes(m.BlockRead), formatMetricBytes(m.BlockWrite))
			networkRx = m.NetworkRx
			networkTx = m.NetworkTx
		}

		result = append(result, AgentContainerResponse{
			ID:          c.ID,
			Name:        c.Name,
			Image:       c.Image,
			ImageID:     c.ImageID,
			Command:     c.Command,
			Created:     c.Created,
			State:       c.State,
			Status:      c.Status,
			Ports:       c.Ports,
			Labels:      c.Labels,
			NetworkMode: c.NetworkMode,
			Mounts:      c.Mounts,
			CPUUsage:    cpuUsage,
			MemoryUsage: memUsage,
			DiskIO:      diskIO,
			NetworkRx:   networkRx,
			NetworkTx:   networkTx,
		})
	}

	WriteJSON(w, http.StatusOK, result)
}

// GetAgentImages returns images from a specific agent with computed usage status.
func (h *AgentHandler) GetAgentImages(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	h.mu.RLock()
	agent, exists := h.agents[id]
	h.mu.RUnlock()

	if !exists {
		ErrorJSON(w, http.StatusNotFound, "Agent not found")
		return
	}

	usedImages := computeUsedImageIDs(agent.Containers)

	result := make([]AgentImageResponse, 0, len(agent.Images))
	for _, img := range agent.Images {
		status := "unused"
		if usedImages[img.ID] {
			status = "used"
		} else {
			for _, tag := range img.RepoTags {
				if usedImages[tag] {
					status = "used"
					break
				}
			}
		}

		result = append(result, AgentImageResponse{
			ID:              img.ID,
			RepoTags:        img.RepoTags,
			RepoDigests:     img.RepoDigests,
			Created:         img.Created,
			Size:            img.Size,
			VirtualSize:     img.VirtualSize,
			Labels:          img.Labels,
			Containers:      img.Containers,
			Status:          status,
			UpdateAvailable: false,
		})
	}

	WriteJSON(w, http.StatusOK, result)
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


// GetAgentStates implements alerts.AgentStateProvider for the alert evaluator.
func (h *AgentHandler) GetAgentStates() map[string]alerts.AgentInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make(map[string]alerts.AgentInfo, len(h.agents))
	for id, agent := range h.agents {
		result[id] = alerts.AgentInfo{
			ID:            agent.ID,
			Name:          agent.Name,
			Status:        agent.Status,
			LastHeartbeat: agent.LastHeartbeat,
			Containers:    len(agent.Containers),
		}
	}
	return result
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

// QueryContainerMetrics returns historical metrics for a specific container.
// GET /api/v1/metrics/containers/{containerId}?from=&to=&limit=&agent_id=
func (h *AgentHandler) QueryContainerMetrics(w http.ResponseWriter, r *http.Request) {
	containerID := chi.URLParam(r, "containerId")

	if h.MetricsStore == nil {
		ErrorJSON(w, http.StatusServiceUnavailable, "Metrics store not available")
		return
	}

	params := h.parseMetricsQuery(r)
	params.ContainerID = containerID

	results, err := h.MetricsStore.QueryMetrics(params)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Failed to query metrics: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, results)
}

// QueryAgentMetrics returns historical metrics for all containers on an agent.
// GET /api/v1/agents/{id}/metrics?from=&to=&limit=&container_id=
func (h *AgentHandler) QueryAgentMetrics(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")

	if h.MetricsStore == nil {
		ErrorJSON(w, http.StatusServiceUnavailable, "Metrics store not available")
		return
	}

	params := h.parseMetricsQuery(r)
	params.AgentID = agentID

	results, err := h.MetricsStore.QueryMetrics(params)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Failed to query metrics: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, results)
}

// parseMetricsQuery extracts common query parameters for metrics endpoints.
func (h *AgentHandler) parseMetricsQuery(r *http.Request) metrics.QueryParams {
	params := metrics.QueryParams{}

	if v := r.URL.Query().Get("agent_id"); v != "" {
		params.AgentID = v
	}
	if v := r.URL.Query().Get("container_id"); v != "" {
		params.ContainerID = v
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			params.From = t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			params.To = t
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			params.Limit = n
		}
	}

	return params
}

// scrapeURLtoWS converts an http/https scrape URL to a ws/wss WebSocket URL.
func scrapeURLtoWS(scrapeURL string) string {
	if len(scrapeURL) >= 8 && scrapeURL[:8] == "https://" {
		return "wss://" + scrapeURL[8:]
	}
	if len(scrapeURL) >= 7 && scrapeURL[:7] == "http://" {
		return "ws://" + scrapeURL[7:]
	}
	return "ws://" + scrapeURL
}

// wsDialer is a shared dialer with a sensible handshake timeout.
var wsDialer = &websocket.Dialer{HandshakeTimeout: 10 * time.Second}

// ProxyStreamExec proxies usage of the exec-stream to an agent
func (h *AgentHandler) ProxyStreamExec(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")
	containerID := chi.URLParam(r, "containerId")

	h.mu.RLock()
	agent, exists := h.agents[agentID]
	h.mu.RUnlock()

	if !exists {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	// Local mode: serve directly from local Docker client (no remote agent)
	if agent.Mode == "local" {
		localHandler := &ContainerHandler{}
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", containerID)
		req := r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
		localHandler.StreamExec(w, req)
		return
	}

	if agent.ScrapeURL == "" {
		http.Error(w, "Agent scrape URL not configured", http.StatusBadGateway)
		return
	}

	targetURL := scrapeURLtoWS(agent.ScrapeURL) + "/api/exec?id=" + containerID

	agentConn, _, err := wsDialer.DialContext(r.Context(), targetURL, nil)
	if err != nil {
		log.Printf("ProxyStreamExec: dial failed: %v", err)
		http.Error(w, "Failed to connect to agent: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer agentConn.Close()

	// Upgrade Client Connection
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	// Pipe
	errCh := make(chan error, 2)

	go func() {
		for {
			mt, message, err := agentConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := clientConn.WriteMessage(mt, message); err != nil {
				errCh <- err
				return
			}
		}
	}()

	go func() {
		for {
			mt, message, err := clientConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := agentConn.WriteMessage(mt, message); err != nil {
				errCh <- err
				return
			}
		}
	}()

	<-errCh
}

// ProxyListContainerFiles proxies file listing to an agent
func (h *AgentHandler) ProxyListContainerFiles(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")
	containerID := chi.URLParam(r, "containerId")
	path := r.URL.Query().Get("path")

	h.mu.RLock()
	agent, exists := h.agents[agentID]
	h.mu.RUnlock()

	if !exists {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	if agent.ScrapeURL == "" {
		http.Error(w, "Agent scrape URL not configured", http.StatusBadGateway)
		return
	}

	// Construct Agent HTTP URL
	targetURL := agent.ScrapeURL + "/api/files?id=" + containerID + "&path=" + path

	resp, err := http.Get(targetURL)
	if err != nil {
		http.Error(w, "Failed to contact agent", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copy headers
	for k, v := range resp.Header {
		w.Header()[k] = v
	}
	w.WriteHeader(resp.StatusCode)

	// Copy body
	io.Copy(w, resp.Body)
}

// ProxyStreamLogs proxies log streaming to an agent
func (h *AgentHandler) ProxyStreamLogs(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")
	containerID := chi.URLParam(r, "containerId")

	// Pass through query params (tail, since) — strip the user JWT so it's not forwarded
	params := r.URL.Query()
	params.Del("token")
	query := params.Encode()

	h.mu.RLock()
	agent, exists := h.agents[agentID]
	h.mu.RUnlock()

	if !exists {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	// Local mode: serve directly from local Docker client (no remote agent)
	if agent.Mode == "local" {
		localHandler := &ContainerHandler{}
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", containerID)
		req := r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
		localHandler.StreamLogs(w, req)
		return
	}

	if agent.ScrapeURL == "" {
		http.Error(w, "Agent scrape URL not configured", http.StatusBadGateway)
		return
	}

	// Build target WebSocket URL — scrapeURL is http/https, convert to ws/wss
	targetURL := scrapeURLtoWS(agent.ScrapeURL) + "/api/logs?id=" + containerID
	if query != "" {
		targetURL += "&" + query
	}

	log.Printf("ProxyStreamLogs: agent=%s container=%s -> %s", agentID, containerID, targetURL)

	agentConn, _, err := wsDialer.DialContext(r.Context(), targetURL, nil)
	if err != nil {
		log.Printf("ProxyStreamLogs: dial failed: %v", err)
		http.Error(w, "Failed to connect to agent: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer agentConn.Close()

	// Upgrade client connection to WebSocket
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ProxyStreamLogs: client upgrade failed: %v", err)
		return
	}
	defer clientConn.Close()

	// Bidirectional pipe — stop on first error in either direction
	errCh := make(chan error, 2)

	go func() {
		for {
			mt, msg, err := agentConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := clientConn.WriteMessage(mt, msg); err != nil {
				errCh <- err
				return
			}
		}
	}()

	go func() {
		for {
			_, _, err := clientConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
		}
	}()

	<-errCh
}

// ProxyStreamStats proxies stats streaming to an agent
func (h *AgentHandler) ProxyStreamStats(w http.ResponseWriter, r *http.Request) {
	agentID := chi.URLParam(r, "id")
	containerID := chi.URLParam(r, "containerId")

	h.mu.RLock()
	agent, exists := h.agents[agentID]
	h.mu.RUnlock()

	if !exists {
		http.Error(w, "Agent not found", http.StatusNotFound)
		return
	}

	// Local mode: serve directly from local Docker client (no remote agent)
	if agent.Mode == "local" {
		localHandler := &ContainerHandler{}
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("id", containerID)
		req := r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
		localHandler.StreamStats(w, req)
		return
	}

	if agent.ScrapeURL == "" {
		http.Error(w, "Agent scrape URL not configured", http.StatusBadGateway)
		return
	}

	targetURL := scrapeURLtoWS(agent.ScrapeURL) + "/api/stats?id=" + containerID

	agentConn, _, err := wsDialer.DialContext(r.Context(), targetURL, nil)
	if err != nil {
		log.Printf("ProxyStreamStats: dial failed: %v", err)
		http.Error(w, "Failed to connect to agent: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer agentConn.Close()

	// Upgrade Client Connection
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer clientConn.Close()

	// Pipe
	errCh := make(chan error, 2)

	go func() {
		for {
			mt, message, err := agentConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := clientConn.WriteMessage(mt, message); err != nil {
				errCh <- err
				return
			}
		}
	}()

	go func() {
		for {
		    // We don't expect input from client for stats, but keep pipe open
			_, _, err := clientConn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
		}
	}()

	<-errCh
}








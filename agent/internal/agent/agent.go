package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"conman-agent/internal/runtime"
	"conman-agent/pkg/protocol"

	"github.com/docker/docker/client"
)

// Agent is the main agent struct
type Agent struct {
	cfg        *Config
	runtime    runtime.ContainerRuntime
	httpServer *http.Server

	// State
	mu           sync.RWMutex
	hostInfo     *protocol.HostInfo
	stats        *protocol.SystemStats
	containers   []protocol.Container
	images       []protocol.Image
	networks     []protocol.Network
	volumes      []protocol.Volume
	metrics      []protocol.ContainerMetrics
	registered   bool
	lastReport   time.Time
	lastHeartbeat time.Time

	// Channels
	eventsCh chan protocol.ContainerEvent
	stopCh   chan struct{}

	// Report buffer for offline resilience
	buffer *ReportBuffer
}

// New creates a new agent instance
func New(cfg *Config) (*Agent, error) {
	// Create runtime provider based on configuration
	runtimeCfg := runtime.RuntimeConfig{
		Type:       runtime.RuntimeType(cfg.RuntimeType),
		SocketPath: cfg.RuntimeSocketPath,
		UseCLI:     cfg.RuntimeUseCLI,
		Namespace:  cfg.ContainerdNamespace,
	}

	runtimeProvider, err := runtime.NewRuntime(runtimeCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create runtime provider: %w", err)
	}

	// Verify runtime connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	if err := runtimeProvider.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to runtime (%s): %w", cfg.RuntimeType, err)
	}

	return &Agent{
		cfg:      cfg,
		runtime:  runtimeProvider,
		eventsCh: make(chan protocol.ContainerEvent, 100),
		stopCh:   make(chan struct{}),
		buffer:   NewReportBuffer(),
	}, nil
}

// dockerClient returns the underlying Docker-compatible API client from the runtime provider.
// Used by api.go for advanced operations (exec, logs streaming, stats streaming) that require
// direct Docker SDK access. Returns nil if the runtime doesn't expose a Docker client.
func (a *Agent) dockerClient() *client.Client {
	type clientProvider interface {
		Client() *client.Client
	}
	if cp, ok := a.runtime.(clientProvider); ok {
		return cp.Client()
	}
	return nil
}

// Run starts the agent
func (a *Agent) Run(ctx context.Context) error {
	log.Println("Starting agent components...")

	// Collect host info once at startup
	if err := a.collectHostInfo(ctx); err != nil {
		log.Printf("Warning: failed to collect host info: %v", err)
	}

	// Start components based on mode
	var wg sync.WaitGroup

	// Always collect containers and state
	wg.Add(1)
	go func() {
		defer wg.Done()
		a.runCollector(ctx)
	}()

	// Collect metrics if enabled
	if a.cfg.CollectMetrics {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.runMetricsCollector(ctx)
		}()
	}

	// Watch events if enabled
	if a.cfg.CollectEvents {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.runEventWatcher(ctx)
		}()
	}

	// Start scrape server if enabled
	if a.cfg.ScrapeEnabled && (a.cfg.Mode == ModeScrape || a.cfg.Mode == ModeHybrid) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.runScrapeServer(ctx)
		}()
	}

	// Start push client if enabled
	if a.cfg.PushEnabled && (a.cfg.Mode == ModePush || a.cfg.Mode == ModeHybrid) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.runPushClient(ctx)
		}()

		// Run heartbeat
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.runHeartbeat(ctx)
		}()
	}

	// Wait for all goroutines
	wg.Wait()
	return nil
}

// Shutdown gracefully stops the agent
func (a *Agent) Shutdown(ctx context.Context) error {
	close(a.stopCh)

	if a.httpServer != nil {
		if err := a.httpServer.Shutdown(ctx); err != nil {
			return fmt.Errorf("failed to shutdown HTTP server: %w", err)
		}
	}

	if a.runtime != nil {
		if err := a.runtime.Close(); err != nil {
			return fmt.Errorf("failed to close runtime provider: %w", err)
		}
	}

	return nil
}

// runCollector periodically collects container/image/network/volume data
func (a *Agent) runCollector(ctx context.Context) {
	ticker := time.NewTicker(a.cfg.CollectInterval)
	defer ticker.Stop()

	// Initial collection
	a.collect(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			a.collect(ctx)
		}
	}
}

func (a *Agent) collect(ctx context.Context) {
	// Always collect system stats
	if err := a.collectSystemStats(ctx); err != nil {
		log.Printf("Error collecting system stats: %v", err)
	}

	if a.cfg.CollectContainers {
		if err := a.collectContainers(ctx); err != nil {
			log.Printf("Error collecting containers: %v", err)
		}
	}

	if a.cfg.CollectImages {
		if err := a.collectImages(ctx); err != nil {
			log.Printf("Error collecting images: %v", err)
		}
	}

	if a.cfg.CollectNetworks {
		if err := a.collectNetworks(ctx); err != nil {
			log.Printf("Error collecting networks: %v", err)
		}
	}

	if a.cfg.CollectVolumes {
		if err := a.collectVolumes(ctx); err != nil {
			log.Printf("Error collecting volumes: %v", err)
		}
	}
}

// runMetricsCollector periodically collects container metrics
func (a *Agent) runMetricsCollector(ctx context.Context) {
	ticker := time.NewTicker(a.cfg.MetricsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			if err := a.collectMetrics(ctx); err != nil {
				log.Printf("Error collecting metrics: %v", err)
			}
		}
	}
}

// runScrapeServer starts HTTP server for Prometheus-style scraping
func (a *Agent) runScrapeServer(ctx context.Context) {
	mux := http.NewServeMux()

	// Health endpoint
	mux.HandleFunc("/health", a.handleHealth)

	// API endpoints for on-demand queries
	mux.HandleFunc("/api/info", a.handleInfo)
	mux.HandleFunc("/api/containers", a.handleContainers)
	mux.HandleFunc("/api/images", a.handleImages)
    mux.HandleFunc("/api/images/pull", a.handlePullImage)
	mux.HandleFunc("/api/networks", a.handleNetworks)
	mux.HandleFunc("/api/volumes", a.handleVolumes)
	mux.HandleFunc("/api/metrics", a.handleMetrics)
	mux.HandleFunc("/api/report", a.handleFullReport)
	
	// Inspection Endpoints
	mux.HandleFunc("/api/containers/inspect", a.handleInspectContainer)
	mux.HandleFunc("/api/images/inspect", a.handleInspectImage)
	mux.HandleFunc("/api/networks/inspect", a.handleInspectNetwork)
	mux.HandleFunc("/api/networks/duplicate", a.handleDuplicateNetwork)
	mux.HandleFunc("/api/networks/connect", a.handleConnectNetwork)
	mux.HandleFunc("/api/volumes/inspect", a.handleInspectVolume)
    mux.HandleFunc("/api/images/check-update", a.handleCheckImageUpdate)
    mux.HandleFunc("/api/stacks", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
            case "GET": a.handleListStacks(w, r)
            case "POST": a.handleCreateStack(w, r)
        }
    })
    mux.HandleFunc("/api/stacks/up", a.handleUpStack)
    mux.HandleFunc("/api/stacks/restart", a.handleRestartStack)
    mux.HandleFunc("/api/stacks/remove", a.handleRemoveStack)

	mux.HandleFunc("/api/system/df", a.handleSystemDF)
	mux.HandleFunc("/api/system/prune", a.handleSystemPrune)
	mux.HandleFunc("/api/containers/prune", a.handlePruneContainers)
	mux.HandleFunc("/api/images/prune", a.handlePruneImages)
	mux.HandleFunc("/api/volumes/prune", a.handlePruneVolumes)
	mux.HandleFunc("/api/networks/prune", a.handlePruneNetworks)

	// Prometheus-compatible operational metrics for the agent itself
	mux.HandleFunc("/prom/metrics", a.handlePromMetrics)
	
    // Container Lifecycle Endpoints
    mux.HandleFunc("/api/containers/start", a.handleStartContainer)
    mux.HandleFunc("/api/containers/stop", a.handleStopContainer)
    mux.HandleFunc("/api/containers/restart", a.handleRestartContainer)
    mux.HandleFunc("/api/containers/remove", a.handleRemoveContainer)
    mux.HandleFunc("/api/images/remove", a.handleRemoveImage)
    mux.HandleFunc("/api/networks/remove", a.handleRemoveNetwork)
    mux.HandleFunc("/api/volumes/remove", a.handleRemoveVolume)

	// Remote Control Endpoints
	mux.HandleFunc("/api/exec", a.handleStreamExec)
	mux.HandleFunc("/api/files", a.handleListFiles)
	mux.HandleFunc("/api/logs", a.handleStreamLogs)
	mux.HandleFunc("/api/stats", a.handleStreamStats)


	a.httpServer = &http.Server{
		Addr:    fmt.Sprintf(":%d", a.cfg.ScrapePort),
		Handler: mux,
	}

	log.Printf("Starting scrape server on port %d", a.cfg.ScrapePort)

	go func() {
		if err := a.httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	<-ctx.Done()
}

// HTTP Handlers
func (a *Agent) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"agent_id":  a.cfg.AgentID,
		"agent_name": a.cfg.AgentName,
		"uptime":    time.Since(a.lastReport).String(),
	})
}

func (a *Agent) handleInfo(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"agent_id":   a.cfg.AgentID,
		"agent_name": a.cfg.AgentName,
		"host_info":  a.hostInfo,
		"registered": a.registered,
	})
}

func (a *Agent) handleContainers(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// Build a metrics lookup by container ID
	metricsMap := make(map[string]*protocol.ContainerMetrics, len(a.metrics))
	for i := range a.metrics {
		metricsMap[a.metrics[i].ContainerID] = &a.metrics[i]
	}

	// Enrich containers with stats for the frontend
	type enrichedContainer struct {
		protocol.Container
		CpuUsage    string `json:"cpu_usage"`
		MemoryUsage string `json:"memory_usage"`
		DiskIO      string `json:"disk_io"`
		NetworkRx   uint64 `json:"network_rx"`
		NetworkTx   uint64 `json:"network_tx"`
	}

	result := make([]enrichedContainer, 0, len(a.containers))
	for _, c := range a.containers {
		ec := enrichedContainer{Container: c}
		if m, ok := metricsMap[c.ID]; ok {
			ec.CpuUsage = fmt.Sprintf("%.1f%%", m.CPUPercent)
			if m.MemoryUsage > 1024*1024*1024 {
				ec.MemoryUsage = fmt.Sprintf("%.1f GB", float64(m.MemoryUsage)/(1024*1024*1024))
			} else {
				ec.MemoryUsage = fmt.Sprintf("%.1f MB", float64(m.MemoryUsage)/(1024*1024))
			}
			ec.DiskIO = fmt.Sprintf("%s / %s", formatBytesShort(m.BlockRead), formatBytesShort(m.BlockWrite))
			ec.NetworkRx = m.NetworkRx
			ec.NetworkTx = m.NetworkTx
		}
		result = append(result, ec)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func formatBytesShort(b uint64) string {
	switch {
	case b >= 1024*1024*1024:
		return fmt.Sprintf("%.1f GB", float64(b)/(1024*1024*1024))
	case b >= 1024*1024:
		return fmt.Sprintf("%.1f MB", float64(b)/(1024*1024))
	case b >= 1024:
		return fmt.Sprintf("%.1f KB", float64(b)/1024)
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func (a *Agent) handleImages(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()

	// Build a set of image IDs that are in use by containers
	usedImages := make(map[string]int)
	for _, c := range a.containers {
		usedImages[c.Image]++
		// Also match by image ID prefix (container.Image might be name:tag)
		// We'll match by ImageID below
	}

	type enrichedImage struct {
		protocol.Image
		Status string `json:"status"`
	}

	result := make([]enrichedImage, 0, len(a.images))
	for _, img := range a.images {
		ei := enrichedImage{Image: img}
		// Check if any container references this image by tag or ID
		inUse := img.Containers > 0
		if !inUse {
			for _, tag := range img.RepoTags {
				if usedImages[tag] > 0 {
					inUse = true
					break
				}
			}
		}
		if inUse {
			ei.Status = "used"
		} else {
			ei.Status = "unused"
		}
		result = append(result, ei)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (a *Agent) handleNetworks(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.networks)
}

func (a *Agent) handleVolumes(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.volumes)
}

func (a *Agent) handleMetrics(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.metrics)
}

func (a *Agent) handleFullReport(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	report := a.buildReport()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

func (a *Agent) buildReport() *protocol.AgentReport {
	return &protocol.AgentReport{
		AgentID:    a.cfg.AgentID,
		AgentName:  a.cfg.AgentName,
		Timestamp:  time.Now(),
		HostInfo:   a.hostInfo,
		Stats:      a.stats,
		Containers: a.containers,
		Metrics:    a.metrics, // Added field
		Images:     a.images,
		Networks:   a.networks,
		Volumes:    a.volumes,
	}
}

// handlePromMetrics returns Prometheus-text-format operational metrics for the agent.
func (a *Agent) handlePromMetrics(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	containersCollected := len(a.containers)
	registered := a.registered
	bufferSize := a.buffer.Size()
	a.mu.RUnlock()

	regVal := 0
	if registered {
		regVal = 1
	}

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	fmt.Fprintf(w, "# HELP conman_agent_containers_collected Number of containers currently collected.\n")
	fmt.Fprintf(w, "# TYPE conman_agent_containers_collected gauge\n")
	fmt.Fprintf(w, "conman_agent_containers_collected %d\n", containersCollected)
	fmt.Fprintf(w, "# HELP conman_agent_registered Whether the agent is registered with the server.\n")
	fmt.Fprintf(w, "# TYPE conman_agent_registered gauge\n")
	fmt.Fprintf(w, "conman_agent_registered %d\n", regVal)
	fmt.Fprintf(w, "# HELP conman_agent_buffer_size Number of reports buffered for retry.\n")
	fmt.Fprintf(w, "# TYPE conman_agent_buffer_size gauge\n")
	fmt.Fprintf(w, "conman_agent_buffer_size %d\n", bufferSize)
}

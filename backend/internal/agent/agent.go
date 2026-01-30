package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"conman-backend/pkg/protocol"

	"github.com/docker/docker/client"
)

// Agent is the main agent struct
type Agent struct {
	cfg        *Config
	docker     *client.Client
	httpServer *http.Server

	// State
	mu           sync.RWMutex
	hostInfo     *protocol.HostInfo
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
}

// New creates a new agent instance
func New(cfg *Config) (*Agent, error) {
	// Create Docker client
	dockerClient, err := client.NewClientWithOpts(
		client.WithHost(cfg.DockerHost),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create Docker client: %w", err)
	}

	// Verify Docker connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	_, err = dockerClient.Ping(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Docker: %w", err)
	}

	return &Agent{
		cfg:      cfg,
		docker:   dockerClient,
		eventsCh: make(chan protocol.ContainerEvent, 100),
		stopCh:   make(chan struct{}),
	}, nil
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

	if a.docker != nil {
		if err := a.docker.Close(); err != nil {
			return fmt.Errorf("failed to close Docker client: %w", err)
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
	mux.HandleFunc("/api/networks", a.handleNetworks)
	mux.HandleFunc("/api/volumes", a.handleVolumes)
	mux.HandleFunc("/api/metrics", a.handleMetrics)
	mux.HandleFunc("/api/report", a.handleFullReport)

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
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.containers)
}

func (a *Agent) handleImages(w http.ResponseWriter, r *http.Request) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a.images)
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
		Containers: a.containers,
		Images:     a.images,
		Networks:   a.networks,
		Volumes:    a.volumes,
	}
}

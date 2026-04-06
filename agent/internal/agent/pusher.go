package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"conman-agent/pkg/protocol"

	"github.com/docker/docker/api/types"
)

// runPushClient runs the push client that sends data to the central server
func (a *Agent) runPushClient(ctx context.Context) {
	// First, register with the server
	if err := a.registerWithServer(ctx); err != nil {
		log.Printf("Warning: Failed to register with server: %v", err)
	}

	ticker := time.NewTicker(a.cfg.CollectInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			if err := a.pushReport(ctx); err != nil {
				log.Printf("Failed to push report: %v", err)
			}
		}
	}
}

// runHeartbeat sends periodic heartbeats to the server
func (a *Agent) runHeartbeat(ctx context.Context) {
	ticker := time.NewTicker(a.cfg.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case <-ticker.C:
			if err := a.sendHeartbeat(ctx); err != nil {
				log.Printf("Failed to send heartbeat: %v", err)
			}
		}
	}
}

// runEventWatcher watches for Docker events and pushes them to server
func (a *Agent) runEventWatcher(ctx context.Context) {
	eventsCh, errsCh := a.docker.Events(ctx, types.EventsOptions{})

	for {
		select {
		case <-ctx.Done():
			return
		case <-a.stopCh:
			return
		case err := <-errsCh:
			if err != nil {
				log.Printf("Docker events error: %v", err)
				// Retry after delay
				time.Sleep(5 * time.Second)
				eventsCh, errsCh = a.docker.Events(ctx, types.EventsOptions{})
			}
		case event := <-eventsCh:
			// Only handle container events
			if event.Type == "container" {
				containerEvent := protocol.ContainerEvent{
					AgentID:       a.cfg.AgentID,
					ContainerID:   event.Actor.ID,
					ContainerName: event.Actor.Attributes["name"],
					Action:        string(event.Action),
					Timestamp:     time.Unix(event.Time, event.TimeNano),
					Attributes:    event.Actor.Attributes,
				}

				// Push event to server
				if a.cfg.PushEnabled {
					go a.pushEvent(ctx, containerEvent)
				}

				// Also send to internal channel
				select {
				case a.eventsCh <- containerEvent:
				default:
					// Channel full, skip
				}
			}
		}
	}
}

// registerWithServer registers the agent with the central server
func (a *Agent) registerWithServer(ctx context.Context) error {
	a.mu.RLock()
	hostInfo := a.hostInfo
	a.mu.RUnlock()

	registration := protocol.AgentRegistration{
		AgentID:   a.cfg.AgentID,
		AgentName: a.cfg.AgentName,
		HostInfo:  hostInfo,
		Version:   "1.0.0",
		Mode:      string(a.cfg.Mode),
		Timestamp: time.Now(),
	}

	if a.cfg.ScrapeEnabled {
		host := a.cfg.AgentName
		if a.cfg.AdvertisedAddress != "" {
			host = a.cfg.AdvertisedAddress
		}
		registration.ScrapeURL = fmt.Sprintf("http://%s:%d", host, a.cfg.ScrapePort)
	}

	data, err := json.Marshal(registration)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/v1/agents/register", a.cfg.ServerURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if a.cfg.ServerToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.cfg.ServerToken)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("registration failed with status: %d", resp.StatusCode)
	}

	a.mu.Lock()
	a.registered = true
	a.mu.Unlock()

	log.Println("Successfully registered with server")
	return nil
}

// pushReport sends the full data report to the server
func (a *Agent) pushReport(ctx context.Context) error {
	a.mu.RLock()
	report := a.buildReport()
	a.mu.RUnlock()

	data, err := json.Marshal(report)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/v1/agents/%s/report", a.cfg.ServerURL, a.cfg.AgentID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if a.cfg.ServerToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.cfg.ServerToken)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusUnauthorized {
		log.Printf("Server returned %d, attempting to re-register...", resp.StatusCode)
		if err := a.registerWithServer(ctx); err != nil {
			return fmt.Errorf("re-registration failed: %v", err)
		}
		return fmt.Errorf("server session lost, re-registered")
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("push report failed with status: %d", resp.StatusCode)
	}

	a.mu.Lock()
	a.lastReport = time.Now()
	a.mu.Unlock()

	return nil
}

// sendHeartbeat sends a heartbeat to the server
func (a *Agent) sendHeartbeat(ctx context.Context) error {
	a.mu.RLock()
	runningCount := 0
	for _, c := range a.containers {
		if c.State == "running" {
			runningCount++
		}
	}

	heartbeat := protocol.AgentHeartbeat{
		AgentID:        a.cfg.AgentID,
		AgentName:      a.cfg.AgentName,
		Timestamp:      time.Now(),
		ContainerCount: len(a.containers),
		RunningCount:   runningCount,
		Status:         "healthy",
	}
	a.mu.RUnlock()

	data, err := json.Marshal(heartbeat)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/v1/agents/%s/heartbeat", a.cfg.ServerURL, a.cfg.AgentID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if a.cfg.ServerToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.cfg.ServerToken)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusUnauthorized {
		log.Printf("Server returned %d, attempting to re-register...", resp.StatusCode)
		if err := a.registerWithServer(ctx); err != nil {
			return fmt.Errorf("re-registration failed: %v", err)
		}
		return fmt.Errorf("server session lost, re-registered")
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("heartbeat failed with status: %d", resp.StatusCode)
	}

	a.mu.Lock()
	a.lastHeartbeat = time.Now()
	a.mu.Unlock()

	return nil
}

// pushEvent sends a container event to the server
func (a *Agent) pushEvent(ctx context.Context, event protocol.ContainerEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/api/v1/agents/%s/events", a.cfg.ServerURL, a.cfg.AgentID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if a.cfg.ServerToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.cfg.ServerToken)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("push event failed with status: %d", resp.StatusCode)
	}

	return nil
}

package service

import (
	"context"
	"log"
	"os"
	"runtime"
	"time"

	"conman-backend/internal/models"
	"conman-backend/pkg/protocol"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"gorm.io/gorm"
)

// LocalAgentRegistrar is implemented by AgentHandler to allow local agent registration
// without creating an import cycle (service -> api).
type LocalAgentRegistrar interface {
	RegisterLocalAgent(reg protocol.AgentRegistration)
}

// DetectAndRegisterLocalAgent checks if a container runtime socket is available
// on the same host as the server. If found and no agent is registered for this
// hostname, it auto-registers a "local" agent so the server can manage its own host.
func DetectAndRegisterLocalAgent(db *gorm.DB, registrar LocalAgentRegistrar) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Local agent detect: panic recovered: %v", r)
		}
	}()

	// Small delay to let the server fully start
	time.Sleep(3 * time.Second)
	log.Println("Local agent detect: starting runtime detection...")

	hostname, err := os.Hostname()
	if err != nil {
		log.Printf("Local agent detect: could not get hostname: %v", err)
		return
	}

	// Check if an agent for this host already exists
	var existing models.Agent
	if err := db.Where("name LIKE ?", hostname+"%").First(&existing).Error; err == nil {
		log.Printf("Local agent detect: agent already registered for %s, skipping", hostname)
		return
	}

	// Detect available runtime
	runtimeType, socketPath := detectLocalRuntime()
	if runtimeType == "" {
		log.Println("Local agent detect: no container runtime socket found on this host")
		return
	}

	// Collect host info
	hostInfo := collectLocalHostInfo(runtimeType)

	agentID := "local-" + hostname
	reg := protocol.AgentRegistration{
		AgentID:     agentID,
		AgentName:   hostname + " (local)",
		RuntimeType: runtimeType,
		Mode:        "local",
		HostInfo:    hostInfo,
		Timestamp:   time.Now(),
	}

	registrar.RegisterLocalAgent(reg)
	log.Printf("Auto-registered local host: %s (runtime: %s at %s)", hostname, runtimeType, socketPath)
}

func detectLocalRuntime() (runtimeType string, socketPath string) {
	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		return "docker", "/var/run/docker.sock"
	}
	if _, err := os.Stat("/run/podman/podman.sock"); err == nil {
		return "podman", "/run/podman/podman.sock"
	}
	if _, err := os.Stat("/run/containerd/containerd.sock"); err == nil {
		return "containerd", "/run/containerd/containerd.sock"
	}
	return "", ""
}

func collectLocalHostInfo(runtimeType string) *protocol.HostInfo {
	info := &protocol.HostInfo{
		RuntimeType:  runtimeType,
		Architecture: runtime.GOARCH,
	}

	if h, err := host.Info(); err == nil {
		info.Hostname = h.Hostname
		info.OS = h.OS + " " + h.PlatformVersion
		info.KernelVersion = h.KernelVersion
	}
	if cpus, err := cpu.Counts(true); err == nil {
		info.CPUs = cpus
	}
	if m, err := mem.VirtualMemory(); err == nil {
		info.MemoryTotal = int64(m.Total)
	}

	// Get runtime version from existing Docker client if available
	if runtimeType == "docker" && DockerClient != nil {
		if ver, err := DockerClient.ServerVersion(context.Background()); err == nil {
			info.RuntimeVersion = ver.Version
			info.DockerVersion = ver.Version
		}
	}

	return info
}

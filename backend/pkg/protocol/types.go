package protocol

import "time"

// AgentReport is the complete data report sent by an agent
type AgentReport struct {
	AgentID    string      `json:"agent_id"`
	AgentName  string      `json:"agent_name"`
	Timestamp  time.Time   `json:"timestamp"`
	HostInfo   *HostInfo   `json:"host_info,omitempty"`
	Stats      *SystemStats      `json:"stats,omitempty"`
	Containers []Container       `json:"containers,omitempty"`
	Metrics    []ContainerMetrics `json:"metrics,omitempty"` // Added field
	Images     []Image           `json:"images,omitempty"`
	Networks   []Network         `json:"networks,omitempty"`
	Volumes    []Volume          `json:"volumes,omitempty"`
}

// HostInfo contains information about the container runtime host
type HostInfo struct {
	Hostname       string `json:"hostname"`
	OS             string `json:"os"`
	Architecture   string `json:"architecture"`
	KernelVersion  string `json:"kernel_version"`
	CPUs           int    `json:"cpus"`
	MemoryTotal    int64  `json:"memory_total"`
	RuntimeType    string `json:"runtime_type"`              // "docker", "podman", "containerd"
	RuntimeVersion string `json:"runtime_version"`           // Version of the container runtime
	RuntimeRootDir string `json:"runtime_root_dir"`          // Root directory of the runtime
	Namespace      string `json:"namespace,omitempty"`       // containerd namespace (empty for docker/podman)
	DockerVersion  string `json:"docker_version,omitempty"`  // Deprecated: use RuntimeVersion
	DockerRootDir  string `json:"docker_root_dir,omitempty"` // Deprecated: use RuntimeRootDir
	StorageDriver  string `json:"storage_driver"`
	ContainerCount int    `json:"container_count"`
	ImageCount     int    `json:"image_count"`
}

// Container represents a Docker container
type Container struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Image      string            `json:"image"`
	ImageID    string            `json:"image_id"`
	Command    string            `json:"command"`
	Created    int64             `json:"created"`
	State      string            `json:"state"`
	Status     string            `json:"status"`
	Ports      []Port            `json:"ports,omitempty"`
	Labels     map[string]string `json:"labels,omitempty"`
	NetworkMode string           `json:"network_mode"`
	Mounts     []Mount           `json:"mounts,omitempty"`
}

// Port represents a container port mapping
type Port struct {
	IP          string `json:"ip,omitempty"`
	PrivatePort uint16 `json:"private_port"`
	PublicPort  uint16 `json:"public_port,omitempty"`
	Type        string `json:"type"`
}

// Mount represents a container mount
type Mount struct {
	Type        string `json:"type"`
	Name        string `json:"name,omitempty"`
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Driver      string `json:"driver,omitempty"`
	Mode        string `json:"mode"`
	RW          bool   `json:"rw"`
}

// Image represents a Docker image
type Image struct {
	ID          string   `json:"id"`
	RepoTags    []string `json:"repo_tags"`
	RepoDigests []string `json:"repo_digests,omitempty"`
	Created     int64    `json:"created"`
	Size        int64    `json:"size"`
	VirtualSize int64    `json:"virtual_size"`
	Labels      map[string]string `json:"labels,omitempty"`
	Containers  int      `json:"containers"` // Number of containers using this image
}

// Network represents a Docker network
type Network struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Scope      string            `json:"scope"`
	Internal   bool              `json:"internal"`
	Attachable bool              `json:"attachable"`
	IPAM       IPAM              `json:"ipam"`
	Labels     map[string]string `json:"labels,omitempty"`
	Containers int               `json:"containers"` // Number of connected containers
	Created    time.Time         `json:"created"`
}

// IPAM represents IP Address Management configuration
type IPAM struct {
	Driver  string       `json:"driver"`
	Config  []IPAMConfig `json:"config,omitempty"`
}

// IPAMConfig represents IPAM subnet configuration
type IPAMConfig struct {
	Subnet  string `json:"subnet"`
	Gateway string `json:"gateway,omitempty"`
}

// Volume represents a Docker volume
type Volume struct {
	Name       string            `json:"name"`
	Driver     string            `json:"driver"`
	Mountpoint string            `json:"mountpoint"`
	CreatedAt  string            `json:"created_at"`
	Labels     map[string]string `json:"labels,omitempty"`
	Scope      string            `json:"scope"`
	Status     map[string]interface{} `json:"status,omitempty"`
	UsageData  *VolumeUsage      `json:"usage_data,omitempty"`
}

// VolumeUsage represents volume disk usage
type VolumeUsage struct {
	Size     int64 `json:"size"`
	RefCount int64 `json:"ref_count"`
}

// ContainerMetrics represents real-time container metrics
type ContainerMetrics struct {
	ContainerID   string    `json:"container_id"`
	ContainerName string    `json:"container_name"`
	Timestamp     time.Time `json:"timestamp"`
	
	// CPU
	CPUPercent    float64 `json:"cpu_percent"`
	CPUUsage      uint64  `json:"cpu_usage"`
	SystemCPU     uint64  `json:"system_cpu"`
	OnlineCPUs    uint32  `json:"online_cpus"`
	
	// Memory
	MemoryUsage   uint64  `json:"memory_usage"`
	MemoryLimit   uint64  `json:"memory_limit"`
	MemoryPercent float64 `json:"memory_percent"`
	MemoryCache   uint64  `json:"memory_cache"`
	
	// Network
	NetworkRx     uint64 `json:"network_rx"`
	NetworkTx     uint64 `json:"network_tx"`
	NetworkRxPackets uint64 `json:"network_rx_packets"`
	NetworkTxPackets uint64 `json:"network_tx_packets"`
	
	// Block I/O
	BlockRead     uint64 `json:"block_read"`
	BlockWrite    uint64 `json:"block_write"`
	
	// PIDs
	PIDs          uint64 `json:"pids"`
}

// ContainerEvent represents a container lifecycle event
type ContainerEvent struct {
	AgentID       string            `json:"agent_id"`
	ContainerID   string            `json:"container_id"`
	ContainerName string            `json:"container_name"`
	Action        string            `json:"action"` // start, stop, die, create, destroy, etc.
	Timestamp     time.Time         `json:"timestamp"`
	Attributes    map[string]string `json:"attributes,omitempty"`
}

// AgentHeartbeat is sent periodically to indicate agent is alive
type AgentHeartbeat struct {
	AgentID        string    `json:"agent_id"`
	AgentName      string    `json:"agent_name"`
	Timestamp      time.Time `json:"timestamp"`
	Uptime         int64     `json:"uptime_seconds"`
	ContainerCount int       `json:"container_count"`
	RunningCount   int       `json:"running_count"`
	Status         string    `json:"status"` // healthy, degraded, unhealthy
}

// AgentRegistration is sent when agent first connects to server
type AgentRegistration struct {
	AgentID     string    `json:"agent_id"`
	AgentName   string    `json:"agent_name"`
	HostInfo    *HostInfo `json:"host_info"`
	Version     string    `json:"version"`
	Mode        string    `json:"mode"`                    // push, scrape, hybrid
	RuntimeType string    `json:"runtime_type,omitempty"`  // "docker", "podman", "containerd"
	ScrapeURL   string    `json:"scrape_url,omitempty"`    // URL for server to scrape (if scrape mode)
	Timestamp   time.Time `json:"timestamp"`
}

// AgentRegistrationResponse is returned by server after registration
type AgentRegistrationResponse struct {
	Success       bool   `json:"success"`
	Message       string `json:"message,omitempty"`
	ServerVersion string `json:"server_version,omitempty"`
}

// SystemStats represents real-time system resource usage
type SystemStats struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryTotal   uint64  `json:"memory_total"`
	MemoryUsed    uint64  `json:"memory_used"`
	MemoryPercent float64 `json:"memory_percent"`
	DiskTotal     uint64  `json:"disk_total"`
	DiskUsed      uint64  `json:"disk_used"`
	DiskPercent   float64 `json:"disk_percent"`
}

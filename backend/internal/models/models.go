package models

import (
	"time"

	"gorm.io/gorm"
)

type ContextKey string

const (
	UserContextKey ContextKey = "user"
	RoleContextKey ContextKey = "role"
)

type User struct {
	gorm.Model
	Email    string `gorm:"uniqueIndex"`
	Password string
	FullName string
	Role     string // "admin", "operator", "viewer"
}

type APIKey struct {
	gorm.Model
	Key         string `gorm:"uniqueIndex"`
	Name        string
	UserID      uint
	User        User
	Role        string // Effective role for this key
	LastUsedAt  int64
	ExpiresAt   int64 // 0 for no expiry
}

type Environment struct {
	gorm.Model
	Name      string `gorm:"uniqueIndex"`
	APIURL    string
	AuthToken string // Encrypted ideally, plain for now
	IsLocal   bool
}

type Container struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Status      string   `json:"status"`
	State       string   `json:"state"`
	Image       string   `json:"image"`
	Created     int64    `json:"created"`
	Ports       []string `json:"ports"`
	IPAddress   string   `json:"ip_address"`
	CPUUsage    string   `json:"cpu_usage"`
	MemoryUsage string   `json:"memory_usage"`
	DiskIO      string   `json:"disk_io"`      // New field for Disk I/O
}

type ContainerAction struct {
    Message string `json:"message"`
}

type Image struct {
	ID              string   `json:"id"`
	Repo            string   `json:"repo"`
	Tags            []string `json:"tags"`
	Size            int64    `json:"size"`
	Created         int64    `json:"created"`
	Status          string   `json:"status"`           // "used" or "unused"
	UpdateAvailable bool     `json:"update_available"` // Default false for now
}

type SystemInfo struct {
	Containers      int    `json:"Containers"`
	Images          int    `json:"Images"`
	DockerVersion   string `json:"ServerVersion"`
	MemoryTotal     int64  `json:"MemTotal"`
	CPUCount        int    `json:"NCPU"`
	Name            string `json:"Name"`
	KernelVersion   string `json:"KernelVersion"`
	OperatingSystem string `json:"OperatingSystem"`
	Architecture    string `json:"Architecture"`
}

type SystemStats struct {
	CPUPercent    float64 `json:"cpu_percent"`
	MemoryTotal   uint64  `json:"memory_total"`
	MemoryUsed    uint64  `json:"memory_used"`
	MemoryPercent float64 `json:"memory_percent"`
	DiskTotal     uint64  `json:"disk_total"`
	DiskUsed      uint64  `json:"disk_used"`
	DiskPercent   float64 `json:"disk_percent"`
}

type Agent struct {
	gorm.Model
	AgentID       string `gorm:"uniqueIndex"`
	Name          string
	Status        string // "healthy", "offline"
	LastHeartbeat time.Time
	LastReport    time.Time
	Mode          string
	Approved      bool   // For potential approval workflow
	HostInfo      []byte // JSON encoded host info
	ScrapeURL     string
	Tags          []byte // JSON array of string tags for fleet filtering (e.g. ["prod","us-east"])
}

type Stack struct {
	gorm.Model
	Name           string `gorm:"uniqueIndex"`
	ComposeContent string // content of docker-compose.yml
	EnvContent     string // content of .env
	Status         string // "active", "stopped", "error"
	Message        string // Last error or status message
}

// AlertRule defines an alert condition that is periodically evaluated.
type AlertRule struct {
	gorm.Model
	Name    string `gorm:"uniqueIndex"`
	Type    string // "agent_offline", "container_stopped", "resource_threshold"
	Config  []byte // JSON config for the rule (thresholds, filters, etc.)
	Enabled bool   `gorm:"default:true"`
}

// AlertChannel defines a notification destination for fired alerts.
type AlertChannel struct {
	gorm.Model
	Name   string `gorm:"uniqueIndex"`
	Type   string // "webhook", "slack", "email"
	Config []byte // JSON config (url, headers, etc.)
}

// AlertEvent records a fired alert instance.
type AlertEvent struct {
	gorm.Model
	RuleID    uint
	Rule      AlertRule
	AgentID   string
	Message   string
	FiredAt   time.Time
	Resolved  bool
}

// AgentSnapshot stores the latest full report from an agent, persisted to DB
// so agent state survives backend restarts and can be shared across instances.
type AgentSnapshot struct {
	gorm.Model
	AgentID    string    `gorm:"uniqueIndex"`
	ReportJSON []byte    `gorm:"type:bytes"` // Compressed JSON of full AgentState
	Timestamp  time.Time // When this snapshot was last updated
}

package models

import (
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

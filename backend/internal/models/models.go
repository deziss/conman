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
    Containers    int `json:"containers"`
    Images        int `json:"images"`
    DockerVersion string `json:"docker_version"`
    MemoryTotal   int64 `json:"memory_total"`
    CPUCount      int `json:"cpu_count"`
}

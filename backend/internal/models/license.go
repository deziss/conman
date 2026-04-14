package models

import (
	"time"

	"gorm.io/gorm"
)

type LicenseTier string

const (
	TierCommunity  LicenseTier = "community"
	TierPro        LicenseTier = "pro"
	TierEnterprise LicenseTier = "enterprise"
)

// LicenseCache stores the last known license state in the database.
// Uses a singleton pattern (single row, ID=1) via FirstOrCreate.
type LicenseCache struct {
	gorm.Model
	LicenseKey     string      `gorm:"size:512"`
	Tier           LicenseTier `gorm:"size:32;default:community"`
	Valid          bool        `gorm:"default:false"`
	Expiry         *time.Time
	MaxHosts       int    `gorm:"default:1"`
	Features       string `gorm:"type:text"` // JSON array of feature codes
	MachineID            string `gorm:"size:256"` // Server fingerprint (hostname + MAC)
	LicenciaActivationID string `gorm:"size:256"` // Reserved for future Licencia activation tracking
	LastValidated  time.Time
	LastError      string `gorm:"type:text"`
	GracePeriodEnd *time.Time
}

// DefaultFeatures returns the hardcoded feature set for a given tier.
func DefaultFeatures(tier LicenseTier) []string {
	switch tier {
	case TierEnterprise:
		return []string{"stacks", "alerts", "multi_host", "update_check", "rbac", "sso", "audit_logs"}
	case TierPro:
		return []string{"stacks", "alerts", "multi_host", "update_check"}
	default:
		return []string{}
	}
}

// DefaultMaxHosts returns the default host limit for a given tier.
func DefaultMaxHosts(tier LicenseTier) int {
	switch tier {
	case TierEnterprise:
		return -1 // unlimited
	case TierPro:
		return 10
	default:
		return 1
	}
}

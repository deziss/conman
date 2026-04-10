package metrics

import (
	"fmt"
	"log"
	"time"

	"conman-backend/pkg/protocol"

	"gorm.io/gorm"
)

// MetricPoint represents a single time-series metric row stored in the database.
type MetricPoint struct {
	Time          time.Time `gorm:"index:idx_metrics_time;index:idx_metrics_lookup,priority:3;not null"`
	AgentID       string    `gorm:"index:idx_metrics_lookup,priority:1;not null"`
	ContainerID   string    `gorm:"index:idx_metrics_lookup,priority:2;not null"`
	ContainerName string
	CPUPercent    float64
	MemoryUsage   uint64
	MemoryLimit   uint64
	MemoryPercent float64
	NetworkRx     uint64
	NetworkTx     uint64
	BlockRead     uint64
	BlockWrite    uint64
	PIDs          uint64
}

func (MetricPoint) TableName() string {
	return "container_metrics"
}

// MetricsStore handles writing and querying time-series container metrics.
type MetricsStore struct {
	db         *gorm.DB
	isPostgres bool
}

// NewMetricsStore creates a new metrics store. Call InitSchema() after creation.
func NewMetricsStore(db *gorm.DB, driver string) *MetricsStore {
	return &MetricsStore{
		db:         db,
		isPostgres: driver == "postgres",
	}
}

// InitSchema creates the metrics table. If TimescaleDB is available, converts to hypertable.
func (s *MetricsStore) InitSchema() error {
	if err := s.db.AutoMigrate(&MetricPoint{}); err != nil {
		return fmt.Errorf("failed to create container_metrics table: %w", err)
	}

	if s.isPostgres {
		// Attempt to enable TimescaleDB and create hypertable (best-effort)
		s.db.Exec("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
		result := s.db.Exec("SELECT create_hypertable('container_metrics', 'time', if_not_exists => TRUE)")
		if result.Error != nil {
			log.Printf("TimescaleDB hypertable creation skipped (extension may not be installed): %v", result.Error)
		} else {
			log.Println("TimescaleDB hypertable enabled for container_metrics")
		}
	}

	return nil
}

// WriteMetrics persists a batch of container metrics from an agent report.
func (s *MetricsStore) WriteMetrics(agentID string, metrics []protocol.ContainerMetrics) error {
	if len(metrics) == 0 {
		return nil
	}

	now := time.Now()
	points := make([]MetricPoint, 0, len(metrics))
	for _, m := range metrics {
		ts := m.Timestamp
		if ts.IsZero() {
			ts = now
		}
		points = append(points, MetricPoint{
			Time:          ts,
			AgentID:       agentID,
			ContainerID:   m.ContainerID,
			ContainerName: m.ContainerName,
			CPUPercent:    m.CPUPercent,
			MemoryUsage:   m.MemoryUsage,
			MemoryLimit:   m.MemoryLimit,
			MemoryPercent: m.MemoryPercent,
			NetworkRx:     m.NetworkRx,
			NetworkTx:     m.NetworkTx,
			BlockRead:     m.BlockRead,
			BlockWrite:    m.BlockWrite,
			PIDs:          m.PIDs,
		})
	}

	return s.db.CreateInBatches(points, 100).Error
}

// QueryParams defines the parameters for querying historical metrics.
type QueryParams struct {
	AgentID     string
	ContainerID string
	From        time.Time
	To          time.Time
	Limit       int // Max rows to return (default 1000)
}

// QueryMetrics retrieves historical metrics for a container within a time range.
func (s *MetricsStore) QueryMetrics(params QueryParams) ([]MetricPoint, error) {
	if params.Limit <= 0 {
		params.Limit = 1000
	}

	query := s.db.Model(&MetricPoint{}).Order("time DESC").Limit(params.Limit)

	if params.AgentID != "" {
		query = query.Where("agent_id = ?", params.AgentID)
	}
	if params.ContainerID != "" {
		query = query.Where("container_id = ?", params.ContainerID)
	}
	if !params.From.IsZero() {
		query = query.Where("time >= ?", params.From)
	}
	if !params.To.IsZero() {
		query = query.Where("time <= ?", params.To)
	}

	var results []MetricPoint
	if err := query.Find(&results).Error; err != nil {
		return nil, err
	}

	return results, nil
}

// DeleteByAgent removes all metrics for a specific agent.
func (s *MetricsStore) DeleteByAgent(agentID string) error {
	return s.db.Where("agent_id = ?", agentID).Delete(&MetricPoint{}).Error
}

// Cleanup removes metrics older than the given retention period.
func (s *MetricsStore) Cleanup(retention time.Duration) (int64, error) {
	cutoff := time.Now().Add(-retention)
	result := s.db.Where("time < ?", cutoff).Delete(&MetricPoint{})
	return result.RowsAffected, result.Error
}

package service

import (
		"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"conman-backend/internal/models"
	"conman-backend/pkg/protocol"
	"gorm.io/gorm"
)

type ActivityService struct {
	db          *gorm.DB
	recentUsers sync.Map // map[string]recentUserAction
}

type recentUserAction struct {
	User      string
	Action    string
	Timestamp time.Time
}

func NewActivityService(db *gorm.DB) *ActivityService {
	return &ActivityService{
		db: db,
	}
}

// RecordUserAction caches a user-initiated action so incoming Docker events can be correlated with the user
func (s *ActivityService) RecordUserAction(user, agentID, targetID, targetName, action string) {
	if user == "" {
		user = "admin"
	}
	key := fmt.Sprintf("%s:%s", agentID, targetID)
	s.recentUsers.Store(key, recentUserAction{
		User:      user,
		Action:    action,
		Timestamp: time.Now(),
	})
	if targetName != "" && targetName != targetID {
		keyName := fmt.Sprintf("%s:%s", agentID, strings.TrimPrefix(targetName, "/"))
		s.recentUsers.Store(keyName, recentUserAction{
			User:      user,
			Action:    action,
			Timestamp: time.Now(),
		})
	}
}

// RecordActivity inserts an activity record directly into the database
func (s *ActivityService) RecordActivity(
	agentID, agentName, entityType, action, severity, targetID, targetName, actor, actorType, details, exitCode, reason string,
	meta map[string]interface{},
	ts time.Time,
) (*models.Activity, error) {
	if s.db == nil {
		return nil, nil
	}

	if ts.IsZero() {
		ts = time.Now()
	}
	if severity == "" {
		severity = "info"
	}
	if actorType == "" {
		if strings.HasPrefix(actor, "user:") {
			actorType = "user"
		} else if strings.HasPrefix(actor, "system:") {
			actorType = "system"
		} else {
			actorType = "engine"
		}
	}

	var metaBytes []byte
	if meta != nil {
		metaBytes, _ = json.Marshal(meta)
	}

	act := &models.Activity{
		AgentID:      agentID,
		AgentName:    agentName,
		Type:         entityType,
		Action:       action,
		Severity:     severity,
		TargetID:     targetID,
		TargetName:   strings.TrimPrefix(targetName, "/"),
		Actor:        actor,
		ActorType:    actorType,
		Details:      details,
		ExitCode:     exitCode,
		Reason:       reason,
		MetadataJSON: metaBytes,
		Timestamp:    ts,
	}

	if err := s.db.Create(act).Error; err != nil {
		return nil, err
	}
	return act, nil
}

// IngestSystemEvent parses and classifies incoming Docker / container events from agents
func (s *ActivityService) IngestSystemEvent(agentID, agentName string, event protocol.ContainerEvent) (*models.Activity, error) {
	rawAction := strings.ToLower(event.Action)
	attrs := event.Attributes
	if attrs == nil {
		attrs = make(map[string]string)
	}

	// Filter noisy internal health check execution sub-events
	if strings.HasPrefix(rawAction, "exec_") {
		return nil, nil
	}

	targetName := event.ContainerName
	if targetName == "" {
		targetName = attrs["name"]
	}
	targetName = strings.TrimPrefix(targetName, "/")

	targetID := event.ContainerID
	if len(targetID) > 12 {
		targetID = targetID[:12]
	}

	entityType := "container"
	if event.Type != "" {
		entityType = event.Type
	}

	action := rawAction
	severity := "info"
	actor := "docker-engine"
	actorType := "engine"
	details := fmt.Sprintf("Container event: %s", rawAction)
	exitCode := attrs["exitCode"]
	reason := ""

	// Check if this action matches a recent user action in Conman UI within last 20 seconds
	key := fmt.Sprintf("%s:%s", agentID, event.ContainerID)
	if val, ok := s.recentUsers.Load(key); ok {
		recent := val.(recentUserAction)
		if time.Since(recent.Timestamp) < 20*time.Second {
			actor = fmt.Sprintf("user:%s", recent.User)
			actorType = "user"
		}
	} else if targetName != "" {
		keyName := fmt.Sprintf("%s:%s", agentID, targetName)
		if val, ok := s.recentUsers.Load(keyName); ok {
			recent := val.(recentUserAction)
			if time.Since(recent.Timestamp) < 20*time.Second {
				actor = fmt.Sprintf("user:%s", recent.User)
				actorType = "user"
			}
		}
	}

	// Classify container lifecycle and crash/OOM conditions
	switch {
	case rawAction == "oom":
		action = "oom_killed"
		severity = "critical"
		actor = "system:oom-killer"
		actorType = "system"
		details = "Container exceeded memory limit and was killed by Linux Kernel OOM killer"
		reason = "Out of Memory (OOM)"

	case rawAction == "die":
		if exitCode == "137" {
			// Exit code 137 = 128 + 9 (SIGKILL / OOM)
			action = "oom_killed"
			severity = "critical"
			if actorType != "user" {
				actor = "system:oom-killer"
				actorType = "system"
			}
			details = "Container terminated with SIGKILL (Exit Code 137, likely Out of Memory or forced kill)"
			reason = "SIGKILL / OOM (Exit 137)"
		} else if exitCode == "0" {
			action = "stopped"
			severity = "info"
			details = "Container stopped cleanly (Exit Code 0)"
			if actorType != "user" {
				actor = "external-cli / host-system"
				actorType = "external"
			}
		} else if exitCode == "143" {
			// Exit code 143 = 128 + 15 (SIGTERM)
			action = "stopped"
			severity = "info"
			details = "Container stopped via SIGTERM (Exit Code 143)"
			if actorType != "user" {
				actor = "external-cli / host-system"
				actorType = "external"
			}
		} else {
			action = "crashed"
			severity = "error"
			details = fmt.Sprintf("Container process exited abnormally with code %s", exitCode)
			reason = fmt.Sprintf("Crash (Exit Code %s)", exitCode)
			if actorType != "user" {
				actor = "container-process"
				actorType = "system"
			}
		}

	case rawAction == "kill":
		action = "killed"
		severity = "warning"
		sig := attrs["signal"]
		if sig == "" {
			sig = "SIGKILL"
		}
		details = fmt.Sprintf("Container received kill signal (%s)", sig)
		if actorType != "user" {
			actor = "host-system / external-cli"
			actorType = "external"
		}

	case strings.HasPrefix(rawAction, "health_status"):
		healthStatus := strings.TrimPrefix(rawAction, "health_status: ")
		if healthStatus == "unhealthy" {
			action = "unhealthy"
			severity = "error"
			details = "Container health check failed: marked unhealthy"
			reason = "Healthcheck Failed"
		} else {
			action = "healthy"
			severity = "info"
			details = "Container health check passed"
		}

	case rawAction == "start":
		action = "started"
		severity = "info"
		details = fmt.Sprintf("Container %s started", targetName)
		if actorType != "user" {
			actor = "host-system / external-cli"
			actorType = "external"
		}

	case rawAction == "stop":
		action = "stopped"
		severity = "info"
		details = fmt.Sprintf("Container %s stopped", targetName)
		if actorType != "user" {
			actor = "host-system / external-cli"
			actorType = "external"
		}

	case rawAction == "restart":
		action = "restarted"
		severity = "info"
		details = fmt.Sprintf("Container %s restarted", targetName)

	case rawAction == "create":
		action = "created"
		severity = "info"
		details = fmt.Sprintf("Container %s created", targetName)

	case rawAction == "destroy":
		action = "deleted"
		severity = "warning"
		details = fmt.Sprintf("Container %s removed", targetName)

	case rawAction == "pause":
		action = "paused"
		severity = "warning"
		details = fmt.Sprintf("Container %s paused", targetName)

	case rawAction == "unpause":
		action = "unpaused"
		severity = "info"
		details = fmt.Sprintf("Container %s unpaused", targetName)
	}

	meta := map[string]interface{}{
		"raw_action": rawAction,
		"image":      attrs["image"],
		"attributes": attrs,
	}

	ts := event.Timestamp
	if ts.IsZero() {
		ts = time.Now()
	}

	return s.RecordActivity(
		agentID,
		agentName,
		entityType,
		action,
		severity,
		targetID,
		targetName,
		actor,
		actorType,
		details,
		exitCode,
		reason,
		meta,
		ts,
	)
}

// ListActivities queries activities with filtering and pagination
func (s *ActivityService) ListActivities(
	agentID, entityType, action, severity, search, targetName string,
	page, limit int,
	since time.Duration,
) ([]models.Activity, int64, error) {
	if s.db == nil {
		return []models.Activity{}, 0, nil
	}

	query := s.db.Model(&models.Activity{})

	if agentID != "" && agentID != "all" {
		query = query.Where("agent_id = ?", agentID)
	}
	if entityType != "" && entityType != "all" {
		query = query.Where("type = ?", entityType)
	}
	if action != "" && action != "all" {
		query = query.Where("action = ?", action)
	}
	if severity != "" && severity != "all" {
		query = query.Where("severity = ?", severity)
	}
	if targetName != "" {
		clean := strings.TrimPrefix(targetName, "/")
		query = query.Where("target_name = ? OR target_id = ? OR target_name LIKE ?", clean, clean, "%"+clean+"%")
	}
	if search != "" {
		like := "%" + search + "%"
		query = query.Where("target_name LIKE ? OR actor LIKE ? OR details LIKE ? OR action LIKE ?", like, like, like, like)
	}
	if since > 0 {
		query = query.Where("timestamp >= ?", time.Now().Add(-since))
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit

	var activities []models.Activity
	err := query.Order("timestamp DESC").Offset(offset).Limit(limit).Find(&activities).Error
	return activities, total, err
}

// GetActivityStats returns aggregated counts of critical events
func (s *ActivityService) GetActivityStats(agentID string) (map[string]interface{}, error) {
	if s.db == nil {
		return map[string]interface{}{}, nil
	}

	query := s.db.Model(&models.Activity{})
	if agentID != "" && agentID != "all" {
		query = query.Where("agent_id = ?", agentID)
	}

	since24h := time.Now().Add(-24 * time.Hour)

	var totalLast24h int64
	query.Where("timestamp >= ?", since24h).Count(&totalLast24h)

	var oomKills int64
	s.db.Model(&models.Activity{}).
		Where("action = 'oom_killed' AND timestamp >= ?", since24h).
		Count(&oomKills)

	var crashes int64
	s.db.Model(&models.Activity{}).
		Where("action = 'crashed' AND timestamp >= ?", since24h).
		Count(&crashes)

	var userActions int64
	s.db.Model(&models.Activity{}).
		Where("actor_type = 'user' AND timestamp >= ?", since24h).
		Count(&userActions)

	return map[string]interface{}{
		"total_24h":    totalLast24h,
		"oom_kills":    oomKills,
		"crashes":      crashes,
		"user_actions": userActions,
	}, nil
}

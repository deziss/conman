package license

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"conman-backend/internal/config"
	"conman-backend/internal/models"

	"gorm.io/gorm"
)

const (
	revalidateInterval  = 6 * time.Hour
	gracePeriodDuration = 72 * time.Hour
	httpTimeout         = 10 * time.Second
)

// LicenseState is the in-memory license state read by middleware on every request.
type LicenseState struct {
	Tier           models.LicenseTier `json:"tier"`
	Valid          bool               `json:"valid"`
	MaxHosts       int                `json:"max_hosts"`
	Features       []string           `json:"features"`
	Expiry         *time.Time         `json:"expiry"`
	LastValidated  time.Time          `json:"last_validated"`
	GracePeriod    bool               `json:"grace_period"`
	GracePeriodEnd *time.Time         `json:"grace_period_end"`
	Error          string             `json:"error"`
	LicenseKeyMask string             `json:"license_key_masked"`
}

// HasFeature checks if a feature code is available in the current tier.
func (s *LicenseState) HasFeature(feature string) bool {
	for _, f := range s.Features {
		if f == feature {
			return true
		}
	}
	return false
}

// LicenseService manages license validation, caching, and enforcement.
type LicenseService struct {
	db     *gorm.DB
	mu     sync.RWMutex
	state  *LicenseState
	hwID   string // hardware fingerprint sent to Licencia
	cancel context.CancelFunc
}

// NewLicenseService creates a new license service and loads cached state from DB.
func NewLicenseService(db *gorm.DB) *LicenseService {
	svc := &LicenseService{
		db:    db,
		hwID:  GenerateFingerprint(),
		state: communityState(),
	}

	// Load cached state from DB
	var cache models.LicenseCache
	if err := db.First(&cache).Error; err == nil && cache.Valid {
		features := parseFeatures(cache.Features)
		svc.state = &LicenseState{
			Tier:           cache.Tier,
			Valid:          cache.Valid,
			MaxHosts:       cache.MaxHosts,
			Features:       features,
			Expiry:         cache.Expiry,
			LastValidated:  cache.LastValidated,
			GracePeriod:    cache.GracePeriodEnd != nil && time.Now().Before(*cache.GracePeriodEnd),
			GracePeriodEnd: cache.GracePeriodEnd,
			LicenseKeyMask: maskKey(cache.LicenseKey),
		}
		log.Printf("License: loaded cached state (tier=%s, valid=%v)", cache.Tier, cache.Valid)
	} else {
		log.Println("License: no cached license found, starting in Community mode")
	}

	return svc
}

// Start performs initial validation and starts the background re-validation loop.
func (svc *LicenseService) Start(ctx context.Context) {
	ctx, svc.cancel = context.WithCancel(ctx)

	// Initial validation if a key is configured
	key := svc.getActiveKey()
	if key != "" {
		if err := svc.validate(key); err != nil {
			log.Printf("License: initial validation failed: %v", err)
		}
	}

	// Background re-validation
	ticker := time.NewTicker(revalidateInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			key := svc.getActiveKey()
			if key == "" {
				continue
			}
			if err := svc.validate(key); err != nil {
				log.Printf("License: periodic validation failed: %v", err)
			}
		}
	}
}

// Stop cancels the background goroutine.
func (svc *LicenseService) Stop() {
	if svc.cancel != nil {
		svc.cancel()
	}
}

// GetState returns a thread-safe snapshot of the current license state.
func (svc *LicenseService) GetState() *LicenseState {
	svc.mu.RLock()
	defer svc.mu.RUnlock()

	// Check if grace period has expired
	if svc.state.GracePeriod && svc.state.GracePeriodEnd != nil && time.Now().After(*svc.state.GracePeriodEnd) {
		cs := communityState()
		cs.Error = "Grace period expired. License reverted to Community."
		return cs
	}

	return svc.state
}

// Activate validates a new license key and updates the state.
func (svc *LicenseService) Activate(key string) (*LicenseState, error) {
	if key == "" {
		return nil, fmt.Errorf("license key cannot be empty")
	}

	if err := svc.validate(key); err != nil {
		return nil, err
	}

	return svc.GetState(), nil
}

// Deactivate clears the license and falls back to Community tier.
func (svc *LicenseService) Deactivate() error {
	svc.deactivateFromLicencia()

	svc.mu.Lock()
	svc.state = communityState()
	svc.mu.Unlock()

	// Clear DB cache
	svc.db.Where("1 = 1").Delete(&models.LicenseCache{})

	log.Println("License: deactivated, reverted to Community")
	return nil
}

// ForceValidate triggers an immediate re-validation.
func (svc *LicenseService) ForceValidate() error {
	key := svc.getActiveKey()
	if key == "" {
		return fmt.Errorf("no license key configured")
	}
	return svc.validate(key)
}

// CanAddHost checks if the current license allows adding another host.
func (svc *LicenseService) CanAddHost() bool {
	state := svc.GetState()
	if state.MaxHosts < 0 {
		return true // unlimited
	}
	count := svc.GetHostCount()
	return count < state.MaxHosts
}

// GetHostCount returns the number of registered agents.
func (svc *LicenseService) GetHostCount() int {
	var count int64
	svc.db.Model(&models.Agent{}).Count(&count)
	return int(count)
}

// --- Internal ---

func (svc *LicenseService) getActiveKey() string {
	if config.AppConfig.LicenseKey != "" {
		return config.AppConfig.LicenseKey
	}
	var cache models.LicenseCache
	if err := svc.db.First(&cache).Error; err == nil {
		return cache.LicenseKey
	}
	return ""
}

func (svc *LicenseService) validate(key string) error {
	licenciaURL := config.AppConfig.LicenciaURL
	if licenciaURL == "" {
		return svc.applyOfflineFallback(key, "LICENCIA_URL not configured")
	}

	url := licenciaURL + "/api/v1/licenses/validate"

	body := map[string]interface{}{
		"key":        key,
		"hardwareId": svc.hwID,
		"deviceName": "conman-server",
		"os":         "linux",
		"appVersion": "conman",
	}

	jsonBody, _ := json.Marshal(body)

	client := &http.Client{Timeout: httpTimeout}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return svc.enterGracePeriod(fmt.Sprintf("request creation failed: %v", err))
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", config.AppConfig.LicenciaAPIKey)

	resp, err := client.Do(req)
	if err != nil {
		return svc.enterGracePeriod(fmt.Sprintf("network error: %v", err))
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	// Non-2xx with no parseable body → network/server issue, enter grace period
	if resp.StatusCode >= 500 {
		return svc.enterGracePeriod(fmt.Sprintf("Licencia server error: HTTP %d", resp.StatusCode))
	}

	var result licenciaValidationResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return svc.enterGracePeriod(fmt.Sprintf("invalid response: %v", err))
	}

	if !result.Valid {
		svc.mu.Lock()
		cs := communityState()
		cs.Error = "License invalid or expired"
		cs.LicenseKeyMask = maskKey(key)
		svc.state = cs
		svc.mu.Unlock()
		svc.persistCache(key, cs)
		return fmt.Errorf("license invalid: key=%s", maskKey(key))
	}

	// Valid license — extract tier from entitlements
	tier, maxHosts, features := svc.extractLicenseDetails(result)

	now := time.Now()
	var expiry *time.Time
	if result.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, result.ExpiresAt); err == nil {
			expiry = &t
		}
	}

	state := &LicenseState{
		Tier:           tier,
		Valid:          true,
		MaxHosts:       maxHosts,
		Features:       features,
		Expiry:         expiry,
		LastValidated:  now,
		GracePeriod:    false,
		GracePeriodEnd: nil,
		LicenseKeyMask: maskKey(key),
	}

	svc.mu.Lock()
	svc.state = state
	svc.mu.Unlock()

	svc.persistCache(key, state)
	log.Printf("License: validated successfully (tier=%s, max_hosts=%d)", tier, maxHosts)
	return nil
}

func (svc *LicenseService) extractLicenseDetails(result licenciaValidationResponse) (models.LicenseTier, int, []string) {
	tier := models.TierCommunity
	if t, ok := result.Entitlements["tier"]; ok {
		switch t {
		case "pro":
			tier = models.TierPro
		case "enterprise":
			tier = models.TierEnterprise
		}
	}

	maxHosts := models.DefaultMaxHosts(tier)
	if mh, ok := result.Entitlements["max_hosts"]; ok {
		if v, ok := mh.(float64); ok {
			maxHosts = int(v)
		}
	}

	features := models.DefaultFeatures(tier)
	return tier, maxHosts, features
}

func (svc *LicenseService) enterGracePeriod(reason string) error {
	svc.mu.Lock()
	defer svc.mu.Unlock()

	if svc.state.Valid && !svc.state.GracePeriod {
		end := time.Now().Add(gracePeriodDuration)
		svc.state.GracePeriod = true
		svc.state.GracePeriodEnd = &end
		svc.state.Error = reason
		log.Printf("License: entering grace period until %s (reason: %s)", end.Format(time.RFC3339), reason)
	} else if svc.state.GracePeriod && svc.state.GracePeriodEnd != nil && time.Now().After(*svc.state.GracePeriodEnd) {
		cs := communityState()
		cs.Error = "Grace period expired: " + reason
		svc.state = cs
		log.Println("License: grace period expired, reverted to Community")
	}
	svc.state.Error = reason

	return fmt.Errorf("license validation failed: %s", reason)
}

func (svc *LicenseService) applyOfflineFallback(key, reason string) error {
	svc.mu.Lock()
	defer svc.mu.Unlock()

	if key != "" {
		tier := models.TierPro
		svc.state = &LicenseState{
			Tier:           tier,
			Valid:          true,
			MaxHosts:       models.DefaultMaxHosts(tier),
			Features:       models.DefaultFeatures(tier),
			LastValidated:  time.Now(),
			LicenseKeyMask: maskKey(key),
			Error:          reason + " (offline mode: treating as Pro)",
		}
		svc.persistCache(key, svc.state)
		log.Printf("License: offline mode — %s, treating key as Pro tier", reason)
	}
	return nil
}

func (svc *LicenseService) deactivateFromLicencia() {
	licenciaURL := config.AppConfig.LicenciaURL
	if licenciaURL == "" {
		return
	}

	var cache models.LicenseCache
	if err := svc.db.First(&cache).Error; err != nil || cache.LicenseKey == "" {
		return
	}

	url := licenciaURL + "/api/v1/licenses/deactivate"

	body := map[string]interface{}{
		"key":        cache.LicenseKey,
		"hardwareId": svc.hwID,
	}

	jsonBody, _ := json.Marshal(body)

	client := &http.Client{Timeout: httpTimeout}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		log.Printf("License: deactivation request failed: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", config.AppConfig.LicenciaAPIKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("License: deactivation network error: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Println("License: deactivated from Licencia")
}

func (svc *LicenseService) persistCache(key string, state *LicenseState) {
	featuresJSON, _ := json.Marshal(state.Features)

	cache := models.LicenseCache{
		LicenseKey:    key,
		Tier:          state.Tier,
		Valid:         state.Valid,
		Expiry:        state.Expiry,
		MaxHosts:      state.MaxHosts,
		Features:      string(featuresJSON),
		MachineID:     svc.hwID,
		LastValidated: state.LastValidated,
		LastError:     state.Error,
		GracePeriodEnd: state.GracePeriodEnd,
	}

	var existing models.LicenseCache
	if err := svc.db.First(&existing).Error; err == nil {
		cache.Model = existing.Model
		svc.db.Save(&cache)
	} else {
		svc.db.Create(&cache)
	}
}

func communityState() *LicenseState {
	return &LicenseState{
		Tier:          models.TierCommunity,
		Valid:         true,
		MaxHosts:      models.DefaultMaxHosts(models.TierCommunity),
		Features:      models.DefaultFeatures(models.TierCommunity),
		LastValidated: time.Now(),
	}
}

func maskKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return "****-****-" + key[len(key)-4:]
}

func parseFeatures(s string) []string {
	if s == "" {
		return []string{}
	}
	var features []string
	if err := json.Unmarshal([]byte(s), &features); err != nil {
		return []string{}
	}
	return features
}

// --- Licencia API response types ---

type licenciaValidationResponse struct {
	Valid        bool                   `json:"valid"`
	LicenseID    string                 `json:"licenseId"`
	Type         string                 `json:"type"`
	ExpiresAt    string                 `json:"expiresAt"`
	Entitlements map[string]interface{} `json:"entitlements"`
	NextCheckIn  int                    `json:"nextCheckIn"`
}

package api

import (
	"conman-backend/internal/license"
	"net/http"
)

type LicenseHandler struct {
	Service *license.LicenseService
}

func NewLicenseHandler(svc *license.LicenseService) *LicenseHandler {
	return &LicenseHandler{Service: svc}
}

// GetLicenseInfo returns the current license state.
// GET /api/v1/license
func (h *LicenseHandler) GetLicenseInfo(w http.ResponseWriter, r *http.Request) {
	state := h.Service.GetState()

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"tier":               state.Tier,
		"valid":              state.Valid,
		"max_hosts":          state.MaxHosts,
		"current_hosts":      h.Service.GetHostCount(),
		"features":           state.Features,
		"expiry":             state.Expiry,
		"grace_period":       state.GracePeriod,
		"grace_period_end":   state.GracePeriodEnd,
		"last_validated":     state.LastValidated,
		"error":              state.Error,
		"license_key_masked": state.LicenseKeyMask,
	})
}

// ActivateLicense validates and activates a new license key.
// POST /api/v1/license/activate
func (h *LicenseHandler) ActivateLicense(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LicenseKey string `json:"license_key"`
	}
	if err := ReadJSON(w, r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	state, err := h.Service.Activate(req.LicenseKey)
	if err != nil {
		ErrorJSON(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"tier":               state.Tier,
		"valid":              state.Valid,
		"max_hosts":          state.MaxHosts,
		"current_hosts":      h.Service.GetHostCount(),
		"features":           state.Features,
		"expiry":             state.Expiry,
		"grace_period":       state.GracePeriod,
		"grace_period_end":   state.GracePeriodEnd,
		"last_validated":     state.LastValidated,
		"error":              state.Error,
		"license_key_masked": state.LicenseKeyMask,
	})
}

// DeactivateLicense removes the license and reverts to Community tier.
// POST /api/v1/license/deactivate
func (h *LicenseHandler) DeactivateLicense(w http.ResponseWriter, r *http.Request) {
	if err := h.Service.Deactivate(); err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	state := h.Service.GetState()
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"tier":               state.Tier,
		"valid":              state.Valid,
		"max_hosts":          state.MaxHosts,
		"current_hosts":      h.Service.GetHostCount(),
		"features":           state.Features,
		"license_key_masked": "",
	})
}

// ValidateLicense forces an immediate re-validation against Licencia.
// POST /api/v1/license/validate
func (h *LicenseHandler) ValidateLicense(w http.ResponseWriter, r *http.Request) {
	if err := h.Service.ForceValidate(); err != nil {
		// Return the error but also the current state
		state := h.Service.GetState()
		WriteJSON(w, http.StatusOK, map[string]interface{}{
			"tier":               state.Tier,
			"valid":              state.Valid,
			"max_hosts":          state.MaxHosts,
			"current_hosts":      h.Service.GetHostCount(),
			"features":           state.Features,
			"error":              err.Error(),
			"license_key_masked": state.LicenseKeyMask,
		})
		return
	}

	state := h.Service.GetState()
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"tier":               state.Tier,
		"valid":              state.Valid,
		"max_hosts":          state.MaxHosts,
		"current_hosts":      h.Service.GetHostCount(),
		"features":           state.Features,
		"expiry":             state.Expiry,
		"last_validated":     state.LastValidated,
		"error":              state.Error,
		"license_key_masked": state.LicenseKeyMask,
	})
}

type PlanInfo struct {
	ID              string   `json:"id"`
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	Tier            string   `json:"tier"`
	Badge           string   `json:"badge,omitempty"`
	Description     string   `json:"description"`
	MonthlyPriceUSD int      `json:"monthly_price_usd"`
	YearlyPriceUSD  int      `json:"yearly_price_usd"`
	MaxHosts        int      `json:"max_hosts"` // -1 for unlimited
	Popular         bool     `json:"popular"`
	Features        []string `json:"features"`
	Benefits        []string `json:"benefits"`
	CheckoutURL     string   `json:"checkout_url"`
}

// GetPlans returns the list of available subscription tiers, pricing, and benefits.
// GET /api/v1/license/plans
func (h *LicenseHandler) GetPlans(w http.ResponseWriter, r *http.Request) {
	licenciaURL := "https://licencia.deziss.com"
	// AppConfig check if available
	// If custom Licencia URL is configured, use that
	// e.g. from config.AppConfig.LicenciaURL

	plans := []PlanInfo{
		{
			ID:              "plan_community",
			Slug:            "community",
			Name:            "Community Edition",
			Tier:            "community",
			Badge:           "Open Source",
			Description:     "Ideal for single-host homelabs and individual developer workstations.",
			MonthlyPriceUSD: 0,
			YearlyPriceUSD:  0,
			MaxHosts:        1,
			Popular:         false,
			Features:        []string{"alerts"},
			Benefits: []string{
				"Single Host Node (Local Docker Daemon)",
				"Real-time Container & Spec Monitoring",
				"Interactive Web Terminal & Live Log Streaming",
				"Aqua Security Trivy Vulnerability Scanner",
				"Standard Webhook & Com0 Notifications",
				"Community Forum Support",
			},
			CheckoutURL: "",
		},
		{
			ID:              "plan_pro",
			Slug:            "pro",
			Name:            "Pro Edition",
			Tier:            "pro",
			Badge:           "Most Popular",
			Description:     "Engineered for DevOps teams, agile engineering squads, and multi-server clusters.",
			MonthlyPriceUSD: 19,
			YearlyPriceUSD:  190, // Save 20%
			MaxHosts:        10,
			Popular:         true,
			Features:        []string{"stacks", "alerts", "multi_host", "update_check"},
			Benefits: []string{
				"Up to 10 Remote Host Nodes & Fleet Agents (mTLS)",
				"Docker Compose Stack Orchestration & In-Browser Editor",
				"Automatic Image Vulnerability & Update Checking",
				"Multi-channel Com0 Alerts (WhatsApp, SMS, Email, Push)",
				"Container Health Auto-recovery Policies",
				"Priority Email & Discord Support",
			},
			CheckoutURL: licenciaURL + "/checkout/conman?plan=pro",
		},
		{
			ID:              "plan_enterprise",
			Slug:            "enterprise",
			Name:            "Enterprise Edition",
			Tier:            "enterprise",
			Badge:           "Full Fleet Control",
			Description:     "Mission-critical infrastructure with strict governance, compliance, and custom deployments.",
			MonthlyPriceUSD: 79,
			YearlyPriceUSD:  790, // Save 20%
			MaxHosts:        -1, // Unlimited
			Popular:         false,
			Features:        []string{"stacks", "alerts", "multi_host", "update_check", "rbac", "sso", "audit_logs"},
			Benefits: []string{
				"Unlimited Host Nodes & Distributed Fleets",
				"Granular Role-Based Access Control (RBAC)",
				"Enterprise SSO (Keycloak, OIDC, SAML, Google)",
				"Tamper-Evident Security Audit Logs & Compliance Export",
				"Air-gapped & Offline Licencia Key Provisioning",
				"Dedicated 24/7 SLA Guarantee & Technical Account Lead",
			},
			CheckoutURL: licenciaURL + "/checkout/conman?plan=enterprise",
		},
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"provider":     "Licencia by Deziss",
		"licencia_url": licenciaURL,
		"plans":        plans,
	})
}

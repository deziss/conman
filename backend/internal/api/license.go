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
	if err := ReadJSON(r, &req); err != nil {
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

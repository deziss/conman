package middleware

import (
	"context"
	"fmt"
	"net/http"

	"conman-backend/internal/license"
	"conman-backend/internal/models"
)

// NewLicenseMiddleware injects the current LicenseState into the request context.
func NewLicenseMiddleware(svc *license.LicenseService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), models.LicenseContextKey, svc.GetState())
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireFeature returns middleware that blocks access if the license does not include a feature.
func RequireFeature(feature string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			state, ok := r.Context().Value(models.LicenseContextKey).(*license.LicenseState)
			if !ok || state == nil || !state.HasFeature(feature) {
				tier := "community"
				if state != nil {
					tier = string(state.Tier)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				fmt.Fprintf(w, `{"error":"Feature '%s' is not available on your %s plan","license_required":true,"feature":"%s"}`, feature, tier, feature)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

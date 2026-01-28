package middleware

import (
    "net/http"
    "conman-backend/internal/api"
    "github.com/casbin/casbin/v2"
)

// CasbinMiddleware enforces authorization policies
func CasbinMiddleware(enforcer *casbin.Enforcer) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Get user role from context (set by AuthMiddleware)
            // Default to "viewer" or "anonymous" if not found
            role, ok := r.Context().Value("role").(string)
            if !ok || role == "" {
                role = "anonymous"
            }

            // Get the object (path) and action (method)
            obj := r.URL.Path
            act := r.Method

            // Check permission
            // sub, obj, act
            allowed, err := enforcer.Enforce(role, obj, act)
            if err != nil {
                api.ErrorJSON(w, http.StatusInternalServerError, "Authorization error: " + err.Error())
                return
            }

            if !allowed {
                api.ErrorJSON(w, http.StatusForbidden, "Insufficient permissions")
                return
            }

            next.ServeHTTP(w, r)
        })
    }
}

// TokenAuthMiddleware is a placeholder/adapter for the existing logic
// We will update the actual AuthMiddleware in auth.go separately

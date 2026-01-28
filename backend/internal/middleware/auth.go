package middleware

import (
	"context"
	"conman-backend/internal/api"
	"conman-backend/internal/config"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// AuthMiddleware validates JWT tokens and sets context
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			api.ErrorJSON(w, http.StatusUnauthorized, "Authorization header required")
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			api.ErrorJSON(w, http.StatusUnauthorized, "Invalid authorization header format")
			return
		}

		tokenString := parts[1]
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.AppConfig.SecretKey), nil
		})

		if err != nil || !token.Valid {
			api.ErrorJSON(w, http.StatusUnauthorized, "Invalid token")
			return
		}

		// Set claims to context
		claims, ok := token.Claims.(jwt.MapClaims)
		if ok {
			ctx := context.WithValue(r.Context(), "user_id", claims["sub"])
			ctx = context.WithValue(ctx, "role", claims["role"])
			r = r.WithContext(ctx)
		}

		next.ServeHTTP(w, r)
	})
}

// RoleMiddleware checks if the user has the required role (Simple RBAC, superseded by Casbin generally but kept for reference)
func RoleMiddleware(requiredRole string) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            role, ok := r.Context().Value("role").(string)
            if !ok {
                 api.ErrorJSON(w, http.StatusForbidden, "Role not found in context")
                 return
            }
            
            if !checkRoleAccess(role, requiredRole) {
                 api.ErrorJSON(w, http.StatusForbidden, "Insufficient permissions")
                 return
            }
            next.ServeHTTP(w, r)
        })
    }
}

func checkRoleAccess(userRole, requiredRole string) bool {
    roles := map[string]int{"viewer": 1, "operator": 2, "admin": 3}
    return roles[userRole] >= roles[requiredRole]
}

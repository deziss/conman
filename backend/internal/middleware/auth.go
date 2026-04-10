package middleware

import (
	"conman-backend/internal/api"
	"conman-backend/internal/authz"
	"conman-backend/internal/config"
	"conman-backend/internal/models"
	"context"
	"crypto/subtle"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)



type Middleware struct {
	DB *gorm.DB
}

func NewMiddleware(db *gorm.DB) *Middleware {
	return &Middleware{DB: db}
}

// AuthMiddleware handles Master Key, API Key, and JWT authentication
func (m *Middleware) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Check Master API Key
		masterKey := r.Header.Get("X-Master-Key")
		if masterKey != "" && subtle.ConstantTimeCompare([]byte(masterKey), []byte(config.AppConfig.MasterAPIKey)) == 1 {
			ctx := context.WithValue(r.Context(), models.RoleContextKey, "admin")
			ctx = context.WithValue(ctx, models.UserContextKey, &models.User{Role: "admin", FullName: "System Admin"})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// 2. Check User API Key
		apiKey := r.Header.Get("X-API-Key")
		if apiKey != "" {
			var keyModel models.APIKey
			if err := m.DB.Preload("User").Where("key = ?", apiKey).First(&keyModel).Error; err == nil {
				// Access verified via API Key
				ctx := context.WithValue(r.Context(), models.UserContextKey, &keyModel.User)
				ctx = context.WithValue(ctx, models.RoleContextKey, keyModel.User.Role) // Inherit user role
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// 3. Fallback to JWT
		tokenString := ""
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}

		if tokenString == "" {
			api.ErrorJSON(w, http.StatusUnauthorized, "Authorization required")
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(config.AppConfig.SecretKey), nil
		})

		if err != nil || !token.Valid {
			api.ErrorJSON(w, http.StatusUnauthorized, "Invalid token")
			return
		}

		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			userIDFloat, ok := claims["sub"].(float64)
			if !ok {
				api.ErrorJSON(w, http.StatusUnauthorized, "Invalid token claims")
				return
			}
			
			var user models.User
			if err := m.DB.First(&user, uint(userIDFloat)).Error; err != nil {
				api.ErrorJSON(w, http.StatusUnauthorized, "User not found")
				return
			}

			ctx := context.WithValue(r.Context(), models.UserContextKey, &user)
			ctx = context.WithValue(ctx, models.RoleContextKey, user.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		} else {
			api.ErrorJSON(w, http.StatusUnauthorized, "Invalid token claims")
		}
	})
}

// AgentAuthMiddleware validates the agent pre-shared key on agent-facing endpoints.
// If AGENT_TOKEN is not configured, all agent requests are rejected (secure by default).
func AgentAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := config.AppConfig.AgentToken
		if token == "" {
			api.ErrorJSON(w, http.StatusForbidden, "Agent authentication not configured on server")
			return
		}

		// Check X-Agent-Token header first, then fall back to Authorization: Bearer
		agentToken := r.Header.Get("X-Agent-Token")
		if agentToken == "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				agentToken = authHeader[7:]
			}
		}

		if subtle.ConstantTimeCompare([]byte(agentToken), []byte(token)) != 1 {
			api.ErrorJSON(w, http.StatusUnauthorized, "Invalid agent token")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RequirePermission Middleware using Casbin
func (m *Middleware) RequirePermission(obj, act string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, ok := r.Context().Value(models.RoleContextKey).(string)
			if !ok {
                role = "anonymous"
			}

			allowed, err := authz.CheckPermission(role, obj, act)
			if err != nil {
				api.ErrorJSON(w, http.StatusInternalServerError, "Authorization error")
				return
			}

			if !allowed {
				api.ErrorJSON(w, http.StatusForbidden, "Forbidden")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

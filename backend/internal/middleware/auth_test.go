package middleware

import (
	"conman-backend/internal/authz"
	"conman-backend/internal/config"
	"conman-backend/internal/license"
	"conman-backend/internal/models"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

const testSecretKey = "test-only-secret-do-not-use-in-prod"

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	// AuthMiddleware's API-key path fires a background goroutine to bump
	// last_used_at. A plain ":memory:" DSN gives each pooled connection its
	// own separate, unmigrated database — "cache=shared" makes every
	// connection opened against this DSN see the one shared in-memory DB
	// this test just migrated, so that goroutine doesn't race a fresh,
	// empty database on a different connection.
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite memory db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.APIKey{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
	authz.InitCasbin(db)
	config.AppConfig = &config.Config{
		SecretKey:    testSecretKey,
		MasterAPIKey: "test-master-key",
		AgentToken:   "test-agent-token",
	}
	return db
}

func withLicenseState(r *http.Request, state *license.LicenseState) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), models.LicenseContextKey, state))
}

func roleFromContext(r *http.Request) string {
	role, _ := r.Context().Value(models.RoleContextKey).(string)
	return role
}

// ── RequirePermission: the Enterprise "rbac" license gate ──────────────────

func TestRequirePermission_NoRBACLicense_OnlyAdminPasses(t *testing.T) {
	db := setupTestDB(t)
	m := NewMiddleware(db)

	// Community/Pro tier — no "rbac" feature.
	state := &license.LicenseState{Tier: models.TierPro, Features: []string{"stacks"}}

	handlerCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { handlerCalled = true })
	wrapped := m.RequirePermission("containers", "write")(next)

	cases := []struct {
		role       string
		wantStatus int
		wantCalled bool
	}{
		{"admin", http.StatusOK, true},
		{"viewer", http.StatusForbidden, false},
		{"operator", http.StatusForbidden, false}, // even operator — RBAC itself is Enterprise-gated
		{"anonymous", http.StatusForbidden, false},
	}

	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			handlerCalled = false
			req := httptest.NewRequest(http.MethodPost, "/", nil)
			req = withLicenseState(req, state)
			ctx := context.WithValue(req.Context(), models.RoleContextKey, tc.role)
			req = req.WithContext(ctx)
			rec := httptest.NewRecorder()

			wrapped.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("role %q: status = %d, want %d (body=%s)", tc.role, rec.Code, tc.wantStatus, rec.Body.String())
			}
			if handlerCalled != tc.wantCalled {
				t.Errorf("role %q: handler called = %v, want %v", tc.role, handlerCalled, tc.wantCalled)
			}
		})
	}
}

func TestRequirePermission_WithRBACLicense_FallsThroughToCasbin(t *testing.T) {
	db := setupTestDB(t)
	m := NewMiddleware(db)

	// Enterprise tier — has "rbac".
	state := &license.LicenseState{Tier: models.TierEnterprise, Features: models.DefaultFeatures(models.TierEnterprise)}

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })

	cases := []struct {
		role       string
		obj        string
		act        string
		wantStatus int
	}{
		{"admin", "containers", "write", http.StatusOK},
		{"viewer", "containers", "read", http.StatusOK},
		{"viewer", "containers", "write", http.StatusForbidden}, // Casbin denies this, not the license gate
		{"operator", "images", "write", http.StatusForbidden},   // bootstrap policy never granted operator "images"
	}

	for _, tc := range cases {
		t.Run(tc.role+"/"+tc.obj+"/"+tc.act, func(t *testing.T) {
			wrapped := m.RequirePermission(tc.obj, tc.act)(next)
			req := httptest.NewRequest(http.MethodPost, "/", nil)
			req = withLicenseState(req, state)
			ctx := context.WithValue(req.Context(), models.RoleContextKey, tc.role)
			req = req.WithContext(ctx)
			rec := httptest.NewRecorder()

			wrapped.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d (body=%s)", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}

func TestRequirePermission_NoLicenseStateInContext_TreatedAsUnlicensed(t *testing.T) {
	db := setupTestDB(t)
	m := NewMiddleware(db)

	// No license middleware ran — models.LicenseContextKey is absent entirely.
	// This must fail closed (deny non-admin), not open.
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	wrapped := m.RequirePermission("containers", "write")(next)

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	ctx := context.WithValue(req.Context(), models.RoleContextKey, "viewer")
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("missing license context: status = %d, want %d (fail closed)", rec.Code, http.StatusForbidden)
	}
}

// ── AgentAuthMiddleware ──────────────────────────────────────────────────

func TestAgentAuthMiddleware(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	wrapped := AgentAuthMiddleware(next)

	t.Run("no token configured — reject everything", func(t *testing.T) {
		config.AppConfig = &config.Config{AgentToken: ""}
		req := httptest.NewRequest(http.MethodPost, "/agents/register", nil)
		req.Header.Set("X-Agent-Token", "anything")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusForbidden)
		}
	})

	t.Run("wrong token — 401", func(t *testing.T) {
		config.AppConfig = &config.Config{AgentToken: "correct-token"}
		req := httptest.NewRequest(http.MethodPost, "/agents/register", nil)
		req.Header.Set("X-Agent-Token", "wrong-token")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
	})

	t.Run("correct token — passes", func(t *testing.T) {
		config.AppConfig = &config.Config{AgentToken: "correct-token"}
		req := httptest.NewRequest(http.MethodPost, "/agents/register", nil)
		req.Header.Set("X-Agent-Token", "correct-token")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	})
}

// ── AuthMiddleware: master key, API key + expiry, JWT ───────────────────

func TestAuthMiddleware_MasterKey(t *testing.T) {
	db := setupTestDB(t)
	m := NewMiddleware(db)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(roleFromContext(r)))
	})
	wrapped := m.AuthMiddleware(next)

	t.Run("correct master key — admin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Master-Key", "test-master-key")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK || rec.Body.String() != "admin" {
			t.Errorf("status=%d body=%q, want 200/admin", rec.Code, rec.Body.String())
		}
	})

	t.Run("wrong master key — falls through, no auth — 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Master-Key", "wrong-key")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
	})
}

func TestAuthMiddleware_APIKey_ExpiryEnforced(t *testing.T) {
	db := setupTestDB(t)
	m := NewMiddleware(db)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	wrapped := m.AuthMiddleware(next)

	user := models.User{Email: "test@example.com", Role: "viewer"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	t.Run("no expiry — always valid", func(t *testing.T) {
		key := models.APIKey{Key: "cm_neverexpires", UserID: user.ID, Role: "viewer", ExpiresAt: 0}
		if err := db.Create(&key).Error; err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-API-Key", "cm_neverexpires")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	})

	t.Run("expired key — rejected", func(t *testing.T) {
		key := models.APIKey{Key: "cm_expired", UserID: user.ID, Role: "viewer", ExpiresAt: time.Now().Add(-1 * time.Hour).Unix()}
		if err := db.Create(&key).Error; err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-API-Key", "cm_expired")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d — expired key must be rejected", rec.Code, http.StatusUnauthorized)
		}
	})

	t.Run("not-yet-expired key — valid", func(t *testing.T) {
		key := models.APIKey{Key: "cm_stillvalid", UserID: user.ID, Role: "viewer", ExpiresAt: time.Now().Add(1 * time.Hour).Unix()}
		if err := db.Create(&key).Error; err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-API-Key", "cm_stillvalid")
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	})
}

func TestAuthMiddleware_JWT(t *testing.T) {
	db := setupTestDB(t)
	m := NewMiddleware(db)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	wrapped := m.AuthMiddleware(next)

	user := models.User{Email: "jwt-user@example.com", Role: "operator"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	signToken := func(userID uint, secret string) string {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": float64(userID),
			"exp": time.Now().Add(time.Hour).Unix(),
		})
		signed, err := token.SignedString([]byte(secret))
		if err != nil {
			t.Fatalf("failed to sign test token: %v", err)
		}
		return signed
	}

	t.Run("valid JWT — passes", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer "+signToken(user.ID, testSecretKey))
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
		}
	})

	t.Run("JWT signed with wrong secret — rejected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer "+signToken(user.ID, "not-the-real-secret"))
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
	})

	t.Run("no credentials at all — 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
		}
	})
}

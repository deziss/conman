package api

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"conman-backend/internal/models"

	"github.com/go-chi/chi/v5"
)

func TestAgentProxyStackConfig(t *testing.T) {
	// Mock agent server
	var receivedPath string
	var receivedMethod string
	var receivedBody string

	mockAgentServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		receivedPath = r.URL.RequestURI()
		bodyBytes, _ := io.ReadAll(r.Body)
		receivedBody = string(bodyBytes)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":true}`))
	}))
	defer mockAgentServer.Close()

	handler := &AgentHandler{
		agents: map[string]*AgentState{
			"agent-1": {
				ID:        "agent-1",
				Name:      "test-agent",
				ScrapeURL: mockAgentServer.URL,
			},
		},
	}

	r := chi.NewRouter()
	r.Get("/agents/{id}/stacks/{stackName}/config", handler.ProxyGetStackConfig)
	r.Post("/agents/{id}/stacks/{stackName}/config", handler.ProxyUpdateStackConfig)
	r.Post("/agents/{id}/containers/{containerId}/adopt-stack", handler.ProxyAdoptContainerToStack)

	// 1. Test ProxyGetStackConfig
	t.Run("ProxyGetStackConfig", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/agents/agent-1/stacks/my-web/config", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		if receivedMethod != "GET" {
			t.Errorf("expected GET, got %s", receivedMethod)
		}
		if receivedPath != "/api/stacks/config?name=my-web" {
			t.Errorf("expected /api/stacks/config?name=my-web, got %s", receivedPath)
		}
	})

	// 2. Test ProxyUpdateStackConfig
	t.Run("ProxyUpdateStackConfig", func(t *testing.T) {
		payload := `{"name":"my-web","compose_content":"services:\n  web:\n    image: nginx\n","env_content":"PORT=80\n"}`
		req := httptest.NewRequest("POST", "/agents/agent-1/stacks/my-web/config", strings.NewReader(payload))
		ctx := context.WithValue(req.Context(), models.UserContextKey, &models.User{Email: "admin@example.com"})
		req = req.WithContext(ctx)

		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		if receivedMethod != "POST" {
			t.Errorf("expected POST, got %s", receivedMethod)
		}
		if receivedPath != "/api/stacks/config" {
			t.Errorf("expected /api/stacks/config, got %s", receivedPath)
		}
		if !strings.Contains(receivedBody, "image: nginx") {
			t.Errorf("expected body to contain payload, got %s", receivedBody)
		}
	})

	// 3. Test ProxyAdoptContainerToStack
	t.Run("ProxyAdoptContainerToStack", func(t *testing.T) {
		payload := `{"container_id":"c123","stack_name":"c123-stack"}`
		req := httptest.NewRequest("POST", "/agents/agent-1/containers/c123/adopt-stack", strings.NewReader(payload))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		if receivedMethod != "POST" {
			t.Errorf("expected POST, got %s", receivedMethod)
		}
		if receivedPath != "/api/containers/adopt-stack" {
			t.Errorf("expected /api/containers/adopt-stack, got %s", receivedPath)
		}
	})
}

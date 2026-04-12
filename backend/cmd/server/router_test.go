package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// setupTestStaticDir creates a temporary directory with some test files
func setupTestStaticDir(t *testing.T) string {
	dir, err := os.MkdirTemp("", "conman-static-test")
	if err != nil {
		t.Fatal(err)
	}

	// Create index.html
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("index content"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create an asset
	assetDir := filepath.Join(dir, "assets")
	if err := os.Mkdir(assetDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(assetDir, "app.js"), []byte("js content"), 0644); err != nil {
		t.Fatal(err)
	}

	return dir
}

func TestStaticRouting(t *testing.T) {
	staticDir := setupTestStaticDir(t)
	defer os.RemoveAll(staticDir)

	// Define the handler logic as it appears in main.go
	handler := func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		fullPath := filepath.Join(staticDir, path)

		// 1. Check if file exists
		if _, err := os.Stat(fullPath); err == nil && !strings.HasSuffix(fullPath, "/") {
			http.ServeFile(w, r, fullPath)
			return
		}

		// 2. Static assets (JS/CSS/images) that don't exist should 404, not serve index.html
		if strings.HasPrefix(path, "/assets/") {
			http.NotFound(w, r)
			return
		}

		// 3. For SPA routing: all other non-API paths serve index.html
		if !strings.HasPrefix(path, "/api") {
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}

		http.NotFound(w, r)
	}

	tests := []struct {
		name           string
		path           string
		expectedStatus int
		expectedBody   string
	}{
		{
			name:           "existing asset",
			path:           "/assets/app.js",
			expectedStatus: http.StatusOK,
			expectedBody:   "js content",
		},
		{
			name:           "missing asset - return 404",
			path:           "/assets/missing.js",
			expectedStatus: http.StatusNotFound,
		},
		{
			name:           "root path - return index.html",
			path:           "/",
			expectedStatus: http.StatusOK,
			expectedBody:   "index content",
		},
		{
			name:           "deep SPA route - return index.html",
			path:           "/containers/123",
			expectedStatus: http.StatusOK,
			expectedBody:   "index content",
		},
		{
			name:           "api route missing - return 404",
			path:           "/api/v1/missing",
			expectedStatus: http.StatusNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.path, nil)
			rr := httptest.NewRecorder()

			handler(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("handler returned wrong status code: got %v want %v", rr.Code, tt.expectedStatus)
			}

			if tt.expectedBody != "" {
				if rr.Body.String() != tt.expectedBody {
					t.Errorf("handler returned unexpected body: got %v want %v", rr.Body.String(), tt.expectedBody)
				}
			}
		})
	}
}

package observability

import (
	"bufio"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

// mockResponseWriter implements http.ResponseWriter and http.Hijacker
type mockResponseWriter struct {
	http.ResponseWriter
	hijacked bool
}

func (m *mockResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	m.hijacked = true
	return nil, nil, nil
}

// mockFlusher implements http.ResponseWriter and http.Flusher
type mockFlusher struct {
	http.ResponseWriter
	flushed bool
}

func (m *mockFlusher) Flush() {
	m.flushed = true
}

func TestResponseWriter_Hijack(t *testing.T) {
	// 1. Test with a ResponseWriter that implements Hijacker
	mrw := &mockResponseWriter{ResponseWriter: httptest.NewRecorder()}
	rw := &responseWriter{ResponseWriter: mrw}

	_, _, err := rw.Hijack()
	if err != nil {
		t.Errorf("Hijack failed: %v", err)
	}
	if !mrw.hijacked {
		t.Error("Hijack was not called on upstream ResponseWriter")
	}

	// 2. Test with a ResponseWriter that does NOT implement Hijacker
	rw2 := &responseWriter{ResponseWriter: httptest.NewRecorder()}
	_, _, err = rw2.Hijack()
	if err == nil {
		t.Error("Hijack should have failed on non-hijacker")
	}
}

func TestResponseWriter_Flush(t *testing.T) {
	// 1. Test with a ResponseWriter that implements Flusher
	mf := &mockFlusher{ResponseWriter: httptest.NewRecorder()}
	rw := &responseWriter{ResponseWriter: mf}

	rw.Flush()
	if !mf.flushed {
		t.Error("Flush was not called on upstream ResponseWriter")
	}

	// 2. Test with a ResponseWriter that does NOT implement Flusher
	// (Note: httptest.ResponseRecorder actually implements Flusher, so we need a truly plain one)
	type plainWriter struct{ http.ResponseWriter }
	rw2 := &responseWriter{ResponseWriter: plainWriter{httptest.NewRecorder()}}
	
	// Should not panic
	rw2.Flush()
}

func TestChiMiddleware(t *testing.T) {
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte("ok"))
	})

	handlerToTest := ChiMiddleware(nextHandler)

	req := httptest.NewRequest("GET", "/test-path", nil)
	rr := httptest.NewRecorder()

	handlerToTest.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("handler returned wrong status code: got %v want %v", rr.Code, http.StatusCreated)
	}
}

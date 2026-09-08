package api

import (
	"encoding/json"
	"net/http"
)

// MaxJSONBodyBytes bounds request bodies decoded via ReadJSON. Generous enough
// for any legitimate JSON payload in this API (compose files, env content,
// agent reports) while preventing an unbounded body from exhausting memory.
const MaxJSONBodyBytes = 10 << 20 // 10 MiB

// WriteJSON writes a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Failed to encode JSON response", http.StatusInternalServerError)
	}
}

// ErrorJSON writes a standardized JSON error response.
func ErrorJSON(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// ReadJSON decodes the request body into the provided target interface,
// capped at MaxJSONBodyBytes to prevent unbounded-body memory exhaustion.
func ReadJSON(w http.ResponseWriter, r *http.Request, target interface{}) error {
	r.Body = http.MaxBytesReader(w, r.Body, MaxJSONBodyBytes)
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(target)
}

// ReadJSONLimit is like ReadJSON but with a caller-specified byte limit, for
// endpoints that legitimately need a larger (or smaller) cap than the default.
func ReadJSONLimit(w http.ResponseWriter, r *http.Request, target interface{}, limitBytes int64) error {
	r.Body = http.MaxBytesReader(w, r.Body, limitBytes)
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(target)
}

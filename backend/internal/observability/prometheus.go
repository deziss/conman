package observability

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "conman_http_requests_total",
			Help: "Total number of HTTP requests by method, path, and status.",
		},
		[]string{"method", "path", "status"},
	)

	httpRequestDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "conman_http_request_duration_seconds",
			Help:    "HTTP request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	AgentsTotal = prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "conman_agents_total",
			Help: "Number of registered agents by status.",
		},
		[]string{"status"},
	)

	ContainersTotal = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "conman_containers_total",
			Help: "Total number of containers across all agents.",
		},
	)

	ReportIngestTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "conman_report_ingest_total",
			Help: "Total number of agent reports received.",
		},
	)

	ReportIngestErrors = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "conman_report_ingest_errors_total",
			Help: "Total number of failed agent report ingestions.",
		},
	)

	WebSocketConnections = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "conman_websocket_connections",
			Help: "Number of active WebSocket connections.",
		},
	)
)

func init() {
	prometheus.MustRegister(
		httpRequestsTotal,
		httpRequestDuration,
		AgentsTotal,
		ContainersTotal,
		ReportIngestTotal,
		ReportIngestErrors,
		WebSocketConnections,
	)
}

// MetricsHandler returns the Prometheus metrics HTTP handler.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// ChiMiddleware returns a Chi-compatible middleware that instruments HTTP requests.
func ChiMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		duration := time.Since(start).Seconds()

		// Use the Chi route pattern for consistent path labels (avoids high cardinality)
		routePattern := chi.RouteContext(r.Context()).RoutePattern()
		if routePattern == "" {
			routePattern = r.URL.Path
		}

		httpRequestsTotal.WithLabelValues(r.Method, routePattern, strconv.Itoa(wrapped.statusCode)).Inc()
		httpRequestDuration.WithLabelValues(r.Method, routePattern).Observe(duration)
	})
}

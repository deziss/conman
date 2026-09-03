package api

import (
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

type ScannerHandler struct {
	scanner *service.ImageScannerService
}

type VulnerabilityResponse struct {
	ID              uint                       `json:"id"`
	CreatedAt       time.Time                  `json:"created_at"`
	UpdatedAt       time.Time                  `json:"updated_at"`
	ImageID         string                     `json:"image_id"`
	ImageTag        string                     `json:"image_tag"`
	Status          string                     `json:"status"`
	Scanner         string                     `json:"scanner"`
	CriticalCount   int                        `json:"critical_count"`
	HighCount       int                        `json:"high_count"`
	MediumCount     int                        `json:"medium_count"`
	LowCount        int                        `json:"low_count"`
	UnknownCount    int                        `json:"unknown_count"`
	TotalCount      int                        `json:"total_count"`
	Vulnerabilities []models.VulnerabilityItem `json:"vulnerabilities"`
	ErrorMessage    string                     `json:"error_message,omitempty"`
	ScannedAt       time.Time                  `json:"scanned_at"`
}

func toResponse(report *models.VulnerabilityReport) *VulnerabilityResponse {
	if report == nil {
		return nil
	}
	resp := &VulnerabilityResponse{
		ID:              report.ID,
		CreatedAt:       report.CreatedAt,
		UpdatedAt:       report.UpdatedAt,
		ImageID:         report.ImageID,
		ImageTag:        report.ImageTag,
		Status:          report.Status,
		Scanner:         report.Scanner,
		CriticalCount:   report.CriticalCount,
		HighCount:       report.HighCount,
		MediumCount:     report.MediumCount,
		LowCount:        report.LowCount,
		UnknownCount:    report.UnknownCount,
		TotalCount:      report.TotalCount,
		ErrorMessage:    report.ErrorMessage,
		ScannedAt:       report.ScannedAt,
		Vulnerabilities: []models.VulnerabilityItem{},
	}
	if report.ResultsJSON != "" {
		_ = json.Unmarshal([]byte(report.ResultsJSON), &resp.Vulnerabilities)
	}
	return resp
}

func NewScannerHandler() *ScannerHandler {
	return &ScannerHandler{
		scanner: service.GetScannerService(),
	}
}

func cleanScannerImageID(rawID string) string {
	id := rawID
	for i := 0; i < 3; i++ {
		if strings.Contains(id, "%") {
			if unescaped, err := url.QueryUnescape(id); err == nil && unescaped != "" {
				id = unescaped
			} else {
				break
			}
		} else {
			break
		}
	}
	return strings.TrimSpace(id)
}

// ScanImage triggers a Trivy vulnerability scan for an image
func (h *ScannerHandler) ScanImage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = r.URL.Query().Get("id")
	}
	decodedID := cleanScannerImageID(id)

	force := r.URL.Query().Get("force") == "true"
	imageRef := r.URL.Query().Get("image")

	// If no explicit image tag/ref supplied, inspect image to find primary tag
	if imageRef == "" {
		cli := service.GetDockerClient()
		if cli != nil {
			if info, _, err := cli.ImageInspectWithRaw(r.Context(), decodedID); err == nil {
				if len(info.RepoTags) > 0 && info.RepoTags[0] != "<none>:<none>" {
					imageRef = info.RepoTags[0]
				} else {
					imageRef = decodedID
				}
			}
		}
	}

	if imageRef == "" {
		imageRef = decodedID
	}

	scanner := service.GetScannerService()
	if scanner == nil {
		ErrorJSON(w, http.StatusServiceUnavailable, "Scanner service not initialized")
		return
	}

	report, err := scanner.ScanImage(r.Context(), imageRef, decodedID, force)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, toResponse(report))
}

// GetImageVulnerabilities returns existing scan report for an image
func (h *ScannerHandler) GetImageVulnerabilities(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = r.URL.Query().Get("id")
	}
	decodedID := cleanScannerImageID(id)

	imageRef := r.URL.Query().Get("image")

	scanner := service.GetScannerService()
	if scanner == nil {
		ErrorJSON(w, http.StatusServiceUnavailable, "Scanner service not initialized")
		return
	}

	report, err := scanner.GetReport(decodedID, imageRef)
	if err != nil {
		if strings.Contains(err.Error(), "record not found") {
			ErrorJSON(w, http.StatusNotFound, "No vulnerability scan report found for this image")
			return
		}
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, toResponse(report))
}

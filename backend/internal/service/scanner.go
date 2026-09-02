package service

import (
	"bytes"
	"conman-backend/internal/models"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

type TrivyScanOutput struct {
	SchemaVersion int    `json:"SchemaVersion"`
	ArtifactName  string `json:"ArtifactName"`
	ArtifactType  string `json:"ArtifactType"`
	Results       []struct {
		Target          string `json:"Target"`
		Class           string `json:"Class"`
		Type            string `json:"Type"`
		Vulnerabilities []struct {
			VulnerabilityID  string `json:"VulnerabilityID"`
			PkgName          string `json:"PkgName"`
			InstalledVersion string `json:"InstalledVersion"`
			FixedVersion     string `json:"FixedVersion"`
			Severity         string `json:"Severity"`
			Title            string `json:"Title"`
			Description      string `json:"Description"`
			PrimaryURL       string `json:"PrimaryURL"`
			CVSS             map[string]struct {
				V3Score float64 `json:"V3Score"`
			} `json:"CVSS"`
		} `json:"Vulnerabilities"`
	} `json:"Results"`
}

type ImageScannerService struct {
	db       *gorm.DB
	activity *ActivityService
	mu       sync.Mutex
	inFlight map[string]chan struct{}
}

var (
	scannerInstance *ImageScannerService
	scannerOnce     sync.Once
)

func InitScannerService(db *gorm.DB, activity *ActivityService) *ImageScannerService {
	scannerOnce.Do(func() {
		scannerInstance = &ImageScannerService{
			db:       db,
			activity: activity,
			inFlight: make(map[string]chan struct{}),
		}
	})
	return scannerInstance
}

func GetScannerService() *ImageScannerService {
	return scannerInstance
}

// GetReport retrieves the latest completed vulnerability report for an image
func (s *ImageScannerService) GetReport(imageID, imageTag string) (*models.VulnerabilityReport, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var report models.VulnerabilityReport
	query := s.db.Where("image_id = ? OR (image_tag = ? AND image_tag != '')", imageID, imageTag).
		Order("scanned_at desc")

	if err := query.First(&report).Error; err != nil {
		return nil, err
	}
	return &report, nil
}

// ScanImage runs a Trivy scan on the specified image and saves the results
func (s *ImageScannerService) ScanImage(ctx context.Context, imageRef, imageID string, force bool) (*models.VulnerabilityReport, error) {
	if imageRef == "" && imageID != "" {
		imageRef = imageID
	}
	if imageRef == "" {
		return nil, fmt.Errorf("no image reference or ID provided")
	}

	// 1. Check for cached report if not forcing re-scan
	if !force && s.db != nil {
		if existing, err := s.GetReport(imageID, imageRef); err == nil && existing != nil {
			if existing.Status == "completed" && time.Since(existing.ScannedAt) < 24*time.Hour {
				return existing, nil
			}
		}
	}

	// 2. Prevent concurrent scans of the same image
	s.mu.Lock()
	ch, running := s.inFlight[imageRef]
	if running {
		s.mu.Unlock()
		select {
		case <-ch:
			return s.GetReport(imageID, imageRef)
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	doneChan := make(chan struct{})
	s.inFlight[imageRef] = doneChan
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.inFlight, imageRef)
		close(doneChan)
		s.mu.Unlock()
	}()

	// 3. Mark image as scanning in DB
	if s.db != nil {
		var existing models.VulnerabilityReport
		if err := s.db.Where("image_id = ? OR image_tag = ?", imageID, imageRef).First(&existing).Error; err == nil {
			existing.Status = "scanning"
			s.db.Save(&existing)
		} else {
			s.db.Create(&models.VulnerabilityReport{
				ImageID:   imageID,
				ImageTag:  imageRef,
				Status:    "scanning",
				Scanner:   "trivy",
				ScannedAt: time.Now(),
			})
		}
	}

	// 4. Execute Trivy scan
	scanCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()

	var stdout, stderr bytes.Buffer
	var cmd *exec.Cmd

	// Priority A: Docker container run (standard for Conman host daemon)
	dockerPath, err := exec.LookPath("docker")
	if err == nil && dockerPath != "" {
		cmd = exec.CommandContext(scanCtx, "docker", "run", "--rm",
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-v", "conman-trivy-cache:/root/.cache/",
			"aquasec/trivy:latest",
			"image", "--format", "json", "--quiet", imageRef,
		)
	} else if trivyPath, err := exec.LookPath("trivy"); err == nil && trivyPath != "" {
		// Priority B: Native trivy CLI on host
		cmd = exec.CommandContext(scanCtx, "trivy", "image", "--format", "json", "--quiet", imageRef)
	} else {
		err := fmt.Errorf("neither docker nor trivy CLI found on host system")
		s.recordFailedScan(imageID, imageRef, err.Error())
		return nil, err
	}

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	log.Printf("[Scanner] Starting Trivy vulnerability scan for image: %s (%s)", imageRef, imageID)
	startTime := time.Now()
	runErr := cmd.Run()
	duration := time.Since(startTime)

	if runErr != nil {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = runErr.Error()
		}
		log.Printf("[Scanner] Trivy scan failed for %s after %v: %s", imageRef, duration, errMsg)
		s.recordFailedScan(imageID, imageRef, errMsg)
		return nil, fmt.Errorf("trivy scan failed: %s", errMsg)
	}

	// 5. Parse Trivy output
	var trivyOut TrivyScanOutput
	if err := json.Unmarshal(stdout.Bytes(), &trivyOut); err != nil {
		log.Printf("[Scanner] Failed to parse Trivy output JSON: %v", err)
		s.recordFailedScan(imageID, imageRef, fmt.Sprintf("failed to parse trivy JSON: %v", err))
		return nil, fmt.Errorf("failed to parse trivy output: %w", err)
	}

	// 6. Aggregate vulnerability findings
	var items []models.VulnerabilityItem
	var crit, high, med, low, unk int

	for _, res := range trivyOut.Results {
		for _, v := range res.Vulnerabilities {
			sev := strings.ToUpper(v.Severity)
			switch sev {
			case "CRITICAL":
				crit++
			case "HIGH":
				high++
			case "MEDIUM":
				med++
			case "LOW":
				low++
			default:
				unk++
			}

			var score float64
			for _, cvss := range v.CVSS {
				if cvss.V3Score > 0 {
					score = cvss.V3Score
					break
				}
			}

			items = append(items, models.VulnerabilityItem{
				ID:               v.VulnerabilityID,
				VulnerabilityID:  v.VulnerabilityID,
				PkgName:          v.PkgName,
				PackageName:      v.PkgName,
				InstalledVersion: v.InstalledVersion,
				FixedVersion:     v.FixedVersion,
				Severity:         sev,
				Title:            v.Title,
				Description:      v.Description,
				PrimaryURL:       v.PrimaryURL,
				Score:            score,
			})
		}
	}

	itemsBytes, _ := json.Marshal(items)

	report := &models.VulnerabilityReport{
		ImageID:       imageID,
		ImageTag:      imageRef,
		Status:        "completed",
		Scanner:       "trivy",
		CriticalCount: crit,
		HighCount:     high,
		MediumCount:   med,
		LowCount:      low,
		UnknownCount:  unk,
		TotalCount:    len(items),
		ResultsJSON:   string(itemsBytes),
		ScannedAt:     time.Now(),
	}

	// 7. Persist report to database
	if s.db != nil {
		var existing models.VulnerabilityReport
		if err := s.db.Where("image_id = ? OR image_tag = ?", imageID, imageRef).First(&existing).Error; err == nil {
			report.ID = existing.ID
			s.db.Save(report)
		} else {
			s.db.Create(report)
		}

		// Record Audit Activity
		if s.activity != nil {
			sev := "info"
			if crit > 0 {
				sev = "critical"
			} else if high > 0 {
				sev = "warning"
			}

			go s.activity.RecordActivity(
				"", "", "image", "vulnerability_scan", sev,
				imageID, imageRef, "trivy-scanner", "system",
				fmt.Sprintf("Vulnerability scan completed for %s in %v: %d CVEs found (%d Critical, %d High, %d Medium, %d Low)",
					imageRef, duration.Round(time.Millisecond), len(items), crit, high, med, low),
				"", "", nil, time.Now(),
			)
		}
	}

	log.Printf("[Scanner] Completed Trivy scan for %s in %v: %d vulnerabilities (%d Critical, %d High)",
		imageRef, duration.Round(time.Millisecond), len(items), crit, high)

	return report, nil
}

func (s *ImageScannerService) recordFailedScan(imageID, imageRef, errMsg string) {
	if s.db == nil {
		return
	}
	var existing models.VulnerabilityReport
	if err := s.db.Where("image_id = ? OR image_tag = ?", imageID, imageRef).First(&existing).Error; err == nil {
		existing.Status = "failed"
		existing.ErrorMessage = errMsg
		existing.ScannedAt = time.Now()
		s.db.Save(&existing)
	} else {
		s.db.Create(&models.VulnerabilityReport{
			ImageID:      imageID,
			ImageTag:     imageRef,
			Status:       "failed",
			Scanner:      "trivy",
			ErrorMessage: errMsg,
			ScannedAt:    time.Now(),
		})
	}
}

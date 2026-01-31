package api

import (
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"context"
	"io"
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"strings"
)

type DockerHandler struct{}

func NewDockerHandler() *DockerHandler {
	return &DockerHandler{}
}

func (h *DockerHandler) ListImages(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
	images, err := cli.ImageList(context.Background(), image.ListOptions{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Get running containers to check usage
    containers, err := cli.ContainerList(context.Background(), container.ListOptions{})
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }

    usedImages := make(map[string]bool)
    for _, c := range containers {
        usedImages[c.ImageID] = true
        // Also check against image names just in case
        usedImages[c.Image] = true
    }

	var result []models.Image
	for _, img := range images {
        status := "unused"
        if usedImages[img.ID] {
            status = "used"
        } else {
             // Check repo tags
             for _, tag := range img.RepoTags {
                 if usedImages[tag] {
                     status = "used"
                     break
                 }
             }
        }

        repo := "<none>"
        if len(img.RepoTags) > 0 {
            parts := strings.Split(img.RepoTags[0], ":")
            if len(parts) > 0 {
                repo = parts[0]
            }
        }

		result = append(result, models.Image{
			ID:              img.ID,
            Repo:            repo,
			Tags:            img.RepoTags,
			Size:            img.Size,
			Created:         img.Created,
            Status:          status,
            UpdateAvailable: false, // Not implemented yet
		})
	}
	WriteJSON(w, http.StatusOK, result)
}

func (h *DockerHandler) PruneContainers(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
	report, err := cli.ContainersPrune(context.Background(), filters.Args{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"message": "Containers pruned successfully", "details": report})
}

func (h *DockerHandler) PruneImages(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
	report, err := cli.ImagesPrune(context.Background(), filters.Args{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]interface{}{"message": "Images pruned successfully", "details": report})
}

func (h *DockerHandler) GetSystemInfo(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
	info, err := cli.Info(context.Background())
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, models.SystemInfo{
		Containers:    info.Containers,
		Images:        info.Images,
		DockerVersion: info.ServerVersion,
		MemoryTotal:   info.MemTotal,
		CPUCount:      info.NCPU,
        Name:          info.Name,
        KernelVersion: info.KernelVersion,
        OperatingSystem: info.OperatingSystem,
        Architecture:  info.Architecture,
	})
}

func (h *DockerHandler) RemoveImage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	cli := service.GetDockerClient()

	_, err := cli.ImageRemove(context.Background(), id, image.RemoveOptions{Force: true})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{"message": "Image removed successfully"})
}

func (h *DockerHandler) PullImage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Image string `json:"image"`
	}
	if err := ReadJSON(r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	cli := service.GetDockerClient()
	reader, err := cli.ImagePull(context.Background(), req.Image, image.PullOptions{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer reader.Close()
	
	// Read the output to ensure pull completes (blocking for simplicity for now)
	// In a real app, we might stream this back to the client via WebSocket
	io.Copy(io.Discard, reader)

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Image pulled successfully"})
}

func (h *DockerHandler) InspectImage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		id = r.URL.Query().Get("id")
	}
	cli := service.GetDockerClient()

	info, _, err := cli.ImageInspectWithRaw(context.Background(), id)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, info)
}

func (h *DockerHandler) GetSystemDF(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
	
	// DiskUsage returns (types.DiskUsage, error)
    // Pass types.DiskUsageOptions instead of filters.Args
	usage, err := cli.DiskUsage(context.Background(), types.DiskUsageOptions{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, usage)
}

func (h *DockerHandler) CheckUpdate(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    // URL-decode the id (browser sends sha256%3A... but Docker needs sha256:...)
    decodedID, err := url.QueryUnescape(id)
    if err != nil {
        decodedID = id // fallback to original if decode fails
    }
	cli := service.GetDockerClient()
	
	// We need image info to get repo:tag
	info, _, err := cli.ImageInspectWithRaw(context.Background(), decodedID)
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	
	if len(info.RepoTags) == 0 {
		WriteJSON(w, http.StatusOK, map[string]interface{}{"update_available": false, "reason": "no_tag"})
		return
	}
	
	// Check first tag
	currentTag := info.RepoTags[0]
	updateAvailable, latestVersion, err := service.CheckForUpdate(currentTag, info.ID)
	if err != nil {
		 // Don't fail the request, just report error in JSON
		 WriteJSON(w, http.StatusOK, map[string]interface{}{
			"update_available": false, 
			"error": err.Error(),
			"current_tag": currentTag,
		 })
		 return
	}
	
	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"update_available": updateAvailable,
		"current_tag":      currentTag,
		"available_tag":    latestVersion,
	})
}

func (h *DockerHandler) GetSystemStats(w http.ResponseWriter, r *http.Request) {
    collector := service.GetStatsCollector()
    if collector == nil {
        ErrorJSON(w, http.StatusServiceUnavailable, "Stats collector not initialized")
        return
    }

    stats := collector.GetSystemStats()
    if stats == nil {
        // Fallback or return empty if not yet collected
        WriteJSON(w, http.StatusOK, models.SystemStats{})
        return
    }

	WriteJSON(w, http.StatusOK, stats)
}

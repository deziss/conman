package api

import (
	"conman-backend/internal/service"
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/docker/docker/api/types/volume"
    "github.com/docker/docker/api/types/filters"
)

type VolumeHandler struct{}

func NewVolumeHandler() *VolumeHandler {
	return &VolumeHandler{}
}

func (h *VolumeHandler) ListVolumes(w http.ResponseWriter, r *http.Request) {
	cli := service.GetDockerClient()
	volumes, err := cli.VolumeList(context.Background(), volume.ListOptions{})
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Return list directly to match other APIs, or the VolumeListOKBody struct
    // VolumeList returns struct with Volumes field. We can just return that.
	WriteJSON(w, http.StatusOK, volumes.Volumes)
}

func (h *VolumeHandler) InspectVolume(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "name")
    if id == "" {
        id = r.URL.Query().Get("id")
    }

    cli := service.GetDockerClient()
    vol, err := cli.VolumeInspect(context.Background(), id)
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, vol)
}

func (h *VolumeHandler) CreateVolume(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Name   string `json:"name"`
        Driver string `json:"driver"`
    }
    if err := ReadJSON(r, &req); err != nil {
        ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
        return
    }
    
    if req.Driver == "" {
        req.Driver = "local"
    }

    cli := service.GetDockerClient()
    vol, err := cli.VolumeCreate(context.Background(), volume.CreateOptions{
        Name: req.Name,
        Driver: req.Driver,
    })
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, vol)
}

func (h *VolumeHandler) RemoveVolume(w http.ResponseWriter, r *http.Request) {
    name := chi.URLParam(r, "name")
    cli := service.GetDockerClient()
    
    // Force removal? usually prudent not to, but user can always ensure stopped. 
    // Set force=false for safety.
    err := cli.VolumeRemove(context.Background(), name, false)
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Volume removed"})
}

func (h *VolumeHandler) PruneVolumes(w http.ResponseWriter, r *http.Request) {
    cli := service.GetDockerClient()
    report, err := cli.VolumesPrune(context.Background(), filters.Args{})
        if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, report)
}

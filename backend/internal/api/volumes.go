package api

import (
	"conman-backend/internal/service"
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/api/types/filters"
    "github.com/docker/docker/api/types/container"
)

type VolumeHandler struct{}

func NewVolumeHandler() *VolumeHandler {
	return &VolumeHandler{}
}

type VolumeWithUsage struct {
    *volume.Volume
    Usage []string `json:"usage"`
}

func (h *VolumeHandler) ListVolumes(w http.ResponseWriter, r *http.Request) {
    cli := service.GetDockerClient()
    
    // Get Volumes
    volList, err := cli.VolumeList(context.Background(), volume.ListOptions{})
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }

    // Get Containers to find usage
    containers, err := cli.ContainerList(context.Background(), container.ListOptions{All: true})
    if err != nil {
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }

    usageMap := make(map[string][]string)
    for _, c := range containers {
        for _, m := range c.Mounts {
            if m.Type == "volume" {
                // m.Name is the volume name
                name := ""
                if len(c.Names) > 0 {
                    name = c.Names[0] // e.g., /my-container
                } else {
                    name = c.ID[:12]
                }
                usageMap[m.Name] = append(usageMap[m.Name], name)
            }
        }
    }

    var result []VolumeWithUsage
    for _, v := range volList.Volumes {
        // v is *volume.Volume, we need to deferencing or clone?
        // It's a pointer in the slice usually?
        // docker types: VolumeListOKBody.Volumes is []*Volume
        
        // Create a local copy to avoid modifying the original pointer if that matters,
        // but mainly to compose the struct.
        // We can just embed the pointer.
        vCopy := v
        result = append(result, VolumeWithUsage{
            Volume: vCopy,
            Usage:  usageMap[v.Name],
        })
    }

    WriteJSON(w, http.StatusOK, result)
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

func (h *VolumeHandler) BrowseVolume(w http.ResponseWriter, r *http.Request) {
    volName := chi.URLParam(r, "name")
    cli := service.GetDockerClient()
    ctx := context.Background()

    // Helper container name
    helperName := "conman-browser-" + volName

    // Check if running
    containers, _ := cli.ContainerList(ctx, container.ListOptions{All: true})
    for _, c := range containers {
        for _, n := range c.Names {
            if n == "/"+helperName {
                if c.State != "running" {
                    cli.ContainerStart(ctx, c.ID, container.StartOptions{})
                }
                WriteJSON(w, http.StatusOK, map[string]string{"containerId": c.ID})
                return
            }
        }
    }

    // Create new helper
    resp, err := cli.ContainerCreate(ctx, &container.Config{
        Image: "alpine",
        Cmd:   []string{"tail", "-f", "/dev/null"},
    }, &container.HostConfig{
        Binds: []string{volName + ":/mnt/volume"},
    }, nil, nil, helperName)
    
    if err != nil {
        // If image not found, pull it? usually alpine is there.
        ErrorJSON(w, http.StatusInternalServerError, "Failed to create browser container: "+err.Error())
        return
    }

    if err := cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, "Failed to start browser: "+err.Error())
        return
    }

    WriteJSON(w, http.StatusOK, map[string]string{"containerId": resp.ID})
}

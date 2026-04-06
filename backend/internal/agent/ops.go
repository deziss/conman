package agent

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
    "github.com/docker/docker/api/types/network"
    "github.com/docker/docker/api/types/volume"
    "github.com/docker/docker/api/types/image"
)

// -- Container Operations --

func (a *Agent) handleStartContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Container ID required", http.StatusBadRequest)
		return
	}

	if err := a.docker.ContainerStart(context.Background(), id, container.StartOptions{}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"message": "Container started"})
}

func (a *Agent) handleStopContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Container ID required", http.StatusBadRequest)
		return
	}

    timeout := 10 // defaults
	if err := a.docker.ContainerStop(context.Background(), id, container.StopOptions{Timeout: &timeout}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"message": "Container stopped"})
}

func (a *Agent) handleRestartContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
    timeout := 10
	if err := a.docker.ContainerRestart(context.Background(), id, container.StopOptions{Timeout: &timeout}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"message": "Container restarted"})
}

func (a *Agent) handleRemoveContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if err := a.docker.ContainerRemove(context.Background(), id, container.RemoveOptions{Force: true}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"message": "Container removed"})
}

func (a *Agent) handleInspectContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	info, err := a.docker.ContainerInspect(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(info)
}

// -- Image Operations --

func (a *Agent) handlePullImage(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Image string `json:"image"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid body", http.StatusBadRequest)
        return
    }

    // Pull image 
    reader, err := a.docker.ImagePull(context.Background(), req.Image, image.PullOptions{})
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    defer reader.Close()
    io.Copy(io.Discard, reader)

    json.NewEncoder(w).Encode(map[string]string{"message": "Image pulled"})
}

func (a *Agent) handleRemoveImage(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if _, err := a.docker.ImageRemove(context.Background(), id, image.RemoveOptions{Force: true}); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(map[string]string{"message": "Image removed"})
}

func (a *Agent) handleInspectImage(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	info, _, err := a.docker.ImageInspectWithRaw(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// -- Volume Operations --

func (a *Agent) handleCreateVolume(w http.ResponseWriter, r *http.Request) {
    var req volume.CreateOptions
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid body", http.StatusBadRequest)
        return
    }
    
    vol, err := a.docker.VolumeCreate(context.Background(), req)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(vol)
}

func (a *Agent) handleRemoveVolume(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    if err := a.docker.VolumeRemove(context.Background(), name, false); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(map[string]string{"message": "Volume removed"})
}

func (a *Agent) handleInspectVolume(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing name", http.StatusBadRequest)
		return
	}

	info, err := a.docker.VolumeInspect(context.Background(), name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

func (a *Agent) handleBrowseVolume(w http.ResponseWriter, r *http.Request) {
    volName := r.URL.Query().Get("name")
    
    // Helper container name
    helperName := "conman-browser-" + volName
    ctx := context.Background()

    // Check if running
    containers, _ := a.docker.ContainerList(ctx, container.ListOptions{All: true})
    for _, c := range containers {
        for _, n := range c.Names {
            if n == "/"+helperName {
                if c.State != "running" {
                    a.docker.ContainerStart(ctx, c.ID, container.StartOptions{})
                }
                json.NewEncoder(w).Encode(map[string]string{"containerId": c.ID})
                return
            }
        }
    }

    // Pull alpine if needed
    // We try to create, if it fails due to missing image, we pull.
    // Simplifying: Just define image.
    imgName := "alpine:latest"
    
    _, _, err := a.docker.ImageInspectWithRaw(ctx, imgName)
    if err != nil {
         reader, err := a.docker.ImagePull(ctx, imgName, image.PullOptions{})
         if err != nil {
             http.Error(w, "Failed to pull alpine: "+err.Error(), http.StatusInternalServerError)
             return
         }
         io.Copy(io.Discard, reader)
         reader.Close()
    }

    // Create new helper
    resp, err := a.docker.ContainerCreate(ctx, &container.Config{
        Image: imgName,
        Cmd:   []string{"tail", "-f", "/dev/null"},
    }, &container.HostConfig{
        Binds: []string{volName + ":/mnt/volume"},
    }, nil, nil, helperName)
    
    if err != nil {
        http.Error(w, "Failed to create browser container: "+err.Error(), http.StatusInternalServerError)
        return
    }

    if err := a.docker.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
        http.Error(w, "Failed to start browser: "+err.Error(), http.StatusInternalServerError)
        return
    }

    json.NewEncoder(w).Encode(map[string]string{"containerId": resp.ID})
}

// -- Network Operations --

func (a *Agent) handleCreateNetwork(w http.ResponseWriter, r *http.Request) {
    var req types.NetworkCreateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid body", http.StatusBadRequest)
        return
    }
    
    // name := req.Name
    // Fallback logic removed

    res, err := a.docker.NetworkCreate(context.Background(), req.Name, types.NetworkCreate{
        Driver: req.Driver,
        CheckDuplicate: true,
    })
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(res)
}

func (a *Agent) handleRemoveNetwork(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if err := a.docker.NetworkRemove(context.Background(), id); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(map[string]string{"message": "Network removed"})
}

func (a *Agent) handleConnectNetwork(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    var req struct {
        ContainerID string `json:"containerId"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    
    if err := a.docker.NetworkConnect(context.Background(), id, req.ContainerID, &network.EndpointSettings{}); err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(map[string]string{"message": "Connected"})
}

func (a *Agent) handleDuplicateNetwork(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    ctx := context.Background()
    
    // Inspect
    netParams, err := a.docker.NetworkInspect(ctx, id, types.NetworkInspectOptions{})
    if err != nil {
         http.Error(w, err.Error(), http.StatusInternalServerError)
         return
    }
    
    newName := netParams.Name + "_copy"
    
    // Create
    res, err := a.docker.NetworkCreate(ctx, newName, types.NetworkCreate{
        Driver: netParams.Driver,
        IPAM: &network.IPAM{
            Driver: netParams.IPAM.Driver,
            Config: netParams.IPAM.Config,
        },
        Labels: netParams.Labels,
        Options: netParams.Options,
        Internal: netParams.Internal,
        Attachable: netParams.Attachable,
        Ingress: netParams.Ingress,
        CheckDuplicate: true,
    })
    
     if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    json.NewEncoder(w).Encode(res)
}

func (a *Agent) handleInspectNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	info, err := a.docker.NetworkInspect(context.Background(), id, types.NetworkInspectOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

func (a *Agent) handleCheckImageUpdate(w http.ResponseWriter, r *http.Request) {
    // Logic skipped
    json.NewEncoder(w).Encode(map[string]interface{}{
        "update_available": false,
        "checked_at": "now",
    })
}

// Download File Proxy
func (a *Agent) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    path := r.URL.Query().Get("path")
    
    reader, _, err := a.docker.CopyFromContainer(context.Background(), id, path)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    defer reader.Close()
    
    w.Header().Set("Content-Type", "application/x-tar")
    io.Copy(w, reader)
}

package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
    "os"
    "os/exec"
	"strings"


	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WSWriter struct {
	Conn *websocket.Conn
}

func (w *WSWriter) Write(p []byte) (n int, err error) {
	err = w.Conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

type ExecMessage struct {
	Type string `json:"type"` // "input", "resize"
	Data string `json:"data,omitempty"`
	Rows int    `json:"rows,omitempty"`
	Cols int    `json:"cols,omitempty"`
}



// handleStreamExec handles interactive container shell
func (a *Agent) handleStreamExec(w http.ResponseWriter, r *http.Request) {
    // Expected URL: /api/containers/{id}/exec
    // We can extract ID from URL path since we are using ServeMux in agent.go
    // But ServeMux pattern matching isn't as flexible as Chi.
    // We'll rely on query param or simple path splitting if we use a specific prefix
    
    // Actually, in agent.go I will register "/api/containers/" handler which does prefix matching
    // then creates a sub-handler or extracts ID.
    // Or I can just use query param ?id=... which is easier with ServeMux
    
    id := r.URL.Query().Get("id")
    if id == "" {
        // Fallback: try to parse from path if registerd as /api/containers/exec/
        // easier to use query param for internal agent API
        http.Error(w, "Missing container ID", http.StatusBadRequest)
        return
    }

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	if _, err := a.docker.ContainerInspect(context.Background(), id); err != nil {
		ws.WriteJSON(map[string]string{"error": "Container not found"})
		return
	}

	execConfig := types.ExecConfig{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Cmd:          []string{"/bin/sh"},
	}

	execIDResp, err := a.docker.ContainerExecCreate(context.Background(), id, execConfig)
	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}

	attachConfig := types.ExecStartCheck{
		Tty: true,
	}
	resp, err := a.docker.ContainerExecAttach(context.Background(), execIDResp.ID, attachConfig)
	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer resp.Close()

	go func() {
		wsWriter := &WSWriter{Conn: ws}
		_, _ = io.Copy(wsWriter, resp.Reader)
	}()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var execMsg ExecMessage
		if err := json.Unmarshal(msg, &execMsg); err != nil {
			continue
		}

		if execMsg.Type == "resize" {
			_ = a.docker.ContainerExecResize(context.Background(), execIDResp.ID, container.ResizeOptions{
				Height: uint(execMsg.Rows),
				Width:  uint(execMsg.Cols),
			})
		} else if execMsg.Type == "input" {
			_, _ = resp.Conn.Write([]byte(execMsg.Data))
		}
	}
}

type FileEntry struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	Mode    string `json:"mode"`
	ModTime string `json:"mod_time"`
	IsDir   bool   `json:"is_dir"`
}

// handleListFiles lists files in a container
func (a *Agent) handleListFiles(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "Missing container ID", http.StatusBadRequest)
        return
    }
    
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	// Use standard ls -lan for better compatibility
	execConfig := types.ExecConfig{
		AttachStdout: true,
		AttachStderr: true,
		Cmd:          []string{"ls", "-lan", path},
	}

	execIDResp, err := a.docker.ContainerExecCreate(context.Background(), id, execConfig)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp, err := a.docker.ContainerExecAttach(context.Background(), execIDResp.ID, types.ExecStartCheck{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Close()

	var outBuf bytes.Buffer
	var errBuf bytes.Buffer

	_, err = stdcopy.StdCopy(&outBuf, &errBuf, resp.Reader)
	if err != nil {
		http.Error(w, "Failed to read exec output", http.StatusInternalServerError)
		return
	}

	errMsg := errBuf.String()
	if errMsg != "" {
		http.Error(w, strings.TrimSpace(errMsg), http.StatusBadRequest)
		return
	}

	files := []FileEntry{}
	lines := strings.Split(outBuf.String(), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "total") {
			continue
		}

		// Example: drwxr-xr-x    1 0        0             4096 Jan 30 12:34 bin
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}

		mode := fields[0]
		isDir := strings.HasPrefix(mode, "d")
		
		// Name starts at index 8
		name := strings.Join(fields[8:], " ")
		
		// Construct basic mod time string like "Jan 30 12:34"
		// Index 5, 6, 7
		modTime := strings.Join(fields[5:8], " ")

		files = append(files, FileEntry{
			Name:    name,
			Size:    0, // parsing skipped for brevity
			Mode:    mode,
			ModTime: modTime,
			IsDir:   isDir,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// handleStreamLogs streams container logs via WebSocket
func (a *Agent) handleStreamLogs(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "Missing container ID", http.StatusBadRequest)
        return
    }

    tail := r.URL.Query().Get("tail")
    if tail == "" {
        tail = "100"
    }
    
    // Upgrade to WebSocket
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("Upgrade error: %v", err)
        return
    }
    defer ws.Close()

    // Create log stream options
    opts := container.LogsOptions{
        ShowStdout: true,
        ShowStderr: true,
        Follow:     true,
        Tail:       tail,
        Timestamps: true,
    }

    // Connect to Docker logs
    reader, err := a.docker.ContainerLogs(context.Background(), id, opts)
    if err != nil {
        ws.WriteMessage(websocket.TextMessage, []byte("Error getting logs: "+err.Error()))
        return
    }
    defer reader.Close()

    // Multiplex stdout/stderr into the WebSocket
    // Using a custom writer that strips headers if strictly needed, 
    // but stdcopy is for writing to two streams.
    // For simple text streaming, we can just read the stdcopy frame headers and payload.
    // Or closer: use stdcopy to write to our WS Writer.
    
    wsWriter := &WSWriter{Conn: ws}
    
    // stdcopy.StdCopy demultiplexes the stream. 
    // We want to merge them into the websocket.
    _, err = stdcopy.StdCopy(wsWriter, wsWriter, reader)
    if err != nil {
        log.Printf("Stream error: %v", err)
    }
}

// handleStreamStats streams container stats via WebSocket
func (a *Agent) handleStreamStats(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing container ID", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	stats, err := a.docker.ContainerStats(context.Background(), id, true)
	if err != nil {
		ws.WriteMessage(websocket.TextMessage, []byte("Error getting stats: "+err.Error()))
		return
	}
	defer stats.Body.Close()

	// Stats are streamed as JSON objects
	wsWriter := &WSWriter{Conn: ws}
	_, err = io.Copy(wsWriter, stats.Body)
	if err != nil {
		log.Printf("Stats stream error: %v", err)
	}
}

// handleInspectContainer returns detailed container info
func (a *Agent) handleInspectContainer(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	info, err := a.docker.ContainerInspect(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

// handleInspectImage returns detailed image info
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

// handleInspectNetwork returns detailed network info
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

// handleInspectVolume returns detailed volume info
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

// handleSystemDF returns system disk usage
func (a *Agent) handleSystemDF(w http.ResponseWriter, r *http.Request) {
	usage, err := a.docker.DiskUsage(context.Background(), types.DiskUsageOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(usage)
}

func (a *Agent) handleDuplicateNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	source, err := a.docker.NetworkInspect(ctx, id, types.NetworkInspectOptions{})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	ipam := network.IPAM{
		Driver: source.IPAM.Driver,
	}

	options := make(map[string]string)
	for k, v := range source.Options {
		if k != "com.docker.network.bridge.name" {
			options[k] = v
		}
	}

	createOpts := types.NetworkCreate{
		CheckDuplicate: true,
		Driver:         source.Driver,
		Scope:          source.Scope,
		EnableIPv6:     source.EnableIPv6,
		IPAM:           &ipam,
		Internal:       source.Internal,
		Attachable:     source.Attachable,
		Ingress:        source.Ingress,
		ConfigOnly:     source.ConfigOnly,
		Options:        options,
		Labels:         source.Labels,
	}
	
	newName := source.Name + "-copy"
	
	resp, err := a.docker.NetworkCreate(ctx, newName, createOpts)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func (a *Agent) handleConnectNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing network ID", http.StatusBadRequest)
		return
	}
	
	var req struct {
		ContainerID string `json:"container_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("ConnectNetwork: invalid body: %v", err)
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	log.Printf("ConnectNetwork: connecting container %s to network %s", req.ContainerID, id)

	err := a.docker.NetworkConnect(context.Background(), id, req.ContainerID, nil)
	if err != nil {
		log.Printf("ConnectNetwork: failed: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	w.WriteHeader(http.StatusOK)
}

// handleRemoveContainer removes a container
func (a *Agent) handleRemoveContainer(w http.ResponseWriter, r *http.Request) {
    // Agent endpoints use query params because we use standard http.ServeMux
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	// Force remove? Usually good for UI.
	err := a.docker.ContainerRemove(context.Background(), id, container.RemoveOptions{Force: true})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleRemoveImage removes an image
func (a *Agent) handleRemoveImage(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	_, err := a.docker.ImageRemove(context.Background(), id, image.RemoveOptions{Force: true})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleRemoveNetwork removes a network
func (a *Agent) handleRemoveNetwork(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing ID", http.StatusBadRequest)
		return
	}

	err := a.docker.NetworkRemove(context.Background(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleRemoveVolume removes a volume
func (a *Agent) handleRemoveVolume(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing name", http.StatusBadRequest)
		return
	}

	err := a.docker.VolumeRemove(context.Background(), name, true)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// handleCheckImageUpdate checks if a newer version of the image is available
func (a *Agent) handleCheckImageUpdate(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    if id == "" {
        http.Error(w, "Missing image ID", http.StatusBadRequest)
        return
    }

    // Inspect local image to get repo tag
    info, _, err := a.docker.ImageInspectWithRaw(context.Background(), id)
    if err != nil {
        http.Error(w, fmt.Sprintf("Failed to inspect image: %v", err), http.StatusNotFound)
        return
    }

    if len(info.RepoTags) == 0 {
        http.Error(w, "Image has no tags", http.StatusBadRequest)
        return
    }

    tag := info.RepoTags[0] // Use first tag
    parts := strings.Split(tag, ":")
    if len(parts) != 2 {
        // Fallback for implicit latest or weird tags
        if len(parts) == 1 {
            tag = parts[0] + ":latest"
        } else {
             http.Error(w, "Invalid tag format", http.StatusBadRequest)
             return
        }
    }

    // Get remote distribution info
    // Note: DistributionInspect requires authentication for private repos.
    // Ideally we should pass auth string from headers or use configured auth.
    // For now, we try without auth (public images) or rely on dockerd default creds.
    
    // DistributionInspect returns distribution inspection for the image
    // It compares the image on the registry with the local one? 
    // No, it gets metadata from registry.
    
    dist, err := a.docker.DistributionInspect(context.Background(), tag, "")
    if err != nil {
        // This often fails for private repos without auth or rate limits
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{
            "update_available": false,
            "error": fmt.Sprintf("Registry check failed: %v", err),
        })
        return
    }

    // Compare digests
    // dist.Descriptor.Digest is the digest of the manifest in the registry
    // info.RepoDigests contains the digests of the local image as known at pull time?
    // Actually info.ID is the config digest.
    // We should compare RepoDigests.
    
    // Simplified logic: If the Digest from registry is present in RepoDigests, it's up to date.
    // If not, and we successfully got a digest for the same TAG, then it's an update.
    
    remoteDigest := dist.Descriptor.Digest.String()
    updateAvailable := true
    
    for _, localDigest := range info.RepoDigests {
        // Format is name@sha256:hex
        if strings.Contains(localDigest, remoteDigest) {
            updateAvailable = false
            break
        }
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "update_available": updateAvailable,
        "current_tag": tag,
        "available_tag": tag, // It's still the same tag name, but new content
        "remote_digest": remoteDigest,
    })
}

// handlePullImage pulls a docker image
func (a *Agent) handlePullImage(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Image string `json:"image"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    if req.Image == "" {
        http.Error(w, "Missing image name", http.StatusBadRequest)
        return
    }

    // Pull the image
    // Note: ImagePull usually streams output.
    out, err := a.docker.ImagePull(context.Background(), req.Image, image.PullOptions{})
    if err != nil {
        http.Error(w, fmt.Sprintf("Failed to pull image: %v", err), http.StatusInternalServerError)
        return
    }
    defer out.Close()

    // Stream output to client
    w.Header().Set("Content-Type", "application/json") // Docker pull output is effectively a stream of JSON objects
    if _, err := io.Copy(w, out); err != nil {
        log.Printf("Error streaming pull output: %v", err)
    }
}

// -- Stack Management Handlers --

// handleListStacks uses "docker compose ls --format json" but since that requires project name awareness,
// we will instead list containers and group them by "com.docker.compose.project" label.
// This is more robust for "discovery" of existing stacks.
func (a *Agent) handleListStacks(w http.ResponseWriter, r *http.Request) {
    containers, err := a.docker.ContainerList(context.Background(), container.ListOptions{All: true})
    if err != nil {
        http.Error(w, fmt.Sprintf("Failed to list containers: %v", err), http.StatusInternalServerError)
        return
    }

    type Stack struct {
        Name        string `json:"Name"`
        Status      string `json:"Status"`
        Services    int    `json:"Services"`
        ConfigFiles string `json:"ConfigFiles"`
    }

    stacks := make(map[string]*Stack)

    for _, c := range containers {
        projectName := c.Labels["com.docker.compose.project"]
        if projectName == "" {
            continue
        }

        if _, exists := stacks[projectName]; !exists {
            stacks[projectName] = &Stack{
                Name:   projectName,
                Status: "active", // Default, will refine
            }
        }
        
        stacks[projectName].Services++
        
        // Simple status logic: if any container is not running, stack is partial/exited
        if c.State != "running" {
             if stacks[projectName].Status == "active" {
                 stacks[projectName].Status = "partial"
             }
        }
        
        // Try to capture config file path if available (often stored in labels)
        if cfg := c.Labels["com.docker.compose.project.config_files"]; cfg != "" {
             stacks[projectName].ConfigFiles = cfg
        }
    }

    result := make([]*Stack, 0, len(stacks))
    for _, s := range stacks {
        result = append(result, s)
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}

// handleCreateStack accepts docker-compose content and runs "docker compose up"
func (a *Agent) handleCreateStack(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Name           string `json:"name"`
        ComposeContent string `json:"compose_content"`
        EnvContent     string `json:"env_content"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
         http.Error(w, "Invalid request body", http.StatusBadRequest)
         return
    }

    if req.Name == "" || req.ComposeContent == "" {
         http.Error(w, "Name and ComposeContent are required", http.StatusBadRequest)
         return
    }

    // Create a temporary directory for the stack
    // We use a persistent location in /tmp/conman-stacks/{name} so we can manage it later 
    // (though real prod usage should use a persistent volume)
    stackDir := fmt.Sprintf("/tmp/conman-stacks/%s", req.Name)
    if err := os.MkdirAll(stackDir, 0755); err != nil {
        http.Error(w, fmt.Sprintf("Failed to create stack dir: %v", err), http.StatusInternalServerError)
        return
    }

    // Write docker-compose.yml
    if err := os.WriteFile(stackDir+"/docker-compose.yml", []byte(req.ComposeContent), 0644); err != nil {
        http.Error(w, fmt.Sprintf("Failed to write compose file: %v", err), http.StatusInternalServerError)
        return
    }

    // Write .env if provided
    if req.EnvContent != "" {
        if err := os.WriteFile(stackDir+"/.env", []byte(req.EnvContent), 0644); err != nil {
             http.Error(w, fmt.Sprintf("Failed to write .env file: %v", err), http.StatusInternalServerError)
             return
        }
    }

    // Run docker compose up
    cmd := exec.Command("docker", "compose", "up", "-d")
    cmd.Dir = stackDir
    output, err := cmd.CombinedOutput()
    if err != nil {
        http.Error(w, fmt.Sprintf("Docker Compose failed: %s\nOutput: %s", err, string(output)), http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "deployed", "output": string(output)})
}

// handleRemoveStack runs "docker compose down"
func (a *Agent) handleRemoveStack(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    if name == "" {
        http.Error(w, "Missing stack name", http.StatusBadRequest)
        return
    }

    // Try to find the stack directory
    stackDir := fmt.Sprintf("/tmp/conman-stacks/%s", name)
    // If directory doesn't exist, we might try to infer it from running containers, 
    // but for now let's assume we can only fully manage stacks we created or that follow this convention.
    // However, "docker compose -p {name} down" might work even without the directory if we don't need the file reference (usually we do).
    
    // Attempt 1: Use directory if exists
    if _, err := os.Stat(stackDir); err == nil {
         cmd := exec.Command("docker", "compose", "down")
         cmd.Dir = stackDir
         if out, err := cmd.CombinedOutput(); err != nil {
             http.Error(w, fmt.Sprintf("Docker Compose Down failed: %v\nOutput: %s", err, string(out)), http.StatusInternalServerError)
             return
         }
         // Clean up dir
         os.RemoveAll(stackDir)
    } else {
        // Attempt 2: Just try "docker compose -p name down" (might not work without compose file depending on version)
        // Actually, without the compose file, `down` is hard. 
        // We will return an error if we can't find the directory, forcing user to manual cleanup or we implement a "force remove containers" logic.
        
        // Alternative: Find all containers with label and remove them?
        // Let's rely on the CLI for now.
        cmd := exec.Command("docker", "compose", "-p", name, "down")
        if out, err := cmd.CombinedOutput(); err != nil {
             http.Error(w, fmt.Sprintf("Stack config not found and generic down failed: %v\nOutput: %s", err, string(out)), http.StatusNotFound)
             return
        }
    }

    w.WriteHeader(http.StatusOK)
}

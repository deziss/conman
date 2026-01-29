package api

import (
    "conman-backend/internal/models"
    "conman-backend/internal/service"
    "context"
    "encoding/json"
    "io"
    "net/http"
    "strings"

    "github.com/docker/docker/api/types"
    "github.com/docker/docker/api/types/container"
    "github.com/docker/docker/pkg/stdcopy"
    "github.com/go-chi/chi/v5"
    "github.com/gorilla/websocket"
)

type ContainerHandler struct{}

func NewContainerHandler() *ContainerHandler {
    return &ContainerHandler{}
}

func (h *ContainerHandler) ListContainers(w http.ResponseWriter, r *http.Request) {
    cli := service.GetDockerClient()
    containers, err := cli.ContainerList(context.Background(), container.ListOptions{All: true})
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }

    var result []models.Container
    for _, cnt := range containers {
        name := ""
        if len(cnt.Names) > 0 {
            name = cnt.Names[0]
        }

        result = append(result, models.Container{
			ID:     cnt.ID,
			Name:   name,
			Status: cnt.Status,
			State:  cnt.State,
			Image:  cnt.Image,
        })
    }
    WriteJSON(w, http.StatusOK, result)
}

func (h *ContainerHandler) StartContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerStart(context.Background(), id, container.StartOptions{}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container started successfully"})
}

func (h *ContainerHandler) StopContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    timeout := 10 // seconds
    if err := cli.ContainerStop(context.Background(), id, container.StopOptions{Timeout: &timeout}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container stopped successfully"})
}

func (h *ContainerHandler) RemoveContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerRemove(context.Background(), id, container.RemoveOptions{Force: true}); err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container removed successfully"})
}

func (h *ContainerHandler) InspectContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    info, err := cli.ContainerInspect(context.Background(), id)
    if err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    
    WriteJSON(w, http.StatusOK, info)
}

func (h *ContainerHandler) PauseContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerPause(context.Background(), id); err != nil {
         if strings.Contains(err.Error(), "is not running") {
              ErrorJSON(w, http.StatusBadRequest, "Container is not running")
              return
         }
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container paused successfully"})
}

func (h *ContainerHandler) UnpauseContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    if err := cli.ContainerUnpause(context.Background(), id); err != nil {
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container unpaused successfully"})
}

func (h *ContainerHandler) RestartContainer(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    cli := service.GetDockerClient()
    
    timeout := 10
    if err := cli.ContainerRestart(context.Background(), id, container.StopOptions{Timeout: &timeout}); err != nil {
         ErrorJSON(w, http.StatusInternalServerError, err.Error())
         return
    }
    WriteJSON(w, http.StatusOK, map[string]string{"message": "Container restarted successfully"})
}

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true
    },
}

func (h *ContainerHandler) StreamLogs(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return // Upgrade handles error response
    }
    defer ws.Close()

    cli := service.GetDockerClient()
    
    // Check connection first
    if _, err := cli.ContainerInspect(context.Background(), id); err != nil {
        ws.WriteJSON(map[string]string{"error": "Container not found"})
        return
    }

    options := container.LogsOptions{
        ShowStdout: true,
        ShowStderr: true,
        Follow:     true,
        Tail:       "100",
    }

    reader, err := cli.ContainerLogs(context.Background(), id, options)
    if err != nil {
        ws.WriteJSON(map[string]string{"error": err.Error()})
        return
    }
    defer reader.Close()

    wsWriter := &WSWriter{Conn: ws}
    _, _ = stdcopy.StdCopy(wsWriter, wsWriter, reader)
}

type WSWriter struct {
    Conn *websocket.Conn
}

func (w *WSWriter) Write(p []byte) (n int, err error) {
    // WriteMessage is blocking.
    err = w.Conn.WriteMessage(websocket.TextMessage, p)
    if err != nil {
        return 0, err
    }
    return len(p), nil
}

func (h *ContainerHandler) StreamStats(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer ws.Close()

    cli := service.GetDockerClient()
    
    if _, err := cli.ContainerInspect(context.Background(), id); err != nil {
        ws.WriteJSON(map[string]string{"error": "Container not found"})
        return
    }

    stats, err := cli.ContainerStats(context.Background(), id, true) // stream=true
    if err != nil {
        ws.WriteJSON(map[string]string{"error": err.Error()})
        return
    }
    defer stats.Body.Close()

    wsWriter := &WSWriter{Conn: ws}
    _, _ = io.Copy(wsWriter, stats.Body)
}

type ExecMessage struct {
    Type string `json:"type"` // "input", "resize"
    Data string `json:"data,omitempty"`
    Rows int    `json:"rows,omitempty"`
    Cols int    `json:"cols,omitempty"`
}

func (h *ContainerHandler) StreamExec(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")
    ws, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer ws.Close()

    cli := service.GetDockerClient()
    
    execConfig := types.ExecConfig{
        AttachStdin:  true,
        AttachStdout: true,
        AttachStderr: true,
        Tty:          true,
        Cmd:          []string{"/bin/sh"},
    }
    
    execIDResp, err := cli.ContainerExecCreate(context.Background(), id, execConfig)
    if err != nil {
        ws.WriteJSON(map[string]string{"error": err.Error()})
        return
    }
    
    attachConfig := types.ExecStartCheck{
        Tty: true,
    }
    resp, err := cli.ContainerExecAttach(context.Background(), execIDResp.ID, attachConfig)
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
            _ = cli.ContainerExecResize(context.Background(), execIDResp.ID, container.ResizeOptions{
                Height: uint(execMsg.Rows),
                Width:  uint(execMsg.Cols),
            })
        } else if execMsg.Type == "input" {
            _, _ = resp.Conn.Write([]byte(execMsg.Data))
        }
    }
}

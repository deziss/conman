package api

import (
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"encoding/json"
	"net/http"
    "strconv"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type StackHandler struct {
	DB             *gorm.DB
	ComposeService *service.ComposeService
}

func NewStackHandler(db *gorm.DB) *StackHandler {
	return &StackHandler{
		DB:             db,
		ComposeService: service.NewComposeService(),
	}
}

type CreateStackRequest struct {
	Name           string `json:"name"`
	ComposeContent string `json:"compose_content"`
	EnvContent     string `json:"env_content"`
}

func (h *StackHandler) ListStacks(w http.ResponseWriter, r *http.Request) {
    var stacks []models.Stack
    if err := h.DB.Find(&stacks).Error; err != nil {
        http.Error(w, "Failed to list stacks", http.StatusInternalServerError)
        return
    }
    
    // Update status for each? Or just rely on DB?
    // Start async status check maybe? simple for now.
    json.NewEncoder(w).Encode(stacks)
}

func (h *StackHandler) CreateStack(w http.ResponseWriter, r *http.Request) {
    var req CreateStackRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }

    stack := models.Stack{
        Name: req.Name,
        ComposeContent: req.ComposeContent,
        EnvContent: req.EnvContent,
        Status: "deploying",
    }

    if err := h.DB.Create(&stack).Error; err != nil {
        http.Error(w, "Failed to create stack record", http.StatusInternalServerError)
        return
    }

    // Async deploy
    go func() {
        err := h.ComposeService.Deploy(&stack)
        if err != nil {
            stack.Status = "error"
            stack.Message = err.Error()
        } else {
            stack.Status = "active"
            stack.Message = "Deployed successfully"
        }
        h.DB.Save(&stack)
    }()

    json.NewEncoder(w).Encode(stack)
}

func (h *StackHandler) StopStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    go func() {
        err := h.ComposeService.Down(&stack)
         if err != nil {
            stack.Status = "error"
            stack.Message = err.Error()
        } else {
            stack.Status = "stopped"
            stack.Message = "Stopped successfully"
        }
        h.DB.Save(&stack)
    }()

    w.WriteHeader(http.StatusOK)
    w.Write([]byte(`{"status":"stopping"}`))
}

func (h *StackHandler) DeleteStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    // Stop and Remove
    // Currently Down removes active resources.
    // What about files?
    
    // First Down
    h.ComposeService.Down(&stack)

    if err := h.DB.Delete(&stack).Error; err != nil {
        http.Error(w, "Failed to delete stack", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusOK)
}

func (h *StackHandler) GetStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }
    
    // Get containers
    containers, _ := h.ComposeService.GetContainers(&stack)
    
    // Return composite response
    resp := struct {
        models.Stack
        Containers []service.ContainerInfo `json:"containers"`
    }{
        Stack: stack,
        Containers: containers,
    }
    
    json.NewEncoder(w).Encode(resp)
}

func (h *StackHandler) UpdateStack(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, _ := strconv.Atoi(idStr)
    var stack models.Stack
    if err := h.DB.First(&stack, id).Error; err != nil {
        http.Error(w, "Stack not found", http.StatusNotFound)
        return
    }

    var req CreateStackRequest // Reusing create request structure for update
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
         http.Error(w, "Invalid request", http.StatusBadRequest)
         return
    }
    
    // Update DB fields
    stack.ComposeContent = req.ComposeContent
    if req.EnvContent != "" {
        stack.EnvContent = req.EnvContent
    }
    // Name change not supported for now as it implies dir change
    stack.Status = "updating"
    h.DB.Save(&stack)

    // Redeploy
    go func() {
        err := h.ComposeService.Deploy(&stack)
         if err != nil {
            stack.Status = "error"
            stack.Message = err.Error()
        } else {
            stack.Status = "active"
            stack.Message = "Updated successfully"
        }
        h.DB.Save(&stack)
    }()
    
    json.NewEncoder(w).Encode(stack)
}

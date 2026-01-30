package api

import (
    "conman-backend/internal/models"
    "net/http"
    "github.com/go-chi/chi/v5"
    "gorm.io/gorm"
    "strconv"
)

type EnvironmentHandler struct {
    db *gorm.DB
}

func NewEnvironmentHandler(db *gorm.DB) *EnvironmentHandler {
    return &EnvironmentHandler{db: db}
}

func (h *EnvironmentHandler) ListEnvironments(w http.ResponseWriter, r *http.Request) {
    var envs []models.Environment
    if err := h.db.Find(&envs).Error; err != nil {
        ErrorJSON(w, http.StatusInternalServerError, err.Error())
        return
    }
    WriteJSON(w, http.StatusOK, envs)
}

func (h *EnvironmentHandler) CreateEnvironment(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Name      string `json:"name"`
        APIURL    string `json:"api_url"`
        AuthToken string `json:"auth_token"`
        IsLocal   bool   `json:"is_local"`
    }

    if err := ReadJSON(r, &req); err != nil {
        ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    env := models.Environment{
        Name:      req.Name,
        APIURL:    req.APIURL,
        AuthToken: req.AuthToken,
        IsLocal:   req.IsLocal,
    }

    if err := h.db.Create(&env).Error; err != nil {
        ErrorJSON(w, http.StatusInternalServerError, "Failed to create environment: " + err.Error())
        return
    }

    WriteJSON(w, http.StatusCreated, env)
}

func (h *EnvironmentHandler) DeleteEnvironment(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := strconv.Atoi(idStr)
    if err != nil {
        ErrorJSON(w, http.StatusBadRequest, "Invalid ID")
        return
    }

    if err := h.db.Delete(&models.Environment{}, id).Error; err != nil {
        ErrorJSON(w, http.StatusInternalServerError, "Failed to delete environment")
        return
    }

    WriteJSON(w, http.StatusOK, map[string]string{"message": "Environment deleted"})
}

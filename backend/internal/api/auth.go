package api

import (
	"conman-backend/internal/config"
	"conman-backend/internal/models"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthHandler struct {
	DB *gorm.DB
}

func NewAuthHandler(db *gorm.DB) *AuthHandler {
	return &AuthHandler{DB: db}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := ReadJSON(r, &req); err != nil {
		ErrorJSON(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var user models.User
	if err := h.DB.Where("email = ?", req.Username).First(&user).Error; err != nil {
		ErrorJSON(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		ErrorJSON(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"exp":   time.Now().Add(time.Minute * 30).Unix(),
	})

	tokenString, err := token.SignedString([]byte(config.AppConfig.SecretKey))
	if err != nil {
		ErrorJSON(w, http.StatusInternalServerError, "Could not generate token")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"access_token": tokenString,
		"token_type":   "bearer",
	})
}

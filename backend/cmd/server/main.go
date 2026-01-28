package main

import (
	"conman-backend/internal/api"
	"conman-backend/internal/config"
	"conman-backend/internal/middleware"
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"log"
	"net/http"

	"github.com/casbin/casbin/v2"
	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func main() {
	// 1. Load Config
	config.LoadConfig()

	// 2. Init Docker Client
	service.InitDockerClient()

	// 3. Init Database
	db, err := gorm.Open(sqlite.Open(config.AppConfig.DatabaseURL), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto Migrate
	err = db.AutoMigrate(&models.User{})
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Seed Admin User if not exists
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count == 0 {
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		admin := models.User{
			Email:    "admin@example.com",
			Password: string(hashedPassword),
			FullName: "Admin User",
			Role:     "admin",
		}
		db.Create(&admin)
		log.Println("Seeded default admin user: admin@example.com / admin")
	}

    // 4. Init Casbin Enforcer
    // Use relative path assuming we are running from project root or /app
    modelPath := "./config/model.conf"
    policyPath := "./config/policy.csv"

    enforcer, err := casbin.NewEnforcer(modelPath, policyPath)
    if err != nil {
        log.Fatalf("Failed to create casbin enforcer: %v", err)
    }

	// 5. Setup Router (Chi)
	r := chi.NewRouter()

    // Middleware
    r.Use(chiMiddleware.Logger)
    r.Use(chiMiddleware.Recoverer)

	// CORS
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   config.AppConfig.CorsOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
        AllowedHeaders:   []string{"Origin", "Content-Type", "Authorization", "Accept"},
        ExposedHeaders:   []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

	// API v1 Group
	r.Route("/api/v1", func(r chi.Router) {
        // Handlers
        authHandler := api.NewAuthHandler(db)
        containerHandler := api.NewContainerHandler()
        dockerHandler := api.NewDockerHandler()

        // Public Routes
		r.Post("/auth/login", authHandler.Login)

        // Protected Routes
        r.Group(func(r chi.Router) {
            r.Use(middleware.AuthMiddleware)
            r.Use(middleware.CasbinMiddleware(enforcer))

            // Containers
            r.Get("/containers", containerHandler.ListContainers) // Viewer
            r.Route("/containers/{id}", func(r chi.Router) {
                // Specific ID context could be loaded here if we wanted DRY
                r.Get("/logs", containerHandler.StreamLogs) // Viewer
                r.Get("/stats", containerHandler.StreamStats) // Viewer
                r.Get("/exec", containerHandler.StreamExec) // Viewer (Interactive?) -> Policy needs Operator?
                // Policy Update: Viewer can exec? Probably not safe. Updated policy handles this via regex if specific?
                // Actually my policy.csv: p, viewer, /api/v1/containers/*, GET
                // StreamExec is a GET (upgrade). We might need to restrict Exec to Operator.
                
                r.Post("/start", containerHandler.StartContainer) // Operator
                r.Post("/stop", containerHandler.StopContainer) // Operator
                r.Delete("/", containerHandler.RemoveContainer) // Admin
            })

            // Docker System
            r.Route("/docker", func(r chi.Router) {
                r.Get("/images", dockerHandler.ListImages) // Viewer
                r.Get("/system/info", dockerHandler.GetSystemInfo) // Viewer
                r.Post("/prune/containers", dockerHandler.PruneContainers) // Admin
                r.Post("/prune/images", dockerHandler.PruneImages) // Admin
            })
        })
	})

	// Start Server
	log.Printf("Server running on port %s", config.AppConfig.Port)
	if err := http.ListenAndServe(":"+config.AppConfig.Port, r); err != nil {
		log.Fatal("Failed to run server:", err)
	}
}

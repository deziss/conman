package main

import (
	"conman-backend/internal/api"
    "conman-backend/internal/authz"
	"conman-backend/internal/config"
	"conman-backend/internal/middleware"
	"conman-backend/internal/models"
	"conman-backend/internal/service"
	"log"
	"net/http"

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
	err = db.AutoMigrate(&models.User{}, &models.APIKey{})
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

    // 4. Init Casbin (Database Adapter)
    authz.InitCasbin(db)

	// 5. Setup Router (Chi)
	r := chi.NewRouter()

    // Middleware
    r.Use(chiMiddleware.Logger)
    r.Use(chiMiddleware.Recoverer)

	// CORS
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins:   config.AppConfig.CorsOrigins,
        AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
        AllowedHeaders:   []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Master-Key", "X-API-Key"},
        ExposedHeaders:   []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           300,
    }))

	// API v1 Group
	r.Route("/api/v1", func(r chi.Router) {
        // Handlers
        authHandler := api.NewAuthHandler(db)
        userHandler := api.NewUserHandler(db)
        containerHandler := api.NewContainerHandler()
        dockerHandler := api.NewDockerHandler()
        networkHandler := api.NewNetworkHandler()
        volumeHandler := api.NewVolumeHandler()
        
        // Middleware Instance
        mw := middleware.NewMiddleware(db)

        // Public Routes
		r.Post("/auth/login", authHandler.Login)

        // Protected Routes
        r.Group(func(r chi.Router) {
            r.Use(mw.AuthMiddleware)

            // User Management
            r.Route("/users", func(r chi.Router) {
                // Only Admin can list/create users
                r.Use(mw.RequirePermission("users", "write"))
                r.Get("/", userHandler.ListUsers)
                r.Post("/", userHandler.CreateUser)
            })

            // Profile / API Keys (Self Service)
            r.Route("/profile", func(r chi.Router) {
                // Any authenticated user should be able to manage their own keys?
                // Or maybe permissions? Let's say basic auth is enough for self-profile
                 r.Get("/keys", userHandler.ListAPIKeys)
                 r.Post("/keys", userHandler.GenerateAPIKey)
                 r.Delete("/keys/{id}", userHandler.RevokeAPIKey)
            })

            // Containers
            // Generic policy: obj=containers, act=read/write
            r.Get("/containers", containerHandler.ListContainers) // Check perm inside?
            
            // Or better: Route specific permissions
            r.Route("/containers", func(r chi.Router) {
                 r.Get("/", mw.RequirePermission("containers", "read")(http.HandlerFunc(containerHandler.ListContainers)).ServeHTTP)
            })

            r.Route("/containers/{id}", func(r chi.Router) {
                r.Use(mw.RequirePermission("containers", "read"))
                r.Get("/", containerHandler.InspectContainer)
                r.Get("/logs", containerHandler.StreamLogs)
                r.Get("/stats", containerHandler.StreamStats)

                r.Group(func(r chi.Router) {
                    r.Use(mw.RequirePermission("containers", "write"))
                    r.Get("/exec", containerHandler.StreamExec) 
                    r.Post("/start", containerHandler.StartContainer)
                    r.Post("/stop", containerHandler.StopContainer)
                    r.Post("/pause", containerHandler.PauseContainer)
                    r.Post("/unpause", containerHandler.UnpauseContainer)
                    r.Post("/restart", containerHandler.RestartContainer)
                    r.Delete("/", containerHandler.RemoveContainer)
                })
            })

            // Docker System
            r.Route("/docker", func(r chi.Router) {
                r.Use(mw.RequirePermission("images", "read"))
                r.Get("/images", dockerHandler.ListImages) 
                r.Get("/images/{id}", dockerHandler.InspectImage)
                r.Get("/system/info", dockerHandler.GetSystemInfo)

                r.Group(func(r chi.Router) {
                    r.Use(mw.RequirePermission("images", "write"))
                    r.Delete("/images/{id}", dockerHandler.RemoveImage)
                    r.Post("/images/pull", dockerHandler.PullImage)
                    r.Post("/prune/containers", dockerHandler.PruneContainers)
                    r.Post("/prune/images", dockerHandler.PruneImages)
                })
            })

            // Docker Networks
            r.Route("/docker/networks", func(r chi.Router) {
                r.Use(mw.RequirePermission("networks", "read"))
                r.Get("/", networkHandler.ListNetworks)
                
                r.Group(func(r chi.Router) {
                     r.Use(mw.RequirePermission("networks", "write"))
                     r.Post("/", networkHandler.CreateNetwork)
                     r.Delete("/{id}", networkHandler.RemoveNetwork)
                })
            })

            // Docker Volumes
            r.Route("/docker/volumes", func(r chi.Router) {
                 r.Use(mw.RequirePermission("volumes", "read"))
                 r.Get("/", volumeHandler.ListVolumes)
                 
                 r.Group(func(r chi.Router) {
                     r.Use(mw.RequirePermission("volumes", "write"))
                     r.Post("/", volumeHandler.CreateVolume)
                     r.Delete("/{name}", volumeHandler.RemoveVolume)
                     r.Post("/prune", volumeHandler.PruneVolumes)
                 })
            })
        })
	})

	// Start Server
	log.Printf("Server running on port %s", config.AppConfig.Port)
	if err := http.ListenAndServe(":"+config.AppConfig.Port, r); err != nil {
		log.Fatal("Failed to run server:", err)
	}
}

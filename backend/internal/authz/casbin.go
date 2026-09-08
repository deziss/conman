package authz

import (
	_ "embed"
	"log"

	"github.com/casbin/casbin/v3"
	"github.com/casbin/casbin/v3/model"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"gorm.io/gorm"
)

// modelConf is embedded at build time so the enforcer never depends on the
// process's current working directory. Previously this was loaded from the
// relative path "internal/authz/model.conf", which only resolved when the
// server binary happened to be launched with the repo root as cwd — it broke
// under `go test` (which cds into the package directory) and would have
// broken any packaged/installed binary run from a different directory.
//
//go:embed model.conf
var modelConf string

var Enforcer *casbin.Enforcer

func InitCasbin(db *gorm.DB) {
	adapter, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		log.Fatal("Failed to create casbin adapter:", err)
	}

	m, err := model.NewModelFromString(modelConf)
	if err != nil {
		log.Fatal("Failed to parse casbin model:", err)
	}

	enforcer, err := casbin.NewEnforcer(m, adapter)
	if err != nil {
		log.Fatal("Failed to create casbin enforcer:", err)
	}

	if err := enforcer.LoadPolicy(); err != nil {
		log.Fatal("Failed to load casbin policy:", err)
	}

	Enforcer = enforcer
    
    // Define default policies if empty (Optional, but good for bootstrapping)
    // admin has all permissions
    Enforcer.AddPolicy("admin", "*", "*")
    // viewer has read access to containers
    Enforcer.AddPolicy("viewer", "containers", "read")
    // operator has read/write access to containers
    Enforcer.AddPolicy("operator", "containers", "*")
    Enforcer.SavePolicy()
}

func CheckPermission(sub, obj, act string) (bool, error) {
	return Enforcer.Enforce(sub, obj, act)
}

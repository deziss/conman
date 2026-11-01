package stack

import (
	"fmt"
	"sort"
	"strings"

	"github.com/docker/docker/api/types"
	"gopkg.in/yaml.v3"
)

// IgnoredSystemEnvPrefixes lists environment variable prefixes or keys commonly set by default in containers.
var IgnoredSystemEnvPrefixes = map[string]bool{
	"PATH":     true,
	"HOSTNAME": true,
	"HOME":     true,
}

// ServiceConfig represents a minimal compose service for serialization.
type ServiceConfig struct {
	Image         string            `yaml:"image"`
	Command       []string          `yaml:"command,omitempty"`
	Restart       string            `yaml:"restart,omitempty"`
	Ports         []string          `yaml:"ports,omitempty"`
	Volumes       []string          `yaml:"volumes,omitempty"`
	Networks      []string          `yaml:"networks,omitempty"`
	EnvFile       []string          `yaml:"env_file,omitempty"`
	Environment   map[string]string `yaml:"environment,omitempty"`
	ContainerName string            `yaml:"container_name,omitempty"`
}

// ComposeFile represents the top-level docker-compose.yml structure.
type ComposeFile struct {
	Version  string                   `yaml:"version,omitempty"`
	Services map[string]ServiceConfig `yaml:"services"`
	Networks map[string]interface{}   `yaml:"networks,omitempty"`
	Volumes  map[string]interface{}   `yaml:"volumes,omitempty"`
}

// SynthesizeComposeFromInspect reverse-engineers a running container inspect JSON into a compose manifest and .env string.
func SynthesizeComposeFromInspect(serviceName string, c *types.ContainerJSON) (string, string, error) {
	if c == nil || c.Config == nil {
		return "", "", fmt.Errorf("invalid container inspect: missing config")
	}

	cleanServiceName := strings.TrimPrefix(serviceName, "/")
	if cleanServiceName == "" {
		cleanServiceName = "service"
	}

	// 1. Separate user environment variables into .env format
	var envLines []string
	if c.Config.Env != nil {
		for _, envEntry := range c.Config.Env {
			parts := strings.SplitN(envEntry, "=", 2)
			if len(parts) == 0 {
				continue
			}
			key := parts[0]
			val := ""
			if len(parts) > 1 {
				val = parts[1]
			}

			// Filter out default system envs
			if IgnoredSystemEnvPrefixes[key] {
				continue
			}

			envLines = append(envLines, fmt.Sprintf("%s=%s", key, val))
		}
	}
	sort.Strings(envLines)
	envContent := strings.Join(envLines, "\n")
	if len(envLines) > 0 {
		envContent += "\n"
	}

	// 2. Synthesize service definition
	svc := ServiceConfig{
		Image:   c.Config.Image,
		EnvFile: []string{".env"},
	}

	// Restart policy
	if c.HostConfig != nil && c.HostConfig.RestartPolicy.Name != "" {
		policy := string(c.HostConfig.RestartPolicy.Name)
		if c.HostConfig.RestartPolicy.MaximumRetryCount > 0 {
			policy = fmt.Sprintf("%s:%d", policy, c.HostConfig.RestartPolicy.MaximumRetryCount)
		}
		svc.Restart = policy
	}

	// Command
	if len(c.Config.Cmd) > 0 {
		svc.Command = c.Config.Cmd
	}

	// Port mappings
	if c.HostConfig != nil && c.HostConfig.PortBindings != nil {
		for portProto, bindings := range c.HostConfig.PortBindings {
			containerPort := portProto.Port()
			for _, b := range bindings {
				if b.HostPort != "" {
					mapping := fmt.Sprintf("%s:%s", b.HostPort, containerPort)
					if b.HostIP != "" && b.HostIP != "0.0.0.0" {
						mapping = fmt.Sprintf("%s:%s:%s", b.HostIP, b.HostPort, containerPort)
					}
					svc.Ports = append(svc.Ports, mapping)
				}
			}
		}
		sort.Strings(svc.Ports)
	}

	// Volume / Mount mappings
	var topVolumes map[string]interface{}
	for _, m := range c.Mounts {
		if m.Type == "volume" && m.Name != "" {
			mapping := fmt.Sprintf("%s:%s", m.Name, m.Destination)
			svc.Volumes = append(svc.Volumes, mapping)
			if topVolumes == nil {
				topVolumes = make(map[string]interface{})
			}
			topVolumes[m.Name] = map[string]interface{}{}
		} else if m.Type == "bind" && m.Source != "" {
			mapping := fmt.Sprintf("%s:%s", m.Source, m.Destination)
			if !m.RW {
				mapping += ":ro"
			}
			svc.Volumes = append(svc.Volumes, mapping)
		}
	}
	sort.Strings(svc.Volumes)

	// Networks
	var topNetworks map[string]interface{}
	if c.NetworkSettings != nil && c.NetworkSettings.Networks != nil {
		for netName := range c.NetworkSettings.Networks {
			if netName == "bridge" || netName == "host" || netName == "none" {
				continue
			}
			svc.Networks = append(svc.Networks, netName)
			if topNetworks == nil {
				topNetworks = make(map[string]interface{})
			}
			topNetworks[netName] = map[string]interface{}{"external": true}
		}
		sort.Strings(svc.Networks)
	}

	compose := ComposeFile{
		Services: map[string]ServiceConfig{
			cleanServiceName: svc,
		},
		Networks: topNetworks,
		Volumes:  topVolumes,
	}

	yamlBytes, err := yaml.Marshal(&compose)
	if err != nil {
		return "", "", fmt.Errorf("failed to marshal compose yaml: %w", err)
	}

	return string(yamlBytes), envContent, nil
}

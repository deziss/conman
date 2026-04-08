package runtime

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

// ValidateRootlessPort checks if a port can be bound in rootless Podman mode
// Rootless Podman cannot bind to ports < 1024 without special configuration
func (p *PodmanProvider) ValidateRootlessPort(ctx context.Context, port int) error {
	if p.useCLI {
		// In CLI mode, we assume rootless and validate
		if port < 1024 {
			return fmt.Errorf("rootless Podman cannot bind to port %d (requires root or sysctl net.ipv4.ip_unprivileged_port_start=0)", port)
		}
		return nil
	}

	// In API mode, check if we're running rootless
	info, err := p.Info(ctx)
	if err != nil {
		return fmt.Errorf("failed to check runtime info: %w", err)
	}

	// Check if the runtime version or info indicates rootless mode
	// This is a simplified check - in production, you'd parse the full info response
	if strings.Contains(info.OS, "rootless") || strings.Contains(info.Hostname, "rootless") {
		if port < 1024 {
			return fmt.Errorf("rootless Podman cannot bind to port %d", port)
		}
	}

	return nil
}

// ValidateComposePorts validates all port mappings in a compose config for rootless compatibility
func ValidateComposePorts(composeYAML string) error {
	lines := strings.Split(composeYAML, "\n")
	inPorts := false
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)

		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		if strings.HasSuffix(trimmed, "ports:") {
			inPorts = true
			continue
		}

		if inPorts {
			// Port entries start with "- ", stop when we hit a non-list line
			if !strings.HasPrefix(trimmed, "- ") {
				inPorts = false
				continue
			}

			// Parse "- "HOST:CONTAINER" or "- HOST:CONTAINER"
			portMapping := strings.TrimPrefix(trimmed, "- ")
			portMapping = strings.Trim(portMapping, "\"'")

			parts := strings.Split(portMapping, ":")
			if len(parts) >= 2 {
				hostPortStr := strings.TrimSpace(parts[0])
				if port, err := strconv.Atoi(hostPortStr); err == nil {
					if port < 1024 {
						return fmt.Errorf("port %d in compose file (line %d) requires root privileges in Podman", port, i+1)
					}
				}
			}
		}
	}
	return nil
}

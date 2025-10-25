import os
import docker

def get_docker_client():
    return docker.DockerClient(base_url=os.getenv("DOCKER_HOST", "unix://var/run/docker.sock"))
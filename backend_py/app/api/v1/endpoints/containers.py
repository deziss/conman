from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.auth import require_permissions
from app.core.database import get_db
from app.models.user import User
from app.api.v1.utils import get_docker_client
import docker

router = APIRouter()

@router.get("/", response_model=List[dict])
async def list_containers(
    current_user: User = Depends(require_permissions("viewer", "containers", "read")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        containers = client.containers.list(all=True)
        return [
            {
                "id": container.id,
                "name": container.name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else "none",
            }
            for container in containers
        ]
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{container_id}/start")
async def start_container(
    container_id: str,
    current_user: User = Depends(require_permissions("operator", "containers", "write")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        container = client.containers.get(container_id)
        container.start()
        return {"message": f"Container {container_id} started successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{container_id}/stop")
async def stop_container(
    container_id: str,
    current_user: User = Depends(require_permissions("operator", "containers", "write")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        container = client.containers.get(container_id)
        container.stop()
        return {"message": f"Container {container_id} stopped successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{container_id}")
async def remove_container(
    container_id: str,
    current_user: User = Depends(require_permissions("admin", "containers", "delete")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        container = client.containers.get(container_id)
        container.remove(force=True)
        return {"message": f"Container {container_id} removed successfully"}
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))
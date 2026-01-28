from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.auth import require_permissions
from app.core.database import get_db
from app.models.user import User
from app.api.v1.utils import get_docker_client
import docker

router = APIRouter()

@router.get("/images", response_model=List[dict])
async def list_images(
    current_user: User = Depends(require_permissions("viewer", "docker", "read")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        images = client.images.list()
        return [
            {
                "id": image.id,
                "tags": image.tags,
                "size": image.attrs["Size"],
                "created": image.attrs["Created"],
            }
            for image in images
        ]
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/prune/containers")
async def prune_containers(
    current_user: User = Depends(require_permissions("admin", "docker", "write")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        result = client.containers.prune()
        return {"message": "Containers pruned successfully", "details": result}
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/prune/images")
async def prune_images(
    current_user: User = Depends(require_permissions("admin", "docker", "write")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        result = client.images.prune()
        return {"message": "Images pruned successfully", "details": result}
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/system/info")
async def get_system_info(
    current_user: User = Depends(require_permissions("viewer", "docker", "read")),
    db: Session = Depends(get_db)
):
    try:
        client = get_docker_client()
        info = client.info()
        return {
            "containers": info["Containers"],
            "images": info["Images"],
            "docker_version": info["ServerVersion"],
            "memory_total": info["MemTotal"],
            "cpu_count": info["NCPU"]
        }
    except docker.errors.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))
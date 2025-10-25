from fastapi import APIRouter
from app.api.v1.endpoints import containers, users, docker

api_router = APIRouter()

api_router.include_router(containers.router, prefix="/containers", tags=["containers"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(docker.router, prefix="/docker", tags=["docker"])
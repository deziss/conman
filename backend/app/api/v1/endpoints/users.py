from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.auth import require_permissions, get_password_hash
from app.core.database import get_db
from app.models.user import User

router = APIRouter()

@router.get("/", response_model=List[dict])
async def list_users(
    current_user: User = Depends(require_permissions("admin", "users", "read")),
    db: Session = Depends(get_db)
):
    users = db.query(User).all()
    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "attributes": user.attributes
        }
        for user in users
    ]

@router.post("/")
async def create_user(
    username: str,
    email: str,
    password: str,
    role: str,
    attributes: dict,
    current_user: User = Depends(require_permissions("admin", "users", "write")),
    db: Session = Depends(get_db)
):
    db_user = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(password),
        role=role,
        attributes=attributes
    )
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
        return {"message": "User created successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_permissions("admin", "users", "delete")),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    try:
        db.commit()
        return {"message": "User deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
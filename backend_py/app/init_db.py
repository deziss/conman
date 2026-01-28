from app.core.database import Base, engine, SessionLocal
from app.models.user import User
from app.core.auth import get_password_hash

def init_db():
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Create a session
    db = SessionLocal()
    
    # Check if admin user exists
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        # Create default admin user
        admin_user = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin"),
            role="admin",
            attributes={"department": "operations"}
        )
        db.add(admin_user)
        db.commit()
        print("Created default admin user")
    else:
        print("Admin user already exists")

if __name__ == "__main__":
    print("Initializing database...")
    init_db()
    print("Database initialization completed")
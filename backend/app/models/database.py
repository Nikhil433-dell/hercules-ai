from sqlalchemy import create_engine, Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class Article(Base):
    __tablename__ = "articles"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(String)
    url = Column(String)
    source = Column(String)
    category = Column(String)

class UserPreference(Base):
    __tablename__ = "user_preferences"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    categories = Column(JSON)
    keywords = Column(JSON)

class ReadingHistory(Base):
    __tablename__ = "reading_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    article_id = Column(Integer, ForeignKey("articles.id"))

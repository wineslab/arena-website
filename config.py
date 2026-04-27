"""
config.py — Application configuration.
Reads DATABASE_URL from the environment (or a .env file via python-dotenv).
"""
import os
from dotenv import load_dotenv

# Load variables from .env if the file exists
load_dotenv()


class Config:
    # PostgreSQL connection string.
    # Override by setting DATABASE_URL in your environment or .env file.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', 'postgresql://localhost/arena'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

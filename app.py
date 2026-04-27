"""
app.py — Application entry point.

Creates the Flask app, registers blueprints, and initialises the database.
Run directly with: python3 app.py
"""
from flask import Flask
from config import Config
from models import db
from routes.api   import api_bp
from routes.views import views_bp


def create_app():
    """Flask application factory."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Bind SQLAlchemy to this app
    db.init_app(app)

    # Register blueprints
    app.register_blueprint(api_bp)    # /api/*
    app.register_blueprint(views_bp)  # /, /floorplan, /db

    # Create tables if they don't exist yet
    with app.app_context():
        db.create_all()

    return app


if __name__ == '__main__':
    app = create_app()
    print('Arena Antenna Mapper  →  http://localhost:8080')
    print('Database viewer       →  http://localhost:8080/db')
    print('Health check          →  http://localhost:8080/api/health')
    app.run(host='0.0.0.0', port=8080, debug=True)

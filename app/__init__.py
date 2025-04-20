from quart import Quart
from config.settings import APP_NAME, DEBUG
from config.logging import setup_logging
from app.routes.main import bp as main_bp


def create_app():
    """Создание и конфигурация приложения"""
    # Настраиваем логирование
    setup_logging()

    # Создаем приложение
    app = Quart(__name__)
    # В продакшене использовать безопасный ключ
    app.config['SECRET_KEY'] = 'dev'

    # Регистрируем маршруты
    app.register_blueprint(main_bp)

    return app

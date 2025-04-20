import os
import sys
import logging
from app import create_app
import asyncio

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s %(asctime)s - %(message)s'
)
logger = logging.getLogger(__name__)
    

def main():
    try:
        logger.info("Запуск приложения Telegram Post Viewer...")
        app = create_app()

        # Проверяем наличие сессии Telegram
        session_file = os.path.join(
            os.path.dirname(__file__), 'tele_session_local.session')
        if not os.path.exists(session_file):
            logger.warning(
                "Файл сессии Telegram не найден! Запустите скрипт auth.py сначала.")
        else:
            logger.info("Файл сессии Telegram найден.")

        # Настройка запуска
        host = os.environ.get('HOST', '0.0.0.0')
        port = int(os.environ.get('PORT', 5000))
        debug = os.environ.get('DEBUG', 'False').lower() == 'true'

        logger.info(
            f"Приложение будет доступно по адресу http://{host}:{port}")

        # Запуск приложения
        app.run(host=host, port=port, debug=debug)

    except Exception as e:
        logger.error(f"Ошибка при запуске приложения: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

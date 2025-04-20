import logging
import sys
from pathlib import Path
from config.settings import BASE_DIR


def setup_logging():
    """Настройка логирования приложения"""
    log_dir = BASE_DIR / "logs"
    log_dir.mkdir(exist_ok=True)

    log_file = log_dir / "app.log"

    # Основной формат лога
    log_format = '%(levelname)s %(asctime)s - %(message)s'
    date_format = '%Y-%m-%d %H:%M:%S'

    # Настройка корневого логгера
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)

    # Настройка форматтера
    formatter = logging.Formatter(log_format, date_format)

    # Консольный обработчик
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG)
    console_handler.setFormatter(formatter)

    # Файловый обработчик
    file_handler = logging.FileHandler(log_file, mode='a', encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    # Добавляем обработчики
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Настройка для библиотеки telethon
    telethon_logger = logging.getLogger('telethon')
    # Уменьшаем детализацию логов telethon
    telethon_logger.setLevel(logging.INFO)

    # Отключение логирования для asyncio и quart
    logging.getLogger('asyncio').setLevel(logging.WARNING)
    logging.getLogger('quart').setLevel(logging.INFO)

import os
from pathlib import Path
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# Корневая директория проекта
BASE_DIR = Path(__file__).resolve().parent.parent

# Путь к директории логов
LOG_DIR = BASE_DIR / 'logs'

# Пути к статическим файлам и шаблонам
STATIC_DIR = BASE_DIR / 'static'
TEMPLATES_DIR = BASE_DIR / 'app' / 'templates'

# Настройки приложения
APP_NAME = "Telegram Post Viewer"
HOST = os.getenv('HOST', '127.0.0.1')
PORT = int(os.getenv('PORT', 5000))
DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1', 't')

# Настройки Telegram API
API_ID = int(os.getenv('API_ID', 0))
API_HASH = os.getenv('API_HASH', '')
SESSION_PATH = os.getenv('SESSION_PATH', 'tele_session')
TELEGRAM_SESSION = BASE_DIR / SESSION_PATH

# Кеширование
CACHE_DIR = BASE_DIR / 'app' / 'cache'
CACHE_EXPIRY = 3600  # Время жизни кеша в секундах

# Максимальное время ожидания для запросов
REQUEST_TIMEOUT = 30  # секунд

# Временный каталог для сохранения медиафайлов
TEMP_DIR = BASE_DIR / 'temp'

# Папки для медиа
PHOTO_DIR = STATIC_DIR / "photos"
VIDEO_DIR = STATIC_DIR / "videos"

# Создаем необходимые директории
for directory in [PHOTO_DIR, VIDEO_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

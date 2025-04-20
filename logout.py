import logging
import asyncio
import os
from telethon import TelegramClient
from config.settings import API_ID, API_HASH, SESSION_PATH, TELEGRAM_SESSION

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s %(asctime)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def logout_session():
    """Разлогинивание из текущей сессии Telegram"""
    try:
        logger.info("Подключение к Telegram...")
        client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
        await client.connect()

        if not await client.is_user_authorized():
            logger.warning(
                "Сессия не авторизована, разлогинивание не требуется.")
            await client.disconnect()
            return False

        # Получаем информацию о текущей сессии
        me = await client.get_me()
        logger.info(
            f"Текущий пользователь: {me.first_name} {getattr(me, 'last_name', '')} (@{me.username})")

        # Выполняем разлогинивание
        logger.info("Выполняю разлогинивание из Telegram...")
        await client.log_out()

        # Проверка, существует ли файл сессии
        session_file = f"{SESSION_PATH}.session"
        if os.path.exists(session_file):
            logger.info(f"Удаляю файл сессии: {session_file}")
            os.remove(session_file)

        logger.info("Разлогинивание выполнено успешно!")
        return True

    except Exception as e:
        logger.error(f"Ошибка при разлогинивании: {e}")
        return False
    finally:
        try:
            await client.disconnect()
        except:
            pass


if __name__ == "__main__":
    try:
        logger.info("Запуск процесса разлогинивания сессии Telegram...")
        asyncio.run(logout_session())
    except KeyboardInterrupt:
        logger.info("Операция отменена пользователем.")
    except Exception as e:
        logger.error(f"Ошибка: {e}")

import logging
import asyncio
import os
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from config.settings import API_ID, API_HASH, SESSION_PATH, TELEGRAM_SESSION

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s %(asctime)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def login_to_telegram():
    """Авторизация в Telegram и сохранение сессии"""
    try:
        logger.info("Запуск процесса авторизации в Telegram...")
        client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
        await client.connect()

        # Проверяем, авторизован ли пользователь
        if await client.is_user_authorized():
            me = await client.get_me()
            logger.info(
                f"Вы уже авторизованы как: {me.first_name} {getattr(me, 'last_name', '')} (@{me.username})")
            return True

        # Запрос номера телефона
        phone = input(
            "Введите ваш номер телефона (в международном формате, например +79123456789): ")

        # Отправка кода подтверждения
        logger.info("Отправка кода подтверждения...")
        await client.send_code_request(phone)

        # Запрос кода подтверждения у пользователя
        code = input("Введите код подтверждения, отправленный в Telegram: ")

        try:
            # Вход с использованием кода подтверждения
            await client.sign_in(phone, code)
        except SessionPasswordNeededError:
            # Если включена двухфакторная аутентификация
            logger.info("Требуется пароль двухфакторной аутентификации.")
            password = input("Введите пароль двухфакторной аутентификации: ")
            await client.sign_in(password=password)

        # Получение информации о текущем пользователе
        me = await client.get_me()
        logger.info(
            f"Успешная авторизация как: {me.first_name} {getattr(me, 'last_name', '')} (@{me.username})")

        # Проверка создания файла сессии
        session_file = f"{SESSION_PATH}.session"
        if os.path.exists(session_file):
            logger.info(f"Файл сессии создан: {session_file}")
        else:
            logger.warning(
                f"Файл сессии не найден после авторизации: {session_file}")

        return True

    except Exception as e:
        logger.error(f"Ошибка при авторизации: {e}")
        return False
    finally:
        try:
            await client.disconnect()
        except:
            pass


if __name__ == "__main__":
    try:
        asyncio.run(login_to_telegram())
    except KeyboardInterrupt:
        logger.info("Операция отменена пользователем.")
    except Exception as e:
        logger.error(f"Ошибка: {e}")

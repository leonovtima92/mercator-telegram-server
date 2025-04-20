import logging
import base64
import os
import json
import re
import asyncio
from quart import Blueprint, request, render_template, Response, make_response, send_file, current_app
from app.services.telegram import telegram_service
from app.services.post import PostService
from app.services.archive import ArchiveService
from functools import wraps

logger = logging.getLogger(__name__)
bp = Blueprint('main', __name__)

# Определяем путь к директории кэша
MEDIA_CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'media_cache')


@bp.before_app_serving
async def startup():
    """Инициализация Telegram клиента и создание папки кэша"""
    # Создаем папку для кэша медиа, если ее нет
    if not os.path.exists(MEDIA_CACHE_DIR):
        try:
            os.makedirs(MEDIA_CACHE_DIR)
            logger.info(f"Создана директория для кэша медиа: {MEDIA_CACHE_DIR}")
        except OSError as e:
            logger.error(f"Не удалось создать директорию кэша {MEDIA_CACHE_DIR}: {e}")
            # Если не удалось создать папку, приложение не сможет кэшировать,
            # но может продолжить работу без кэширования (хотя это не идеально)
            pass # или raise e, если кэширование критично
    
    # Инициализация Telegram клиента
    try:
        await telegram_service.init()
        logger.info("Telegram клиент успешно инициализирован")
    except Exception as e:
        logger.error(f"Ошибка при инициализации Telegram клиента: {e}")
        raise


def no_cache(f):
    """Декоратор для отключения кэширования"""
    @wraps(f)
    async def decorated_function(*args, **kwargs):
        response = await f(*args, **kwargs)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response
    return decorated_function


# Глобальное отключение кеширования для всех маршрутов
@bp.after_request
async def add_no_cache_headers(response):
    """Отключаем кеширование для всех ответов"""
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@bp.route("/")
async def index():
    """Главная страница"""
    return await render_template("post.html")


@bp.route("/view_post")
async def view_post():
    """Страница просмотра поста"""
    url = request.args.get("url")
    if not url:
        logger.warning("Запрос на просмотр поста без URL")
        return await render_template("post.html", error="Не указана ссылка на пост")

    logger.info(f"Запрос на просмотр поста: {url}")

    try:
        data = await PostService.get_post(url)
        if not data.get("text"):
            logger.warning(f"Пост получен, но не содержит текста: {url}")
            data["text"] = "<p>Сообщение не содержит текста или не может быть отображено.</p>"

        # Получаем информацию о канале
        channel_entity = await telegram_service.get_channel_entity(data.get("chat"))
        if channel_entity:
            data["channel_info"] = {
                "title": getattr(channel_entity, "title", "Канал"),
                "username": getattr(channel_entity, "username", None),
                "photo": hasattr(channel_entity, "photo") and not isinstance(channel_entity.photo, type(None))
            }

        logger.info(f"Пост успешно получен: {url}")
        data["current_url"] = url
        return await render_template("post.html", **data)
    except ValueError as e:
        logger.warning(f"Ошибка значения при получении поста: {e}")
        return await render_template("post.html", error=f"Ошибка: {e}")
    except Exception as e:
        logger.exception(f"Ошибка при получении поста: {e}")
        return await render_template("post.html", error=f"Ошибка при получении поста: {e}")


def clean_filename(filename):
    """Очищает строку для использования в качестве имени файла/директории."""
    # Удаляем символы, недопустимые в большинстве ФС
    # Заменяем пробелы и другие разделители на подчеркивание
    cleaned = re.sub(r'[<>:"/\\|?*\s]+', '_', str(filename))
    # Удаляем начальные/конечные подчеркивания и точки
    cleaned = cleaned.strip('_. ')
    # Ограничиваем длину, чтобы избежать проблем с путями
    return cleaned[:100] if cleaned else "default"

def get_cache_paths(cache_type: str, identifier: str, sub_identifier: str = None, index: str = None):
    """Генерирует пути для кэша. cache_type: 'media' или 'channel_photo'. index используется только для media."""
    safe_identifier = clean_filename(identifier)
    
    if cache_type == 'media':
        if sub_identifier is None or index is None:
            logger.error("Для кэша 'media' требуются sub_identifier (msg_id) и index")
            return None, None
        cache_dir = os.path.join(MEDIA_CACHE_DIR, 'media', safe_identifier, str(sub_identifier))
        base_filename = str(index) # Имя файла - это index
    elif cache_type == 'channel_photo':
        cache_dir = os.path.join(MEDIA_CACHE_DIR, 'channel_photos')
        base_filename = safe_identifier # Имя файла - очищенный chat_id
    else:
        logger.error(f"Неизвестный тип кэша: {cache_type}")
        return None, None
        
    try:
        os.makedirs(cache_dir, exist_ok=True)
    except OSError as e:
        logger.error(f"Не удалось создать директорию кэша {cache_dir}: {e}")
        return None, None
        
    base_path = os.path.join(cache_dir, clean_filename(base_filename))
    data_path = f"{base_path}.cache"
    meta_path = f"{base_path}.meta"
    return data_path, meta_path

async def _write_to_cache(data_path: str, meta_path: str, file_bytes: bytes, metadata_dict: dict):
    """Асинхронно записывает данные и метаданные в файлы кэша."""
    if not (data_path and meta_path and file_bytes and metadata_dict):
        logger.error("Недостаточно данных для записи в кэш.")
        return
    try:
        # Запись файла данных
        with open(data_path, 'wb') as f:
            f.write(file_bytes)
        # Запись файла метаданных
        with open(meta_path, 'w') as f:
            json.dump(metadata_dict, f)
        logger.info(f"Данные успешно записаны в кэш: {data_path}")
    except Exception as e:
        logger.error(f"Ошибка асинхронной записи в кэш ({data_path}): {e}")
        # Попытка удалить частично созданные файлы кэша
        try:
            if os.path.exists(data_path):
                os.remove(data_path)
            if os.path.exists(meta_path):
                os.remove(meta_path)
        except Exception as remove_e:
            logger.error(f"Ошибка при удалении неполных файлов кэша: {remove_e}")

async def get_media_response(chat, msg_id, index):
    """Общая логика получения медиа с асинхронным кэшированием."""
    data_path, meta_path = get_cache_paths('media', chat, str(msg_id), str(index))
    
    if data_path and meta_path and os.path.exists(data_path) and os.path.exists(meta_path):
        # --- Обслуживание из кэша ---
        try:
            with open(meta_path, 'r') as f:
                meta_data = json.load(f)
            mime_type = meta_data.get('mime_type', 'application/octet-stream')
            logger.info(f"Отдаем медиа из кэша: {data_path}")
            return await send_file(data_path, mimetype=mime_type)
        except Exception as e:
            logger.error(f"Ошибка при чтении кэша медиа ({data_path}): {e}")
    
    logger.info(f"Кэш медиа не найден. Запрашиваем у Telegram: chat={chat}, msg_id={msg_id}, index={index}")
    try:
        media = await telegram_service.get_media(chat, msg_id, index)
        if not media or not media.get('file_bytes'):
            logger.warning(f"Медиа не найдено в Telegram: chat={chat}, msg_id={msg_id}, index={index}")
            return "Медиа не найдено", 404

        file_bytes = media['file_bytes']
        mime_type = media.get('mime_type', 'application/octet-stream')
        original_filename = media.get('filename', f'media_{index}')
        
        # --- Готовим ответ клиенту --- 
        resp = await make_response(file_bytes)
        resp.headers['Content-Type'] = mime_type
        
        # --- Запускаем запись в кэш в фоне --- 
        if data_path and meta_path:
            meta_to_save = { 'mime_type': mime_type, 'original_filename': original_filename }
            try:
                 # Используем run_in_executor для синхронных операций ввода-вывода в фоне
                 # current_app.add_background_task(_write_to_cache, data_path, meta_path, file_bytes, meta_to_save)
                 # Используем asyncio.create_task для прямого запуска асинхронной функции
                 asyncio.create_task(_write_to_cache(data_path, meta_path, file_bytes, meta_to_save))
                 logger.info(f"Запланирована запись в кэш для: {data_path}")
            except Exception as task_e:
                 logger.error(f"Ошибка при планировании фоновой задачи записи в кэш: {task_e}")

        return resp # Отдаем ответ, не дожидаясь записи

    except Exception as e:
        logger.error(f"Критическая ошибка при получении медиа: {e}", exc_info=True)
        return "Ошибка при получении медиа", 500


@bp.route('/media/<chat>/<int:msg_id>')
@no_cache
async def get_media(chat, msg_id):
    """Получение медиафайла (с кэшированием)"""
    try:
        index = request.args.get('index', '0')
        index = int(index) if index.isdigit() else 0
        logger.debug(f"Запрос медиафайла (основной): chat={chat}, msg_id={msg_id}, index={index}")
        return await get_media_response(chat, msg_id, index)
    except Exception as e:
        logger.error(f"Ошибка в роуте /media: {e}", exc_info=True)
        return "Внутренняя ошибка сервера", 500


@bp.route('/media/<chat>/<int:msg_id>/<int:index>')
@no_cache
async def get_media_by_index(chat, msg_id, index):
    """Получение медиафайла по индексу в URL (с кэшированием)"""
    try:
        logger.debug(f"Запрос медиафайла (по индексу): chat={chat}, msg_id={msg_id}, index={index}")
        return await get_media_response(chat, msg_id, index)
    except Exception as e:
        logger.error(f"Ошибка в роуте /media/.../index: {e}", exc_info=True)
        return "Внутренняя ошибка сервера", 500


@bp.route('/media/<chat>/<int:msg_id>/check')
@no_cache
async def check_media_availability(chat, msg_id):
    """Проверка доступности медиа"""
    try:
        logger.debug(
            f"Проверка доступности медиа: chat={chat}, msg_id={msg_id}")
        message = await telegram_service.get_message(chat, msg_id)

        if not message or not hasattr(message, 'media') or not message.media:
            logger.warning(
                f"Медиа не найдено при проверке: chat={chat}, msg_id={msg_id}")
            return await make_response({"available": False, "reason": "Media not found"}, 200)

        return await make_response({"available": True}, 200)
    except Exception as e:
        logger.error(
            f"Ошибка при проверке доступности медиа: {e}", exc_info=True)
        return await make_response({"available": False, "reason": str(e)}, 200)


@bp.route('/direct_media/<chat>/<int:msg_id>/<int:index>')
@no_cache
async def get_direct_media_url(chat, msg_id, index):
    """Получение прямой ссылки на медиа"""
    try:
        logger.debug(
            f"Запрос прямой ссылки на медиа: chat={chat}, msg_id={msg_id}, index={index}")

        # Получаем сообщение для анализа
        message = await telegram_service.get_message(chat, msg_id)

        if not message or not hasattr(message, 'media') or not message.media:
            logger.warning(
                f"Медиа не найдено для прямой ссылки: chat={chat}, msg_id={msg_id}, index={index}")
            return await make_response({"success": False, "reason": "Media not found"}, 404)

        # Здесь бы получить прямую ссылку на медиа, но Telegram API не всегда это позволяет
        # Поэтому возвращаем информацию, что нужно использовать обычный маршрут
        return await make_response({
            "success": True,
            "url": f"/media/{chat}/{msg_id}/{index}",
            "mime_type": message.media.document.mime_type if hasattr(message.media, 'document') and hasattr(message.media.document, 'mime_type') else "application/octet-stream",
            "filename": getattr(message.file.name, 'name', f"media_{index}.file") if hasattr(message, 'file') and hasattr(message.file, 'name') else f"media_{index}.file"
        }, 200)
    except Exception as e:
        logger.error(
            f"Ошибка при получении прямой ссылки на медиа: {e}", exc_info=True)
        return await make_response({"success": False, "reason": str(e)}, 500)


@bp.route('/channel_photo/<chat>')
@no_cache
async def get_channel_photo(chat):
    """Получение фотографии канала (с асинхронным кэшированием)"""
    data_path, meta_path = get_cache_paths('channel_photo', chat)
    
    if data_path and meta_path and os.path.exists(data_path) and os.path.exists(meta_path):
        # --- Обслуживание из кэша ---
        try:
            with open(meta_path, 'r') as f:
                meta_data = json.load(f)
            mime_type = meta_data.get('mime_type', 'image/jpeg')
            logger.info(f"Отдаем фото канала из кэша: {data_path}")
            return await send_file(data_path, mimetype=mime_type)
        except Exception as e:
            logger.error(f"Ошибка при чтении кэша фото канала ({data_path}): {e}")
            
    # --- Если кэша нет или ошибка чтения ---
    logger.info(f"Кэш фото канала не найден. Запрашиваем у Telegram: chat={chat}")
    try:
        photo_data = await telegram_service.get_channel_photo(chat)
        if not photo_data or not photo_data.get('file_bytes'):
            logger.warning(f"Фото канала не найдено в Telegram: chat={chat}")
            return "Фото канала не найдено", 404

        file_bytes = photo_data['file_bytes']
        mime_type = photo_data.get('mime_type', 'image/jpeg')
        
        # --- Готовим ответ клиенту --- 
        resp = await make_response(file_bytes)
        resp.headers['Content-Type'] = mime_type
        
        # --- Запускаем запись в кэш в фоне --- 
        if data_path and meta_path:
            meta_to_save = { 'mime_type': mime_type }
            try:
                # Используем asyncio.create_task для прямого запуска асинхронной функции
                asyncio.create_task(_write_to_cache(data_path, meta_path, file_bytes, meta_to_save))
                logger.info(f"Запланирована запись в кэш для фото канала: {data_path}")
            except Exception as task_e:
                 logger.error(f"Ошибка при планировании фоновой задачи записи фото канала в кэш: {task_e}")

        return resp # Отдаем ответ, не дожидаясь записи

    except Exception as e:
        logger.error(f"Критическая ошибка при получении фото канала: {e}", exc_info=True)
        return "Ошибка при получении фото канала", 500


@bp.route("/save_archive", methods=["POST"])
async def save_archive():
    """Сохранение архива с постом"""
    try:
        data = await request.get_json()
        # screenshot_b64 = data.get("screenshot") # <-- УДАЛЕНО
        text_screenshot_b64 = data.get("text_screenshot")
        highlighted_text_screenshot_b64 = data.get("highlighted_text_screenshot") # <-- ПОЛУЧАЕМ НОВЫЙ СКРИНШОТ
        chat = data.get("chat")
        msg_id_str = data.get("msg_id")
        media_settings = data.get("media_settings", {})
        media_block_width = data.get("media_block_width", "N/A")
        media_block_height = data.get("media_block_height", "N/A")
        highlights_data = data.get("highlights", [])

        # Обновленная проверка: обязательны только chat и msg_id
        if not (chat and msg_id_str):
            logger.warning(
                f"Некорректные данные для архива: chat={chat}, msg_id={msg_id_str}")
            return "Некорректные данные: отсутствуют chat или msg_id", 400

        try:
            msg_id = int(msg_id_str)
        except ValueError:
            logger.warning(f"Некорректный msg_id получен от клиента: {msg_id_str}")
            return "Некорректный msg_id", 400

        logger.info(
            f"Получены данные для архива: chat={chat}, msg_id={msg_id} (исходная строка: {msg_id_str})"
        )
        logger.info(f"Текстовый скриншот получен: {bool(text_screenshot_b64)}")
        logger.info(f"Текстовый скриншот с выделением получен: {bool(highlighted_text_screenshot_b64)}") # <-- ЛОГ ДЛЯ НОВОГО СКРИНШОТА
        logger.info(f"Настройки медиа получены: {bool(media_settings)}")
        logger.info(f"Размеры медиа-блока: {media_block_width}x{media_block_height}")
        logger.info(f"Получено данных о выделениях: {len(highlights_data)} шт.")

        try:
            # screenshot_bytes = base64.b64decode(screenshot_b64) # <-- УДАЛЕНО
            text_screenshot_bytes = base64.b64decode(text_screenshot_b64) if text_screenshot_b64 else None
            highlighted_text_screenshot_bytes = base64.b64decode(highlighted_text_screenshot_b64) if highlighted_text_screenshot_b64 else None # <-- ДЕКОДИРУЕМ НОВЫЙ СКРИНШОТ

            # Обновленный вызов ArchiveService.create_archive с правильными аргументами
            archive_bytes = await ArchiveService.create_archive(
                None, # screenshot_bytes (всегда None)
                text_screenshot_bytes,
                highlighted_text_screenshot_bytes, # <-- ПЕРЕДАЕМ НОВЫЙ СКРИНШОТ
                chat,
                msg_id,
                media_settings,
                media_block_width,
                media_block_height,
                highlights_data # <-- highlights_data теперь на своем месте
            )

            logger.info(
                f"Архив успешно создан, размер={len(archive_bytes)} байт")

            # Формируем имя файла с chat_id и msg_id
            archive_filename = f"telegram_post_{clean_filename(chat)}_{msg_id}.zip"

            return Response(
                archive_bytes,
                mimetype="application/zip",
                headers={"Content-Disposition": f"attachment; filename=\"{archive_filename}\""}
            )
        except Exception as e:
            logger.exception(f"Ошибка при создании архива: {e}")
            return f"Ошибка при обработке данных архива: {e}", 500
    except Exception as e:
        logger.exception(f"Критическая ошибка при создании архива: {e}")
        return f"Ошибка при создании архива: {e}", 500

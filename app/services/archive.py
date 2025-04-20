import logging
import os
import zipfile
import tempfile
import io
import json
from typing import Optional, Dict, Any, List
from app.services.telegram import telegram_service
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)


class ArchiveService:
    @staticmethod
    async def create_archive(
        screenshot_bytes: Optional[bytes],
        text_screenshot_bytes: Optional[bytes],
        highlighted_text_screenshot_bytes: Optional[bytes],
        chat: str,
        msg_id: int,
        media_settings: Dict[str, Dict[str, Any]],
        media_block_width: Any, # Принимаем размеры блока
        media_block_height: Any,
        highlights_data: List[Dict[str, Any]] # Принимаем новую структуру
    ) -> bytes:
        """
        Создает ZIP-архив, содержащий:
        - [ОПЦИОНАЛЬНО] post.png — скриншот всей страницы
        - [ОПЦИОНАЛЬНО] text.png — скриншот текстового блока
        - [ОПЦИОНАЛЬНО] text_highlight.png — скриншот текстового блока с выделением
        - [ОПЦИОНАЛЬНО] channel_logo.jpg — логотип канала
        - папку media со всеми медиа-файлами
        - metadata.json - метаданные (настройки медиа, размеры блоков, выделения с координатами строк)
        """
        media_files_metadata = [] # Список для метаданных медиа
        processed_indices = set()
        text_screenshot_dims = None # Для размеров скриншота текста

        with tempfile.TemporaryDirectory() as tmpdir:
            post_image_path = os.path.join(tmpdir, "post.png")
            # Сохраняем скриншот страницы, ТОЛЬКО если он есть
            if screenshot_bytes:
                try:
                    with open(post_image_path, "wb") as f:
                        f.write(screenshot_bytes)
                    logger.debug("Скриншот страницы сохранен: %s", post_image_path)
                except Exception as e:
                    logger.error(f"Ошибка при сохранении скриншота страницы: {e}")
                    post_image_path = None # Помечаем, что файла нет
            else:
                logger.info("Скриншот страницы (post.png) не был предоставлен, не сохраняем.")
                post_image_path = None # Файла нет

            # Сохраняем скриншот текстового блока и получаем его размеры
            text_image_path = os.path.join(tmpdir, "text.png")
            if text_screenshot_bytes:
                try:
                    with open(text_image_path, "wb") as f:
                        f.write(text_screenshot_bytes)
                    logger.debug("Скриншот текстового блока сохранен: %s", text_image_path)
                    # Получаем размеры text.png
                    with Image.open(text_image_path) as img:
                        text_screenshot_dims = { "width": img.width, "height": img.height }
                        logger.debug(f"Размеры скриншота текста: {text_screenshot_dims}")
                except Exception as e:
                    logger.error(f"Ошибка при сохранении или получении размеров скриншота текста: {e}")
                    text_image_path = None # Не удалось сохранить или обработать
            else:
                logger.info("Скриншот текстового блока (text.png) не был предоставлен, не сохраняем.")
                text_image_path = None

            # Сохраняем скриншот текстового блока с выделением
            text_highlight_image_path = os.path.join(tmpdir, "text_highlight.png")
            if highlighted_text_screenshot_bytes:
                try:
                    with open(text_highlight_image_path, "wb") as f:
                        f.write(highlighted_text_screenshot_bytes)
                    logger.debug("Скриншот текста с выделением сохранен: %s", text_highlight_image_path)
                except Exception as e:
                    logger.error(f"Ошибка при сохранении скриншота текста с выделением: {e}")
                    text_highlight_image_path = None # Помечаем, что файла нет
            else:
                logger.info("Скриншот текста с выделением (text_highlight.png) не был предоставлен, не сохраняем.")
                text_highlight_image_path = None

            # Получаем и сохраняем логотип канала
            channel_logo_path = None # Инициализируем как None
            try:
                channel_photo = await telegram_service.get_channel_photo(chat)
                if channel_photo and channel_photo.get('file_bytes'):
                    channel_logo_path = os.path.join(tmpdir, "channel_logo.jpg") # Присваиваем путь только если есть данные
                    with open(channel_logo_path, "wb") as f:
                        f.write(channel_photo['file_bytes'])
                    logger.debug("Логотип канала сохранен: %s", channel_logo_path)
                else:
                    logger.debug("Логотип канала не найден")
                    # channel_logo_path уже None
            except Exception as e:
                logger.exception(f"Ошибка при получении логотипа канала: {e}")
                channel_logo_path = None # Убедимся, что None при ошибке

            # Создаем папку для медиа
            media_dir = os.path.join(tmpdir, "media")
            os.makedirs(media_dir, exist_ok=True)
            logger.debug("Папка для медиа создана: %s", media_dir)

            # Скачиваем все медиа и собираем их метаданные
            media_files = []
            try:
                media_files = await telegram_service.get_messages_with_media(chat, msg_id)
                logger.debug(f"Получено {len(media_files)} медиа-файлов для архивации")
                
                for i, media_item in enumerate(media_files):
                    if media_item and media_item.get("file_bytes"):
                        original_filename = media_item.get("filename", f"media_{i}")
                        mime_type = media_item.get("mime_type", "application/octet-stream")
                        safe_filename_base = "".join(c for c in os.path.splitext(original_filename)[0] if c.isalnum() or c in "._- ")
                        ext = os.path.splitext(original_filename)[1] if os.path.splitext(original_filename)[1] else (
                            mime_type.split("/")[1] if "/" in mime_type and mime_type.split("/")[1] else "bin"
                        )
                        if not safe_filename_base:
                            safe_filename_base = f"media_{i}"
                        counter = 1
                        save_filename = f"{safe_filename_base}{ext}"
                        while os.path.exists(os.path.join(media_dir, save_filename)):
                            save_filename = f"{safe_filename_base}_{counter}{ext}"
                            counter += 1
                        media_path = os.path.join(media_dir, save_filename)
                        try:
                            with open(media_path, "wb") as f:
                                f.write(media_item["file_bytes"])
                            logger.debug(f"Медиа #{i} сохранено: {media_path} (исходное имя: {original_filename})")
                        except Exception as write_err:
                           logger.error(f"Ошибка при записи медиафайла {save_filename}: {write_err}")
                           continue
                        settings_key = str(i)
                        current_settings = media_settings.get(settings_key, {})
                        zoom = current_settings.get('zoom', 1)
                        pos_x = current_settings.get('positionX', 0)
                        pos_y = current_settings.get('positionY', 0)
                        logger.debug(f"Настройки для медиа #{i} ({save_filename}): zoom={zoom}, posX={pos_x}, posY={pos_y}")
                        media_files_metadata.append({
                            'filename': save_filename,
                            'zoom': zoom,
                            'positionX': pos_x,
                            'positionY': pos_y
                        })
                        processed_indices.add(settings_key)
            except Exception as e:
                logger.exception(f"Ошибка при скачивании и обработке медиа: {e}")

            # Добавляем метаданные для "пропущенных" медиа (если были в настройках)
            for settings_key, settings in media_settings.items():
                if settings_key not in processed_indices:
                    original_filename = settings.get("originalFilename", f"unknown_media_{settings_key}")
                    logger.warning(f"Медиа с индексом {settings_key} ({original_filename}) было в настройках, но не было скачано.")
                    media_files_metadata.append({
                        'filename': f"MISSING_{original_filename}",
                        'zoom': settings.get('zoom', 1),
                        'positionX': settings.get('positionX', 0),
                        'positionY': settings.get('positionY', 0)
                    })

            # --- Создаем финальный словарь метаданных --- 
            final_metadata = {
                "media_block_dimensions": {
                    "width": media_block_width,
                    "height": media_block_height
                },
                "text_screenshot_dimensions": text_screenshot_dims, # Будет null, если скриншота нет
                "media_files": media_files_metadata,
                "highlights": highlights_data # Используем полученную структуру
            }

            # Создаем ZIP-архив
            archive_path = os.path.join(tmpdir, "archive.zip")
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                # Добавляем скриншоты и лого, ТОЛЬКО если они существуют
                if post_image_path and os.path.exists(post_image_path):
                    zipf.write(post_image_path, arcname="post.png")
                    logger.debug("post.png добавлен в архив.")
                else:
                    logger.debug("post.png не существует или не был создан, не добавляем в архив.")

                if text_image_path and os.path.exists(text_image_path):
                    zipf.write(text_image_path, arcname="text.png")
                    logger.debug("text.png добавлен в архив.")
                else:
                    logger.debug("text.png не существует или не был создан, не добавляем в архив.")
                    
                # Добавляем скриншот текста с выделением
                if text_highlight_image_path and os.path.exists(text_highlight_image_path):
                    zipf.write(text_highlight_image_path, arcname="text_highlight.png")
                    logger.debug("text_highlight.png добавлен в архив.")
                else:
                    logger.debug("text_highlight.png не существует или не был создан, не добавляем в архив.")

                # Проверяем channel_logo_path перед добавлением
                if channel_logo_path and os.path.exists(channel_logo_path):
                    zipf.write(channel_logo_path, arcname="channel_logo.jpg")
                    logger.debug("channel_logo.jpg добавлен в архив.")
                else:
                     logger.debug("Логотип канала не существует или не был получен, не добавляем в архив.")


                # Добавляем медиа файлы из папки media
                if os.path.exists(media_dir):
                    for root, dirs, files in os.walk(media_dir):
                        for file in files:
                            full_path = os.path.join(root, file)
                            arcname = os.path.join("media", file)
                            zipf.write(full_path, arcname=arcname)
                    logger.debug("Медиа файлы добавлены в архив.")
                else:
                    logger.debug("Папка media не существует, медиа файлы не добавлены.")

                # Создаем и добавляем metadata.json
                try:
                    json_data = json.dumps(final_metadata, indent=4, ensure_ascii=False)
                    zipf.writestr("metadata.json", json_data)
                    logger.debug("Файл metadata.json успешно добавлен в архив")
                except Exception as json_err:
                    logger.error(f"Ошибка при создании metadata.json: {json_err}")
                        
            logger.info("ZIP архив успешно создан: %s", archive_path)

            with open(archive_path, "rb") as f:
                archive_bytes = f.read()
            return archive_bytes

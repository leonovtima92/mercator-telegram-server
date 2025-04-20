import re
import logging
import json
from typing import Dict, Tuple, Any
from app.services.telegram import telegram_service
from app.utils.formatters import MessageFormatter

logger = logging.getLogger(__name__)


class PostService:
    @staticmethod
    def parse_url(url: str) -> Tuple[str, int]:
        """Парсит URL поста Telegram"""
        pattern = r'https?://t\.me/([^/]+)/(\d+)'
        match = re.match(pattern, url)
        if not match:
            raise ValueError("Неверный формат ссылки Telegram")
        chat = match.group(1)
        msg_id = int(match.group(2))
        return chat, msg_id

    @staticmethod
    def build_post_html(message: Any, chat: str, msg_id: int) -> Tuple[str, str]:
        """Создает HTML для отображения поста"""
        logger.debug("Начало build_post_html")

        # Подробная диагностика сообщения
        try:
            # Получаем все атрибуты сообщения для анализа
            message_attrs = {attr: getattr(message, attr) for attr in dir(message)
                             if not attr.startswith('_') and not callable(getattr(message, attr))}

            # Логируем важные атрибуты для диагностики
            important_attrs = ['id', 'message',
                               'date', 'media', 'photo', 'document']
            log_attrs = {k: message_attrs.get(
                k) for k in important_attrs if k in message_attrs}
            logger.debug(
                f"Атрибуты сообщения: {json.dumps(str(log_attrs), ensure_ascii=False)}")
        except Exception as e:
            logger.warning(f"Не удалось получить атрибуты сообщения: {e}")

        if not message:
            logger.error("Сообщение не найдено или пустое")
            return "<p>Сообщение не найдено или пустое</p>", "top"

        try:
            # Проверка на наличие текста
            raw_text = getattr(message, 'message', None)
            caption = getattr(message, 'caption', None)

            # Используем caption как резервный вариант, если message пусто
            text_content = raw_text if raw_text else caption

            logger.debug(f"Текст сообщения: {text_content}")
            logger.debug(f"Наличие caption: {bool(caption)}")

            if not text_content:
                logger.warning("Сообщение не содержит текста")
                # Создаем базовый HTML даже если нет текста
                text_html = "<p>Сообщение не содержит текста</p>"
            else:
                # Получаем entities либо из message_entities, либо из entities
                entities = (
                    getattr(message, 'entities', None) or
                    getattr(message, 'message_entities', None) or
                    getattr(message, 'caption_entities', None)
                )

                logger.debug(f"Наличие entities: {bool(entities)}")
                text_html = MessageFormatter.message_to_html(
                    message, text_content, entities)

            # Проверка на наличие медиа
            has_media = False

            # Проверяем все возможные типы медиа
            media_attrs = ['photo', 'document', 'video', 'media']
            for attr in media_attrs:
                if hasattr(message, attr) and getattr(message, attr):
                    has_media = True
                    logger.debug(f"Обнаружено медиа типа: {attr}")
                    break

            # Проверка на медиа в message.media
            if hasattr(message, 'media') and message.media:
                media_type = type(message.media).__name__
                logger.debug(f"Тип медиа в message.media: {media_type}")
                has_media = True

            layout = "left" if has_media else "top"
            logger.debug(
                f"Выбран layout: {layout}, наличие медиа: {has_media}")

            return text_html, layout
        except Exception as e:
            logger.exception(f"Ошибка при форматировании сообщения: {e}")
            return f"<p>Ошибка при обработке текста сообщения: {e}</p>", "top"

    @classmethod
    async def get_post(cls, url: str) -> Dict[str, Any]:
        """Получает пост по URL"""
        logger.debug(f"get_post вызван с URL: {url}")

        try:
            chat, msg_id = cls.parse_url(url)
            logger.debug(f"Извлечены chat: {chat}, msg_id: {msg_id}")

            message = await telegram_service.get_message(chat, msg_id)
            if not message:
                logger.error(f"Сообщение не найдено: {chat}/{msg_id}")
                raise ValueError("Сообщение не найдено")

            logger.debug(f"Получено сообщение с ID: {msg_id}")

            # Диагностика типа сообщения
            logger.debug(f"Тип сообщения: {type(message).__name__}")

            full_html, layout = cls.build_post_html(message, chat, msg_id)

            # Получаем список медиафайлов
            media_list = await telegram_service.get_messages_with_media(chat, msg_id)
            logger.debug(
                f"Получен список медиафайлов: {len(media_list) if media_list else 0} файлов")

            # Преобразуем список медиафайлов в формат, который можно сериализовать в JSON
            # Не включаем байтовые данные, только метаданные
            media_info = []
            for i, media in enumerate(media_list):
                # Определяем тип медиа по MIME-типу
                mime_type = media.get('mime_type', 'unknown')
                media_type = "document"  # По умолчанию считаем документом

                if mime_type.startswith('image/'):
                    media_type = "photo"
                elif mime_type.startswith('video/'):
                    media_type = "video"

                media_info.append({
                    'index': i,
                    'type': media_type,
                    'mime_type': mime_type,
                    'size': len(media.get('file_bytes', b'')) if media.get('file_bytes') else 0,
                    'id': i,  # Добавляем id для совместимости с JavaScript-кодом
                    'filename': f"media_{i}.{media_type.split('/')[0] if '/' in media_type else media_type}"
                })

                logger.debug(
                    f"Добавлен медиафайл #{i}, тип: {media_type}, MIME: {mime_type}")

            # Определяем тип медиа с расширенной логикой
            media_type = "none"

            if hasattr(message, 'photo') and message.photo:
                media_type = "photo"
            elif hasattr(message, 'document') and message.document:
                if hasattr(message.document, 'mime_type') and message.document.mime_type:
                    if message.document.mime_type.startswith("video"):
                        media_type = "video"
                    elif message.document.mime_type.startswith("image"):
                        media_type = "photo"
            elif hasattr(message, 'video') and message.video:
                media_type = "video"
            elif hasattr(message, 'media'):
                media_obj = message.media
                media_class_name = type(media_obj).__name__
                logger.debug(f"Класс медиа: {media_class_name}")

                if "Photo" in media_class_name:
                    media_type = "photo"
                elif "Video" in media_class_name or "Document" in media_class_name:
                    media_type = "video"

            logger.debug(f"Определен тип медиа: {media_type}")

            # Если в списке медиа есть элементы, но тип не определен, установим фото по умолчанию
            if media_info and media_type == "none":
                media_type = "photo"
                if any(media.get('mime_type', '').startswith('video') for media in media_info):
                    media_type = "video"
                logger.debug(f"Установлен тип медиа из списка: {media_type}")

            return {
                "text": full_html,
                "chat": chat,
                "msg_id": msg_id,
                "layout": layout,
                "media_list": media_info,
                "media_type": media_type
            }
        except Exception as e:
            logger.exception(f"Ошибка при получении поста: {e}")
            raise

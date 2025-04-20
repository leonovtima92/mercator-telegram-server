import logging
import json
from io import BytesIO
from telethon import TelegramClient
from telethon.tl.types import (
    MessageEntityBold,
    MessageEntityItalic,
    MessageEntityCode,
    MessageEntityPre,
    MessageEntityTextUrl,
    MessageMediaPhoto,
    MessageMediaDocument,
    MessageMediaWebPage,
    InputPeerChannel,
    Channel,
    User,
    Chat,
    InputChannel,
    DocumentAttributeFilename,
    DocumentAttributeVideo,
    DocumentAttributeAudio,
    DocumentAttributeImageSize
)
from config.settings import API_ID, API_HASH, TELEGRAM_SESSION, SESSION_PATH
import os
import asyncio
import sqlite3
import tempfile

logger = logging.getLogger(__name__)


class TelegramService:
    def __init__(self):
        self.client = None
        self.is_initialized = False

    async def init(self):
        """Инициализация клиента Telegram"""
        if self.is_initialized:
            return

        try:
            logger.debug("Подключаюсь к Telegram...")
            self.client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
            await self.client.connect()

            if not await self.client.is_user_authorized():
                raise Exception(
                    "Необходима авторизация в Telegram. Запустите скрипт auth.py")

            # Проверка соединения с чтением диалогов
            try:
                dialogs = await self.client.get_dialogs(limit=1)
                logger.info(
                    f"Подключение проверено успешно: доступно {len(dialogs)} диалогов")
            except Exception as e:
                logger.error(f"Ошибка при проверке диалогов: {e}")

            # Освобождаем базу данных сессии, если была заблокирована
            if hasattr(self.client.session, 'con') and self.client.session.con:
                try:
                    logger.debug("Проверка и сброс блокировок сессии...")
                    self.client.session.con.execute(
                        "PRAGMA busy_timeout = 5000")
                    self.client.session.con.execute(
                        "PRAGMA journal_mode = WAL")
                    self.client.session.con.commit()
                    logger.debug("Сессия обновлена")
                except Exception as e:
                    logger.warning(f"Ошибка при обновлении сессии: {e}")

            self.is_initialized = True
            logger.debug("Подключение к Telegram завершено")
            return True
        except Exception as e:
            logger.error(f"Ошибка при инициализации Telegram клиента: {e}")
            return False

    async def get_entity(self, chat_id):
        """Получение сущности чата по его ID"""
        if not self.is_initialized:
            await self.init()

        max_attempts = 3
        current_attempt = 1

        while current_attempt <= max_attempts:
            try:
                logger.debug(
                    f"Получение entity для чата: {chat_id} (попытка {current_attempt}/{max_attempts})")

                # Пробуем получить entity по username или ID
                if chat_id.isdigit():
                    entity = await self.client.get_entity(int(chat_id))
                else:
                    entity = await self.client.get_entity(chat_id)

                logger.debug(
                    f"Entity получен: {entity.id} - {getattr(entity, 'title', getattr(entity, 'first_name', 'Неизвестно'))}")
                return entity
            except Exception as e:
                logger.warning(
                    f"Ошибка при получении entity для чата {chat_id} (попытка {current_attempt}/{max_attempts}): {e}")
                if current_attempt == max_attempts:
                    raise
                current_attempt += 1
                await asyncio.sleep(1)  # Ждем секунду перед повторной попыткой

    async def get_channel_entity(self, channel_id):
        """Получение сущности канала по его ID"""
        return await self.get_entity(channel_id)

    async def get_channel_photo(self, channel_id):
        """Получение фотографии канала"""
        try:
            entity = await self.get_entity(channel_id)

            if not hasattr(entity, 'photo') or entity.photo is None:
                logger.warning(f"У канала {channel_id} нет фото")
                return {'file_bytes': None, 'mime_type': 'image/jpeg'}

            # Загружаем фото канала
            photo = await self.client.download_profile_photo(entity, bytes)

            if not photo:
                logger.warning(
                    f"Не удалось загрузить фото канала {channel_id}")
                return {'file_bytes': None, 'mime_type': 'image/jpeg'}

            logger.debug(
                f"Фото канала {channel_id} успешно получено, размер={len(photo)} байт")
            return {'file_bytes': photo, 'mime_type': 'image/jpeg'}
        except Exception as e:
            logger.error(f"Ошибка при получении фото канала {channel_id}: {e}")
            return {'file_bytes': None, 'mime_type': 'image/jpeg'}

    async def get_message(self, chat_id, message_id, max_attempts=3):
        """Получение сообщения по его ID"""
        # Проверяем инициализацию клиента
        if not self.is_initialized:
            await self.init()

        attempt = 1
        last_error = None

        while attempt <= max_attempts:
            try:
                logger.debug(
                    f"Получение сообщения {message_id} из {chat_id} (попытка {attempt}/{max_attempts})")

                # Если у нас проблемы с сессией, пробуем пересоздать соединение
                if attempt > 1:
                    try:
                        # Проверяем состояние базы данных и сбрасываем блокировки
                        if hasattr(self.client.session, 'con') and self.client.session.con:
                            self.client.session.con.execute(
                                "PRAGMA busy_timeout = 5000")
                            self.client.session.con.commit()
                    except Exception as e:
                        logger.warning(
                            f"Не удалось сбросить состояние сессии: {e}")

                entity = await self.get_entity(chat_id)
                if not entity:
                    logger.error(f"Не удалось получить entity для {chat_id}")
                    return None

                # Получаем сообщение с защитой от ошибки типа
                try:
                    # Преобразуем message_id в целое число, если это строка
                    msg_id = int(message_id) if isinstance(message_id, str) else message_id
                    
                    # Получаем сообщение
                    message = await self.client.get_messages(entity, ids=msg_id)
                except TypeError as type_error:
                    logger.error(f"Ошибка типа при получении сообщения: {type_error}")
                    # Пробуем альтернативный подход
                    try:
                        messages = await self.client.get_messages(entity, limit=1, 
                                                                offset_id=int(message_id)+1)
                        if messages and len(messages) > 0:
                            message = messages[0]
                            logger.debug(f"Сообщение получено альтернативным способом")
                        else:
                            message = None
                            logger.warning(f"Не удалось получить сообщение альтернативным способом")
                    except Exception as alt_error:
                        logger.error(f"Ошибка при альтернативном получении сообщения: {alt_error}")
                        message = None

                if not message:
                    logger.warning(
                        f"Сообщение {message_id} не найдено в {chat_id}")
                    return None

                logger.debug(
                    f"Сообщение {message_id} успешно получено из {chat_id}")
                return message

            except sqlite3.OperationalError as e:
                if "database is locked" in str(e):
                    logger.warning(
                        f"База данных заблокирована (попытка {attempt}/{max_attempts}): {e}")
                    await asyncio.sleep(1)  # Ждем перед следующей попыткой
                else:
                    logger.error(f"Ошибка SQLite при получении сообщения: {e}")
                    last_error = e

            except Exception as e:
                logger.error(
                    f"Ошибка при получении сообщения {message_id} из {chat_id}: {e}")
                last_error = e

            attempt += 1
            await asyncio.sleep(0.5)  # Небольшая пауза между попытками

        logger.error(
            f"Не удалось получить сообщение после {max_attempts} попыток. Последняя ошибка: {last_error}")
        return None

    async def get_media(self, chat_id, message_id, index=0):
        """Получение медиафайла из сообщения"""
        try:
            message = await self.get_message(chat_id, message_id)

            # Получаем медиа из сообщения
            if message.media:
                logger.debug(
                    f"Получение медиафайла для сообщения {message_id} из {chat_id}, индекс={index}")

                # Проверяем, является ли сообщение частью альбома
                if hasattr(message, 'grouped_id') and message.grouped_id and index > 0:
                    # Это альбом - получаем нужное сообщение из альбома по индексу
                    entity = await self.get_entity(chat_id)
                    grouped_id = message.grouped_id

                    logger.debug(
                        f"Сообщение {message_id} является частью альбома с grouped_id={grouped_id}, запрошенный индекс={index}")

                    # Получаем все сообщения в диапазоне, чтобы найти все части альбома
                    album_messages = await self.client.get_messages(
                        entity,
                        # Берем немного больший диапазон, чтобы точно захватить все медиа альбома
                        min_id=message_id-50,
                        max_id=message_id+50   # Увеличиваем диапазон поиска частей альбома
                    )

                    album_messages = [msg for msg in album_messages if hasattr(
                        msg, 'grouped_id') and msg.grouped_id == grouped_id and msg.media]

                    # Сортируем сообщения по ID, чтобы порядок был стабильный
                    album_messages.sort(key=lambda msg: msg.id)

                    logger.debug(
                        f"Найдено {len(album_messages)} сообщений в альбоме {grouped_id}")

                    # Проверяем, что индекс в пределах доступных медиа
                    if index < len(album_messages):
                        # Берем сообщение по индексу
                        target_message = album_messages[index]
                        logger.debug(
                            f"Выбрано сообщение с ID {target_message.id} по индексу {index}")
                        
                        # Используем target_message для дальнейшей обработки
                        message = target_message
                    else:
                        logger.warning(
                            f"Запрошенный индекс {index} превышает количество доступных медиафайлов {len(album_messages)} в альбоме")
                        return {'file_bytes': None, 'mime_type': None, 'filename': None}

                # Скачиваем медиа в байты
                try:
                    file_bytes = await self.client.download_media(message.media, bytes)
                except Exception as e:
                    logger.error(f"Ошибка при скачивании медиа: {e}")
                    return {'file_bytes': None, 'mime_type': None, 'filename': None}

                # Определяем тип медиа и имя файла
                mime_type = "application/octet-stream"  # По умолчанию
                filename = None

                # Проверяем тип медиа и извлекаем информацию
                if isinstance(message.media, MessageMediaPhoto):
                    # Это фотография
                    mime_type = "image/jpeg"
                    filename = f"photo_{message.id}.jpg"
                
                elif hasattr(message.media, 'document'):
                    # Это документ (видео, аудио, файл и т.д.)
                    document = message.media.document
                    
                    # Пытаемся получить MIME-тип из атрибутов документа
                    if hasattr(document, 'mime_type') and document.mime_type:
                        mime_type = document.mime_type
                    
                    # Ищем имя файла в атрибутах
                    for attr in document.attributes:
                        if hasattr(attr, 'file_name') and attr.file_name:
                            filename = attr.file_name
                            break
                    
                    # Если имя файла не найдено, создаем на основе ID и типа
                    if not filename:
                        if mime_type.startswith('video/'):
                            filename = f"video_{message.id}.mp4"
                        elif mime_type.startswith('audio/'):
                            filename = f"audio_{message.id}.mp3"
                        elif mime_type.startswith('image/'):
                            ext = mime_type.split('/')[-1]
                            filename = f"image_{message.id}.{ext}"
                        else:
                            filename = f"file_{message.id}"
                
                elif isinstance(message.media, MessageMediaWebPage) and hasattr(message.media.webpage, 'photo'):
                    # Это веб-страница с фото
                    mime_type = "image/jpeg"
                    filename = f"webpage_photo_{message.id}.jpg"
                
                # Если все еще нет имени файла, используем ID сообщения
                if not filename:
                    filename = f"media_{message.id}"
                
                # Гарантируем, что у нас есть расширение файла для распространенных типов
                if mime_type == "image/jpeg" and not filename.lower().endswith(('.jpg', '.jpeg')):
                    filename += ".jpg"
                elif mime_type == "image/png" and not filename.lower().endswith('.png'):
                    filename += ".png"
                elif mime_type == "image/gif" and not filename.lower().endswith('.gif'):
                    filename += ".gif"
                elif mime_type == "video/mp4" and not filename.lower().endswith(('.mp4', '.avi', '.mov')):
                    filename += ".mp4"
                elif mime_type == "audio/mpeg" and not filename.lower().endswith(('.mp3', '.mpeg')):
                    filename += ".mp3"

                logger.debug(
                    f"Медиафайл получен, размер={len(file_bytes) if file_bytes else 0} байт, тип={mime_type}, имя={filename}")
                return {
                    'file_bytes': file_bytes, 
                    'mime_type': mime_type, 
                    'filename': filename
                }
            else:
                logger.warning(
                    f"Сообщение {message_id} из {chat_id} не содержит медиа")
                return {'file_bytes': None, 'mime_type': None, 'filename': None}
        except Exception as e:
            logger.error(
                f"Ошибка при получении медиафайла для сообщения {message_id} из {chat_id}: {e}")
            return {'file_bytes': None, 'mime_type': None, 'filename': None}

    async def get_messages_with_media(self, chat_id, message_id):
        """
        Получение всех медиафайлов из сообщения или альбома.
        Возвращает список словарей с медиафайлами или пустой список, если медиа нет.
        """
        try:
            # Проверяем инициализацию клиента
            if not self.is_initialized:
                logger.info("Инициализация клиента перед получением медиа")
                await self.init()
            
            message = await self.get_message(chat_id, message_id)
            if not message:
                logger.error(f"Не удалось получить сообщение {message_id} из {chat_id}")
                return []
            
            results = []
            logger.info(f"Начинаю скачивание медиа из сообщения {message_id} канала {chat_id}")

            # Проверяем, является ли сообщение частью альбома
            if hasattr(message, 'grouped_id') and message.grouped_id:
                entity = await self.get_entity(chat_id)
                grouped_id = message.grouped_id
                
                logger.info(f"Обнаружен альбом с ID={grouped_id} для сообщения {message_id}")
                
                try:
                    # Получаем все сообщения в альбоме с более широким диапазоном
                    # Увеличим диапазон ID еще больше для надежности
                    min_search_id = message_id - 200
                    max_search_id = message_id + 200
                    logger.debug(f"Поиск сообщений альбома в диапазоне ID: {min_search_id} - {max_search_id}")
                    
                    all_messages_in_range = await self.client.get_messages(
                        entity,
                        min_id=min_search_id,
                        max_id=max_search_id
                    )
                    
                    if not all_messages_in_range:
                        logger.warning(f"В диапазоне {min_search_id}-{max_search_id} не найдено сообщений")
                        return []
                    
                    logger.debug(f"Найдено {len(all_messages_in_range)} сообщений в диапазоне для альбома {grouped_id}")
                    
                    # Фильтруем только сообщения альбома с медиа
                    album_messages = []
                    for msg in all_messages_in_range:
                        if hasattr(msg, 'grouped_id') and msg.grouped_id == grouped_id and hasattr(msg, 'media') and msg.media:
                            album_messages.append(msg)
                            logger.debug(f"  -> Найдено сообщение {msg.id} из альбома {grouped_id}")
                        else:
                            logger.debug(f"  -> Сообщение {msg.id} не принадлежит альбому {grouped_id} или не содержит медиа (Grouped ID: {getattr(msg, 'grouped_id', 'N/A')}, Has Media: {hasattr(msg, 'media') and msg.media is not None})")
                    
                    if not album_messages:
                        logger.warning(f"Не найдено сообщений, принадлежащих альбому {grouped_id} с медиа в диапазоне")
                        return []
                    
                    # Сортируем по ID для стабильного порядка
                    album_messages.sort(key=lambda msg: msg.id)
                    
                    logger.info(f"Отфильтровано {len(album_messages)} сообщений с медиа для альбома {grouped_id}")
                    
                    # Обрабатываем каждое сообщение в альбоме
                    for i, msg in enumerate(album_messages):
                        try:
                            logger.info(f"Обработка сообщения #{i+1}/{len(album_messages)} из альбома {grouped_id} (ID: {msg.id})")
                            
                            # Проверка наличия и типа медиа
                            if not hasattr(msg, 'media') or msg.media is None:
                                logger.warning(f"Сообщение {msg.id} не содержит медиа")
                                continue
                                
                            # Проверка поддерживаемых типов медиа
                            media_supported = (
                                isinstance(msg.media, MessageMediaPhoto) or
                                hasattr(msg.media, 'document') or
                                (isinstance(msg.media, MessageMediaWebPage) and 
                                hasattr(msg.media.webpage, 'photo'))
                            )
                            
                            if not media_supported:
                                logger.warning(f"Неподдерживаемый тип медиа в сообщении {msg.id}: {type(msg.media)}")
                                continue
                            
                            # Прямое скачивание медиа через Telethon в абсолютный временный путь
                            file_path = os.path.join(tempfile.gettempdir(), f"temp_media_{msg.id}")
                            logger.debug(f"Начинаю скачивание медиа #{i+1} в файл {file_path}")
                            try:
                                downloaded_file = await self.client.download_media(msg.media, file_path)
                                logger.debug(f"Результат скачивания: {downloaded_file}")
                                
                                if not downloaded_file:
                                    logger.warning(f"Telethon вернул пустой результат для медиа #{i+1}")
                                    continue
                                
                                logger.debug(f"Файл сохранен во временный путь: {downloaded_file}, проверяю существование")
                                
                                if not os.path.exists(downloaded_file):
                                    logger.error(f"Файл {downloaded_file} не существует после скачивания!")
                                    continue
                                
                                file_size = os.path.getsize(downloaded_file)
                                logger.debug(f"Размер скачанного файла: {file_size} байт")
                                
                                if file_size == 0:
                                    logger.warning(f"Скачанный файл имеет нулевой размер")
                                    continue
                            except TypeError as type_error:
                                logger.error(f"Ошибка типа при скачивании медиа #{i+1}: {type_error}", exc_info=True)
                                logger.error(f"Тип медиа: {type(msg.media)}")
                                continue
                            except Exception as download_error:
                                logger.error(f"Ошибка при скачивании медиа #{i+1}: {download_error}", exc_info=True)
                                continue
                            
                            # Читаем файл в память и удаляем временный файл
                            with open(downloaded_file, 'rb') as f:
                                file_bytes = f.read()
                            
                            try:
                                os.remove(downloaded_file)
                            except Exception as e:
                                logger.warning(f"Не удалось удалить временный файл {downloaded_file}: {e}")
                            
                            # Определяем тип файла и имя
                            mime_type = "application/octet-stream"
                            filename = os.path.basename(downloaded_file)
                            
                            # Уточняем тип и имя файла на основе медиа
                            if isinstance(msg.media, MessageMediaPhoto):
                                mime_type = "image/jpeg"
                                filename = f"photo_{msg.id}.jpg"
                            
                            elif hasattr(msg.media, 'document'):
                                document = msg.media.document
                                
                                # Получаем MIME-тип
                                if hasattr(document, 'mime_type') and document.mime_type:
                                    mime_type = document.mime_type
                                
                                # Ищем имя файла в атрибутах
                                filename_found = False
                                for attr in document.attributes:
                                    if isinstance(attr, DocumentAttributeFilename):
                                        filename = attr.file_name
                                        filename_found = True
                                        break
                                
                                # Если имя не найдено, создаем на основе типа
                                if not filename_found:
                                    if mime_type.startswith('video/'):
                                        filename = f"video_{msg.id}.mp4"
                                    elif mime_type.startswith('image/'):
                                        filename = f"image_{msg.id}.jpg"
                                    else:
                                        filename = f"file_{msg.id}"
                            
                            # Добавляем расширение, если его нет
                            if '.' not in filename:
                                if mime_type == "image/jpeg":
                                    filename += ".jpg"
                                elif mime_type == "video/mp4":
                                    filename += ".mp4"
                            
                            # Создаем и добавляем запись о медиа
                            media_item = {
                                'file_bytes': file_bytes,
                                'mime_type': mime_type,
                                'filename': filename
                            }
                            
                            results.append(media_item)
                            logger.info(f"Успешно добавлено медиа #{i+1} из альбома: {filename}, размер={len(file_bytes)} байт")
                        
                        except Exception as e:
                            logger.error(f"Ошибка при обработке медиа #{i+1} из альбома {grouped_id}: {e}", exc_info=True)
                
                except Exception as e:
                    logger.error(f"Ошибка при обработке альбома {grouped_id}: {e}", exc_info=True)
            
            elif message.media:
                # Одиночное медиа
                logger.info(f"Обнаружено одиночное медиа в сообщении {message_id}")
                
                try:
                    # Проверка типа медиа
                    media_supported = (
                        isinstance(message.media, MessageMediaPhoto) or
                        hasattr(message.media, 'document') or
                        (isinstance(message.media, MessageMediaWebPage) and 
                        hasattr(message.media.webpage, 'photo'))
                    )
                    
                    if not media_supported:
                        logger.warning(f"Неподдерживаемый тип медиа в сообщении {message_id}: {type(message.media)}")
                        return []
                    
                    # Скачиваем во временный файл для надежности, используя абсолютный путь
                    file_path = os.path.join(tempfile.gettempdir(), f"temp_media_{message_id}")
                    logger.debug(f"Начинаю скачивание одиночного медиа в файл {file_path}")
                    try:
                        downloaded_file = await self.client.download_media(message.media, file_path)
                        logger.debug(f"Результат скачивания: {downloaded_file}")
                        
                        if not downloaded_file:
                            logger.warning(f"Не удалось скачать медиа из сообщения {message_id}")
                            return []
                        
                        logger.debug(f"Медиа сохранено во временный файл: {downloaded_file}, проверяю существование")
                        
                        if not os.path.exists(downloaded_file):
                            logger.error(f"Файл {downloaded_file} не существует после скачивания!")
                            return []
                        
                        file_size = os.path.getsize(downloaded_file)
                        logger.debug(f"Размер скачанного файла: {file_size} байт")
                        
                        if file_size == 0:
                            logger.warning(f"Скачанный файл имеет нулевой размер")
                            return []
                    except TypeError as type_error:
                        logger.error(f"Ошибка типа при скачивании медиа: {type_error}", exc_info=True)
                        logger.error(f"Тип медиа: {type(message.media)}")
                        return []
                    except Exception as download_error:
                        logger.error(f"Ошибка при скачивании одиночного медиа: {download_error}", exc_info=True)
                        return []
                    
                    # Читаем файл в память
                    with open(downloaded_file, 'rb') as f:
                        file_bytes = f.read()
                    
                    # Удаляем временный файл
                    try:
                        os.remove(downloaded_file)
                    except Exception as e:
                        logger.warning(f"Не удалось удалить временный файл {downloaded_file}: {e}")
                    
                    # Определяем тип и имя
                    mime_type = "application/octet-stream"
                    filename = os.path.basename(downloaded_file)
                    
                    if isinstance(message.media, MessageMediaPhoto):
                        mime_type = "image/jpeg"
                        filename = f"photo_{message_id}.jpg"
                    
                    elif hasattr(message.media, 'document'):
                        document = message.media.document
                        
                        if hasattr(document, 'mime_type') and document.mime_type:
                            mime_type = document.mime_type
                        
                        for attr in document.attributes:
                            if isinstance(attr, DocumentAttributeFilename):
                                filename = attr.file_name
                                break
                        
                        # Используем тип для определения имени, если имя не найдено
                        if filename == os.path.basename(downloaded_file):
                            if mime_type.startswith('video/'):
                                filename = f"video_{message_id}.mp4"
                            elif mime_type.startswith('image/'):
                                filename = f"image_{message_id}.jpg"
                    
                    # Добавляем медиа в результаты
                    media_item = {
                        'file_bytes': file_bytes,
                        'mime_type': mime_type,
                        'filename': filename
                    }
                    
                    results.append(media_item)
                    logger.info(f"Успешно добавлено одиночное медиа: {filename}, размер={len(file_bytes)} байт")
                
                except Exception as e:
                    logger.error(f"Ошибка при скачивании одиночного медиа из сообщения {message_id}: {e}", exc_info=True)
            
            else:
                logger.info(f"Сообщение {message_id} не содержит медиа")

            logger.info(f"Завершено получение медиа-файлов. Всего получено: {len(results)} файлов")
            return results

        except Exception as e:
            logger.error(f"Критическая ошибка при получении медиафайлов для сообщения {message_id}: {e}", exc_info=True)
            return []


# Создаем экземпляр сервиса
telegram_service = TelegramService()

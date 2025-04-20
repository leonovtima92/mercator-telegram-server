import html
import logging
from typing import Optional, List, Any

logger = logging.getLogger(__name__)


class MessageFormatter:
    @staticmethod
    def apply_entities(text: str, entities: Optional[List[Any]] = None) -> str:
        """Применяет форматирование к тексту на основе сущностей Telegram"""
        logger.debug("Начало apply_entities")

        if not text:
            logger.warning("Получен пустой текст для форматирования")
            return ""

        try:
            if not entities:
                result = html.escape(text)
                logger.debug("Нет сущностей, возвращаем экранированный текст")
                return result

            entities_sorted = sorted(entities, key=lambda e: e.offset)
            result = []
            last_index = 0

            for ent in entities_sorted:
                try:
                    # Проверяем границы индексов для предотвращения ошибок
                    if ent.offset < 0 or ent.offset > len(text) or ent.offset + ent.length > len(text):
                        logger.warning(
                            f"Некорректные индексы сущности: offset={ent.offset}, length={ent.length}, длина текста={len(text)}")
                        continue

                    result.append(html.escape(text[last_index:ent.offset]))
                    entity_text = html.escape(
                        text[ent.offset:ent.offset + ent.length])

                    if ent.__class__.__name__ == "MessageEntityBold":
                        result.append(f"<b>{entity_text}</b>")
                    elif ent.__class__.__name__ == "MessageEntityItalic":
                        result.append(f"<i>{entity_text}</i>")
                    elif ent.__class__.__name__ == "MessageEntityCode":
                        result.append(f"<code>{entity_text}</code>")
                    elif ent.__class__.__name__ == "MessageEntityPre":
                        result.append(f"<pre>{entity_text}</pre>")
                    elif ent.__class__.__name__ == "MessageEntityTextUrl":
                        result.append(f'<a href="{ent.url}">{entity_text}</a>')
                    else:
                        result.append(entity_text)

                    last_index = ent.offset + ent.length
                except Exception as e:
                    logger.error(
                        f"Ошибка при обработке сущности {ent.__class__.__name__}: {e}")
                    # Продолжаем со следующей сущностью

            # Добавляем оставшийся текст
            if last_index < len(text):
                result.append(html.escape(text[last_index:]))

            final_result = "".join(result)
            logger.debug("Форматирование текста успешно применено")
            return final_result
        except Exception as e:
            logger.exception(f"Ошибка при применении форматирования: {e}")
            # Возвращаем исходный текст с экранированием HTML
            return html.escape(text)

    @staticmethod
    def convert_quotes(text_with_entities: str) -> str:
        """Конвертирует цитаты в HTML-формат"""
        if not text_with_entities:
            return ""

        try:
            logger.debug("Начало convert_quotes")
            lines = text_with_entities.split("\n")
            out = []

            for line in lines:
                if line.strip().startswith(">"):
                    content = line.lstrip("> ").rstrip()
                    out.append(f"<blockquote>{content}</blockquote>")
                else:
                    out.append(line.rstrip())

            result = "<br>".join(out)
            logger.debug("Конвертация цитат завершена")
            return result
        except Exception as e:
            logger.exception(f"Ошибка при конвертации цитат: {e}")
            return text_with_entities

    @classmethod
    def message_to_html(cls, message: Any, text_content: str = None, entities: Any = None) -> str:
        """Конвертирует сообщение Telegram в HTML

        Args:
            message: Сообщение Telegram
            text_content: Текст сообщения (если передан напрямую)
            entities: Сущности форматирования (если переданы напрямую)
        """
        try:
            logger.debug("Начало message_to_html")

            if not message and not text_content:
                logger.warning("Получено пустое сообщение без текста")
                return ""

            # Если текст не передан напрямую, пытаемся получить его из сообщения
            if text_content is None:
                # Проверяем различные поля, где может быть текст
                text_content = (
                    getattr(message, 'message', None) or
                    getattr(message, 'caption', None) or
                    ""
                )

            # Если текст все еще пуст
            if not text_content:
                logger.warning("Сообщение не содержит текста")
                return ""

            # Если entities не переданы напрямую, пытаемся получить их из сообщения
            if entities is None:
                entities = (
                    getattr(message, 'entities', None) or
                    getattr(message, 'message_entities', None) or
                    getattr(message, 'caption_entities', None)
                )

            logger.debug(
                f"Текст для обработки: {text_content[:100]}... (длина: {len(text_content)})")
            logger.debug(f"Наличие entities: {bool(entities)}")

            text_with_entities = cls.apply_entities(text_content, entities)
            final_html = cls.convert_quotes(text_with_entities)

            logger.debug("Преобразование сообщения в HTML завершено")
            return final_html
        except Exception as e:
            logger.exception(
                f"Ошибка при преобразовании сообщения в HTML: {e}")
            return f"<p>Ошибка при обработке сообщения: {html.escape(str(e))}</p>"

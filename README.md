# Telegram Post Viewer

Веб-приложение для просмотра постов Telegram с возможностью сохранения в архив.

## Возможности

- Просмотр текста постов Telegram
- Отображение медиафайлов (фото и видео)
- Настраиваемый размер текста
- Гибкое расположение медиа и текста
- Сохранение поста в архив (скриншот + медиафайлы и необходимые файлы)

## Установка

1. Создание виртуального окружения

```bash
python -m venv venv
source venv/bin/activate  # для Linux/Mac
venv\Scripts\activate     # для Windows
```

2. Установка зависимостей:

```bash
pip install -r requirements.txt
```

3. Создайте файл `.env` в корне проекта и добавьте в него:

```
API_ID=your_api_id
API_HASH=your_api_hash
SESSION_PATH=session_name
HOST=0.0.0.0
PORT=5000
DEBUG=True
```

## Запуск

```bash
python auth.py #создание телеграм сессии
python run.py
```

Приложение будет доступно по адресу: http://0.0.0.0:5000

#!/bin/bash
echo "Установка зависимостей через pip..."
pip install --no-cache-dir -r mysite/requirements.txt

echo "Сбор статических файлов..."
cd mysite
python manage.py collectstatic --noinput

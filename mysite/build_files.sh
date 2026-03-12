#!/bin/bash

echo "BUILD START"

# Установка зависимостей
python3.9 -m pip install -r requirements.txt

# Сбор статических файлов
python3.9 manage.py collectstatic --noinput --clear

echo "BUILD END"

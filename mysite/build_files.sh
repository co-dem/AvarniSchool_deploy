#!/bin/bash

# Установка зависимостей
python3 -m pip install -r requirements.txt

# Сбор статических файлов
python3 manage.py collectstatic --noinput
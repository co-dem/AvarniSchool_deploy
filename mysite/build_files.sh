#!/bin/bash
set -e
cd mysite
pip install -r requirements.txt
python manage.py collectstatic --noinput

#!/bin/bash

python3 manage.py collectstatic --noinput

python manage.py runserver 0.0.0.0:${PORT:-10000}

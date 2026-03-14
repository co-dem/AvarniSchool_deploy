import sys, os

import os

from django.core.wsgi import get_wsgi_application

def app(environ, start_response):
    status = '200 OK'
    headers = [('Content-type', 'text/plain')]
    try:
        # Попытка загрузить Django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')
        from django.core.wsgi import get_wsgi_application
        django_app = get_wsgi_application()
        return django_app(environ, start_response)
    except Exception as e:
        # Показываем ошибку
        import traceback
        error_msg = traceback.format_exc()
        start_response('500 Internal Server Error', headers)
        return [error_msg.encode()]"""

WSGI config for mysite project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/wsgi/
"""


# os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')

# application = get_wsgi_application()
# app = application

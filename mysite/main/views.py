from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render
from django.conf import settings
import os
import json

@csrf_exempt
def get_product_prices(request):
    """Упрощенная версия для проверки"""
    try:
        # Проверяем базовую доступность
        return JsonResponse({
            'status': 'success',
            'message': 'Endpoint is working',
            'debug': {
                'supabase_url_set': bool(os.environ.get('SUPABASE_URL')),
                'supabase_key_set': bool(os.environ.get('SUPABASE_KEY')),
                'django_settings_loaded': True
            }
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'error': str(e)
        }, status=500)

# Добавьте простой тестовый эндпоинт
@csrf_exempt
def test_endpoint(request):
    return JsonResponse({'status': 'ok', 'message': 'Server is running'})

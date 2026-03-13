from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.shortcuts import render
from django.conf import settings
from django.utils import timezone
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.core.mail import EmailMultiAlternatives
from supabase import create_client
import json
import time
import stripe
import uuid
import logging
import requests
from datetime import datetime, timedelta
from typing import Dict, Set, Optional, Tuple, Any
from dataclasses import dataclass, field
import traceback
from dotenv import load_dotenv
import os


# ============================================
# НАСТРОЙКИ И КОНСТАНТЫ
# ============================================

logger = logging.getLogger(__name__)
load_dotenv()

# API конфигурация
DISCORD_BOT_URL = 'http://localhost:8001'
stripe.api_key = settings.STRIPE_SECRET_KEY

# Supabase конфигурация
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

# Email конфигурация
DISCORD_INVITE_URL = settings.DISCORD_INVITE_URL
SUPPORT_EMAIL = settings.SUPPORT_EMAIL
SUPPORT_DISCORD = settings.SUPPORT_DISCORD
SITE_URL = settings.SITE_URL

# ============================================
# DATA CLASSES
# ============================================

@dataclass
class CourseDetails:
    """Детальная информация о курсе/пакете"""
    level: int
    max_level: int
    requires: list
    type: str
    courses: list

@dataclass
class ValidationResult:
    """Результат проверки заказа"""
    is_valid: bool
    error_message: str = ""
    warning_message: str = ""

@dataclass
class PriceBreakdown:
    """Детализация цены"""
    course_price: int = 0
    chat_price: int = 0
    course_discounted: bool = False
    chat_discounted: bool = False
    message: str = ""
    chat_status: str = "без изменений"
    total: int = 0

@dataclass
class OrderData:
    """Данные заказа"""
    email: str
    selected_course: Optional[str]
    has_chat: bool
    amount: int = 0
    payment_id: Optional[str] = None
    order_id: Optional[str] = None

# ============================================
# КОНСТАНТЫ КУРСОВ
# ============================================

COURSE_INFO = {
    'course1': CourseDetails(1, 1, [], 'course', [1]),
    'course2': CourseDetails(2, 2, [1], 'course', [2]),
    'course3': CourseDetails(3, 3, [2], 'course', [3]),
    'package12': CourseDetails(2, 2, [], 'package', [1, 2]),
    'package23': CourseDetails(3, 3, [1], 'package', [2, 3]),
    'package123': CourseDetails(3, 3, [], 'package', [1, 2, 3])
}

ALLOWED_FOR_NEW = ['package123', 'package12', 'course1']

# Человеко-читаемые названия курсов
COURSE_DISPLAY_NAMES = {
    'course1': 'Курс 1',
    'course2': 'Курс 2',
    'course3': 'Курс 3',
    'package12': 'Пакет "Курсы 1-2"',
    'package23': 'Пакет "Курсы 2-3"',
    'package123': 'Пакет "Все курсы"',
    'chat_only': 'Только чат'
}

# ============================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================

def get_course_details(course_code: str) -> Optional[CourseDetails]:
    """Возвращает детальную информацию о курсе/пакете"""
    return COURSE_INFO.get(course_code)

def get_course_level(selected_course: str) -> int:
    """Определяет максимальный уровень курса в покупке"""
    course = get_course_details(selected_course)
    return course.level if course else 1

def is_allowed_for_new_user(course_code: str) -> bool:
    """Проверяет, разрешен ли курс для нового пользователя"""
    return course_code in ALLOWED_FOR_NEW

def get_supabase_client():
    """Создает и возвращает клиент Supabase"""
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def log_order_validation(email: str, course: Optional[str], has_chat: bool, 
                         user_level: int, owned_courses: Set[int], active_chat: Optional[Dict]):
    """Логирование проверки заказа"""
    logger.info(f"\n🔍 ========== ПРОВЕРКА ЗАКАЗА ==========")
    logger.info(f"📧 Email: {email}")
    logger.info(f"📚 Выбранный курс: {course}")
    logger.info(f"💬 Чат выбран: {has_chat}")
    logger.info(f"📊 Уровень курса пользователя: {user_level}")
    logger.info(f"📋 Имеющиеся курсы: {sorted(owned_courses)}")
    logger.info(f"💬 Активный чат: {'уровень ' + str(active_chat.get('chat_level')) if active_chat else 'отсутствует'}")

# ============================================
# ФУНКЦИИ ДЛЯ РАБОТЫ С ЦЕНАМИ ИЗ SUPABASE
# ============================================

def get_product_price(supabase, product_code: str) -> int:
    """Получает цену товара из БД"""
    try:
        logger.info(f"🔍 Запрос цены для товара: {product_code}")
        response = supabase.table('products') \
            .select('price') \
            .eq('product_code', product_code) \
            .execute()
        
        if not response.data:
            error_msg = f"❌ Товар с кодом {product_code} не найден в таблице products"
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        price = response.data[0]['price']
        logger.info(f"✅ Цена для {product_code}: ${price/100:.2f} ({price} центов)")
        return price
    except Exception as e:
        logger.error(f"⚠️ Ошибка при получении цены для {product_code}: {e}")
        raise

def get_chat_price(supabase, level: int) -> int:
    """Получает цену чата для указанного уровня из БД"""
    chat_code = f'chat{level}'
    return get_product_price(supabase, chat_code)

def get_course_price(supabase, course_code: str) -> int:
    """Получает цену курса/пакета из БД"""
    return get_product_price(supabase, course_code)

def get_all_product_prices(supabase) -> Dict[str, int]:
    """Получает все цены из таблицы products (для кэширования)"""
    try:
        response = supabase.table('products') \
            .select('product_code, price') \
            .execute()
        
        if response.data:
            return {item['product_code']: item['price'] for item in response.data}
        return {}
    except Exception as e:
        logger.error(f"⚠️ Ошибка при получении всех цен: {e}")
        return {}

# ============================================
# ФУНКЦИИ ДЛЯ EMAIL-УВЕДОМЛЕНИЙ
# ============================================

def get_discord_invite(email: str, course_level: int, order_id: str = None) -> Optional[str]:
    """
    Получает invite ссылку от Discord бота
    
    Args:
        email: Email пользователя
        course_level: Уровень курса
        order_id: ID заказа (опционально)
    """
    # Проверка доступности бота
    try:
        health_response = requests.get(f"{DISCORD_BOT_URL}/api/health", timeout=5)
        logger.info(f"🔍 Health check ответ: {health_response.status_code} - {health_response.text}")
    except Exception as e:
        logger.error(f"🔍 Health check failed: {e}")

    try:
        # Определяем код курса на основе уровня
        course_map = {
            1: 'course1',
            2: 'course2', 
            3: 'course3'
        }
        course_code = course_map.get(course_level, f'course{course_level}')
        
        # Формируем данные для бота в правильном формате
        request_data = {
            'email': email,
            'course': course_code,  # <-- ИСПРАВЛЕНО: используем 'course'
            'order_id': order_id or f"manual_{int(time.time())}"
        }
        
        logger.info(f"📤 Отправка запроса к Discord боту: {request_data}")
        
        response = requests.post(
            f"{DISCORD_BOT_URL}/api/generate-invite",
            json=request_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            invite_url = data.get('invite_url')
            logger.info(f"✅ Получена invite ссылка: {invite_url}")
            return invite_url
        else:
            logger.error(f"❌ Ошибка получения invite: {response.status_code} - {response.text}")
            return None
            
    except requests.exceptions.ConnectionError:
        logger.error(f"❌ Не удалось подключиться к Discord боту по адресу {DISCORD_BOT_URL}")
        return None
    except Exception as e:
        logger.error(f"❌ Ошибка при запросе к Discord боту: {e}")
        return None

def send_success_email(email: str, order_data: Dict):
    """Отправляет email об успешной покупке"""
    try:
        # Получаем invite ссылку если есть курс
        invite_url = None
        if order_data.get('course_level'):
            invite_url = get_discord_invite(
                email, 
                order_data['course_level'],
                order_id=order_data.get('order_id')  # Передаем order_id
            )
        
        # Формируем контекст для шаблона
        context = {
            'email': email,
            'order_id': order_data.get('order_id'),
            'payment_id': order_data.get('payment_id'),
            'amount': order_data.get('amount', 0) / 100,  # Переводим в доллары
            'amount_display': f"${order_data.get('amount', 0) / 100:.2f}",
            'purchase_date': datetime.now().strftime('%d.%m.%Y %H:%M'),
            'course_name': COURSE_DISPLAY_NAMES.get(order_data.get('product'), order_data.get('product', 'Неизвестно')),
            'has_chat': order_data.get('has_chat', False),
            'chat_level': order_data.get('chat_level'),
            'chat_expires': (datetime.now() + timedelta(days=30)).strftime('%d.%m.%Y'),
            'invite_url': invite_url,
            'support_email': SUPPORT_EMAIL,
            'support_discord': SUPPORT_DISCORD,
            'site_url': SITE_URL
        }
        
        # Создаем HTML и текстовую версии письма
        html_content = render_to_string('emails/payment_success.html', context)
        text_content = render_to_string('emails/payment_success.txt', context)
        
        # Отправляем email
        email_message = EmailMultiAlternatives(
            subject='✅ Подтверждение оплаты - Доступ активирован',
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email]
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()
        
        logger.info(f"✅ Email об успешной покупке отправлен на {email}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка при отправке email об успешной покупке: {e}")

def send_failure_email(email: str, error_data: Dict):
    """Отправляет email о неудачной покупке"""
    try:
        context = {
            'email': email,
            'error_message': error_data.get('error_message', 'Неизвестная ошибка'),
            'attempt_date': datetime.now().strftime('%d.%m.%Y %H:%M'),
            'course_name': COURSE_DISPLAY_NAMES.get(error_data.get('product'), error_data.get('product', 'Неизвестно')),
            'has_chat': error_data.get('has_chat', False),
            'amount': error_data.get('amount', 0) / 100 if error_data.get('amount') else None,
            'support_email': SUPPORT_EMAIL,
            'support_discord': SUPPORT_DISCORD,
            'site_url': SITE_URL
        }
        
        html_content = render_to_string('emails/payment_failed.html', context)
        text_content = render_to_string('emails/payment_failed.txt', context)
        
        email_message = EmailMultiAlternatives(
            subject='❌ Проблема с оплатой - Требуется действие',
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email]
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()
        
        logger.info(f"✅ Email о неудачной покупке отправлен на {email}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка при отправке email о неудачной покупке: {e}")

def send_admin_notification(order_data: Dict):
    """Отправляет уведомление администратору о новой покупке"""
    try:
        context = {
            'email': order_data.get('email'),
            'order_id': order_data.get('order_id'),
            'payment_id': order_data.get('payment_id'),
            'amount': order_data.get('amount', 0) / 100,
            'purchase_date': datetime.now().strftime('%d.%m.%Y %H:%M'),
            'course_name': COURSE_DISPLAY_NAMES.get(order_data.get('product'), order_data.get('product', 'Неизвестно')),
            'has_chat': order_data.get('has_chat', False),
            'chat_level': order_data.get('chat_level')
        }
        
        html_content = render_to_string('emails/admin_notification.html', context)
        text_content = render_to_string('emails/admin_notification.txt', context)
        
        email_message = EmailMultiAlternatives(
            subject=f'💰 Новая покупка: {context["course_name"]} от {context["email"]}',
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[settings.ADMIN_EMAIL]
        )
        email_message.attach_alternative(html_content, "text/html")
        email_message.send()
        
        logger.info(f"✅ Уведомление администратору отправлено")
        
    except Exception as e:
        logger.error(f"❌ Ошибка при отправке уведомления администратору: {e}")

# ============================================
# ОСНОВНЫЕ ФУНКЦИИ РАБОТЫ С ПОЛЬЗОВАТЕЛЕМ
# ============================================

def get_user_course_level(supabase, email: str) -> int:
    """Получает максимальный уровень курса пользователя"""
    try:
        response = supabase.table('rights_for_course') \
            .select('course_level') \
            .eq('email', email) \
            .execute()
        
        if response.data:
            return response.data[0].get('course_level', 0)
        return 0
    except Exception as e:
        logger.error(f"⚠️ Ошибка при получении уровня курса: {e}")
        return 0

def get_user_owned_courses(supabase, email: str) -> Set[int]:
    """Получает список уровней курсов пользователя"""
    try:
        response = supabase.table('rights_for_course') \
            .select('course_level') \
            .eq('email', email) \
            .execute()
        
        return {record.get('course_level') for record in response.data if record.get('course_level')}
    except Exception as e:
        logger.error(f"⚠️ Ошибка при получении списка курсов: {e}")
        return set()

def get_user_chat_info(supabase, email: str) -> Optional[Dict]:
    """Получает информацию о текущем активном чате"""
    try:
        response = supabase.table('chat_subscription') \
            .select('*') \
            .eq('email', email) \
            .eq('is_active', True) \
            .execute()
        
        if response.data:
            chat_info = response.data[0]
            
            # Более надежный парсинг даты
            expires_at_str = chat_info['expires_at']
            
            # Убираем 'Z' если есть и парсим
            if expires_at_str.endswith('Z'):
                expires_at_str = expires_at_str.replace('Z', '+00:00')
            
            try:
                # Пробуем стандартный парсинг
                expires_at = datetime.fromisoformat(expires_at_str)
            except ValueError:
                # Если не получается, используем dateutil.parser
                try:
                    from dateutil import parser
                    expires_at = parser.parse(expires_at_str)
                except ImportError:
                    # Если dateutil не установлен, делаем ручной парсинг
                    expires_at = parse_datetime_manual(expires_at_str)
            
            if expires_at > datetime.now(expires_at.tzinfo):
                logger.info(f"📱 Текущий активный чат пользователя: уровень {chat_info.get('chat_level')}, истекает {chat_info.get('expires_at')}")
                return chat_info
            else:
                # Деактивируем истекший чат
                supabase.table('chat_subscription') \
                    .update({'is_active': False}) \
                    .eq('id', chat_info['id']) \
                    .execute()
                logger.info(f"📱 Чат пользователя истек {expires_at}")
                return None
        return None
    except Exception as e:
        logger.error(f"⚠️ Ошибка при получении информации о чате: {e}")
        return None

def parse_datetime_manual(date_str: str) -> datetime:
    """Ручной парсинг даты в формате PostgreSQL"""
    try:
        # Убираем временную зону если есть
        if '+' in date_str:
            date_part = date_str.split('+')[0]
        else:
            date_part = date_str
        
        # Если есть микросекунды с 5 цифрами
        if '.' in date_part:
            main_part, micro_part = date_part.split('.')
            # Дополняем микросекунды до 6 цифр
            if len(micro_part) < 6:
                micro_part = micro_part.ljust(6, '0')
            elif len(micro_part) > 6:
                micro_part = micro_part[:6]
            date_str_clean = f"{main_part}.{micro_part}"
        else:
            date_str_clean = date_part
        
        # Добавляем временную зону обратно если была
        if '+' in date_str:
            tz_part = date_str.split('+')[1]
            date_str_clean = f"{date_str_clean}+{tz_part}"
        
        return datetime.fromisoformat(date_str_clean)
    except Exception as e:
        logger.error(f"Ошибка ручного парсинга даты {date_str}: {e}")
        # Возвращаем текущее время + 30 дней как запасной вариант
        return datetime.now() + timedelta(days=30)

def get_current_chat_info(supabase, email: str) -> Tuple[int, bool]:
    """Получает информацию о текущем чате пользователя"""
    try:
        chat_response = supabase.table('chat_subscription') \
            .select('chat_level') \
            .eq('email', email) \
            .eq('is_active', True) \
            .execute()
        
        if chat_response.data:
            return chat_response.data[0].get('chat_level', 0), True
    except Exception as e:
        logger.error(f"⚠️ Ошибка при получении уровня чата: {e}")
    
    return 0, False

# ============================================
# ВАЛИДАЦИЯ ЗАКАЗА
# ============================================

def validate_order(supabase, email: str, selected_course: Optional[str], 
                   has_chat: bool) -> ValidationResult:
    """
    Проверяет заказ на соответствие правилам (1-7)
    """
    # Получаем информацию о пользователе
    user_course_level = get_user_course_level(supabase, email)
    owned_courses = get_user_owned_courses(supabase, email)
    active_chat = get_user_chat_info(supabase, email)
    
    log_order_validation(email, selected_course, has_chat, user_course_level, 
                        owned_courses, active_chat)
    
    # Правило 5: Покупка только чата
    if has_chat and not selected_course:
        return validate_chat_only(owned_courses, active_chat, user_course_level)
    
    # Если курс не выбран и чат не выбран - ошибка
    if not selected_course:
        return ValidationResult(False, "Не выбран курс для покупки")
    
    # Получаем детали выбранного курса
    course_details = get_course_details(selected_course)
    if not course_details:
        return ValidationResult(False, "Неверный код курса")
    
    purchased_level = course_details.level
    purchased_courses = set(course_details.courses)
    
    logger.info(f"📊 Детали курса: уровень {purchased_level}, курсы в наборе: {purchased_courses}")
    
    # === УСИЛЕННЫЕ ПРОВЕРКИ ===
    
    # 1. Проверка на понижение уровня (нельзя купить уровень ниже текущего)
    if user_course_level > purchased_level:
        logger.info(f"❌ Попытка понижения уровня: текущий {user_course_level} -> покупаемый {purchased_level}")
        return ValidationResult(False, f"Нельзя купить курс уровня {purchased_level}, так как у вас уже есть курс уровня {user_course_level}")
    
    # 2. Проверка на дублирование уровня (нельзя купить тот же уровень, если нет новых курсов)
    if user_course_level == purchased_level:
        # Проверяем, есть ли новые курсы в пакете
        new_courses = purchased_courses - owned_courses
        if not new_courses:
            logger.info(f"❌ Попытка купить уже имеющийся курс уровня {purchased_level}")
            return ValidationResult(False, f"У вас уже есть курс уровня {purchased_level}")
        else:
            logger.info(f"⚠️ В пакете есть новые курсы: {new_courses}")
            # Разрешаем покупку, но с предупреждением
    
    # Правило 1: Проверка требований (нельзя купить курс 2 без курса 1 и т.д.)
    for req_level in course_details.requires:
        if req_level not in owned_courses:
            logger.info(f"❌ Правило 1: Для {selected_course} требуется курс {req_level}")
            return ValidationResult(False, f"Для покупки {selected_course} необходимо сначала приобрести курс {req_level}")
    
    # Правило 2: Проверка для нового пользователя
    if not owned_courses:  # Нет ни одного курса
        allowed_for_new = ['package123', 'package12', 'course1']
        if selected_course not in allowed_for_new:
            logger.info(f"❌ Правило 2: Новый пользователь может купить только {', '.join(allowed_for_new)}")
            return ValidationResult(False, "Новый пользователь может приобрести только пакет 'Все курсы', пакет 'Курсы 1-2' или курс 1")
        logger.info(f"✅ Правило 2: Новый пользователь покупает разрешенный курс {selected_course}")
    
    # Правило 3: Специальная проверка для package23
    if selected_course == 'package23' and 1 not in owned_courses:
        logger.info(f"❌ Правило 3: Для package23 требуется курс 1")
        return ValidationResult(False, "Для покупки пакета 'Курсы 2-3' необходимо иметь курс 1")
    
    # Правило 4: Проверка на дублирование (нельзя купить то, что уже есть)
    # Проверяем каждый курс из пакета
    courses_to_buy = purchased_courses.copy()
    already_owned = []
    
    for course_level in purchased_courses:
        if course_level in owned_courses:
            already_owned.append(course_level)
            courses_to_buy.remove(course_level)
    
    if not courses_to_buy:  # Все курсы из пакета уже есть
        logger.info(f"❌ Правило 4: Все курсы из {selected_course} уже есть у пользователя: {sorted(purchased_courses)}")
        return ValidationResult(False, f"У вас уже есть все курсы из этого набора")
    
    if already_owned:
        logger.info(f"⚠️ Некоторые курсы уже есть: {already_owned}, покупаются новые: {sorted(courses_to_buy)}")
    
    # Проверка чата при покупке курса
    warning = ""
    if has_chat:
        if active_chat:
            if active_chat.get('chat_level') == purchased_level:
                warning = f"У вас уже есть чат уровня {purchased_level}, он останется без изменений"
            else:
                warning = f"Ваш текущий чат уровня {active_chat.get('chat_level')} будет заменен на чат уровня {purchased_level}"
        logger.info(f"✅ Чат будет добавлен к покупке")
    
    logger.info(f"✅ Заказ прошел все проверки")
    return ValidationResult(True, warning_message=warning)


def validate_chat_only(owned_courses: Set[int], active_chat: Optional[Dict], 
                       user_course_level: int) -> ValidationResult:
    """Проверка покупки только чата (Правила 5-6)"""
    logger.info("🔍 Правило 5: Покупка только чата")
    
    # Правило 6: Нельзя купить только чат без имеющегося курса
    if not owned_courses:
        logger.info("❌ Правило 6: Попытка купить чат без курса")
        return ValidationResult(False, "Для покупки чата необходимо иметь хотя бы один курс")
    
    chat_level = user_course_level  # Чат покупается на основе максимального уровня курса
    
    # Проверяем, есть ли уже активный чат такого же уровня
    if active_chat:
        if active_chat.get('chat_level') == chat_level:
            logger.info(f"❌ У пользователя уже есть активный чат уровня {chat_level}")
            return ValidationResult(False, f"У вас уже есть активный чат уровня {chat_level}")
        else:
            warning = f"Ваш текущий чат уровня {active_chat.get('chat_level')} будет заменен на чат уровня {chat_level}"
            logger.info(f"✅ Покупка только чата разрешена с заменой существующего")
            return ValidationResult(True, warning_message=warning)
    
    logger.info(f"✅ Покупка только чата разрешена (новый чат)")
    return ValidationResult(True)

# ============================================
# ОБНОВЛЕННАЯ ФУНКЦИЯ РАСЧЕТА ЦЕНЫ (ВСЕ ЦЕНЫ ИЗ SUPABASE)
# ============================================

def calculate_price(supabase, email: str, selected_course: Optional[str], 
                   has_chat: bool) -> Tuple[int, PriceBreakdown, bool]:
    """Рассчитывает сумму заказа с учетом имеющихся курсов и чата (все цены из Supabase)"""
    price_breakdown = PriceBreakdown()
    chat_will_be_deactivated = False
    
    # Покупка только чата
    if not selected_course and has_chat:
        return calculate_chat_only_price(supabase, email, price_breakdown)
    
    # Покупка курса (возможно с чатом)
    return calculate_course_price(supabase, email, selected_course, has_chat, price_breakdown)


def calculate_chat_only_price(supabase, email: str, price_breakdown: PriceBreakdown) -> Tuple[int, PriceBreakdown, bool]:
    """Расчет цены при покупке только чата (цена из Supabase)"""
    user_course_level = get_user_course_level(supabase, email)
    
    # Получаем цену чата из Supabase
    total_price = get_chat_price(supabase, user_course_level)
    
    # Проверяем, есть ли уже активный чат
    active_chat = get_user_chat_info(supabase, email)
    
    price_breakdown.chat_price = total_price
    price_breakdown.chat_status = 'замена' if active_chat else 'новый'
    price_breakdown.message = f"Покупка только чата уровня {user_course_level}"
    price_breakdown.total = total_price
    
    return total_price, price_breakdown, False


def calculate_course_price(supabase, email: str, selected_course: str, 
                          has_chat: bool, price_breakdown: PriceBreakdown) -> Tuple[int, PriceBreakdown, bool]:
    """Расчет цены при покупке курса (все цены из Supabase)"""
    purchased_course_level = get_course_level(selected_course)
    current_course_level = get_user_course_level(supabase, email)
    owned_courses = get_user_owned_courses(supabase, email)
    course_details = get_course_details(selected_course)
    
    # Получаем информацию о текущем чате
    current_chat_level, has_active_chat = get_current_chat_info(supabase, email)
    
    total_price = 0
    chat_will_be_deactivated = False
    
    # Получаем цену курса/пакета из Supabase
    course_full_price = get_course_price(supabase, selected_course)
    
    # Расчет стоимости курса с учетом уже имеющихся курсов
    purchased_courses = set(course_details.courses) if course_details else {purchased_course_level}
    new_courses = purchased_courses - owned_courses
    
    if new_courses:
        # Покупаются новые курсы
        if len(new_courses) == len(purchased_courses):
            # Покупается весь пакет целиком (все курсы новые)
            price_breakdown.course_price = course_full_price
            price_breakdown.message = f"Покупка полного пакета курсов уровня {purchased_course_level}. "
        else:
            # Покупается часть пакета (дополнительные курсы)
            # Используем полную цену пакета, так как у нас нет отдельных цен для каждого курса
            price_breakdown.course_price = course_full_price
            price_breakdown.course_discounted = False
            price_breakdown.message = f"Покупка дополнительных курсов {new_courses} из пакета. "
        
        total_price += course_full_price
    else:
        # Нет новых курсов для покупки
        price_breakdown.course_price = 0
        price_breakdown.course_discounted = True
        price_breakdown.message = f"Все курсы из набора уже есть. "
    
    # Расчет стоимости чата
    if has_chat:
        # Получаем цену чата из Supabase
        chat_price = get_chat_price(supabase, purchased_course_level)
        
        if not has_active_chat:
            # Новый чат
            total_price += chat_price
            price_breakdown.chat_price = chat_price
            price_breakdown.chat_status = 'новый'
            price_breakdown.message += f"Покупка нового чата уровня {purchased_course_level}. "
        elif current_chat_level != purchased_course_level:
            # Замена чата на другой уровень
            total_price += chat_price
            price_breakdown.chat_price = chat_price
            price_breakdown.chat_status = 'замена'
            price_breakdown.message += f"Замена чата с уровня {current_chat_level} на {purchased_course_level}. "
        else:
            # Чат того же уровня уже есть
            price_breakdown.chat_discounted = True
            price_breakdown.chat_status = 'без изменений'
            price_breakdown.message += f"Чат уровня {purchased_course_level} уже есть (бесплатно). "
    elif has_active_chat and purchased_course_level > current_course_level:
        # Если пользователь повышает уровень курса без покупки чата,
        # текущий чат деактивируется (так как он привязан к старому уровню)
        chat_will_be_deactivated = True
        price_breakdown.chat_status = 'отключение'
        price_breakdown.message += f"ВНИМАНИЕ: текущий чат уровня {current_chat_level} будет деактивирован! "
    
    price_breakdown.total = total_price
    return total_price, price_breakdown, chat_will_be_deactivated


def calculate_payment_amount(supabase, email: str, selected_course: Optional[str], 
                           has_chat: bool) -> int:
    """Рассчитывает сумму для платежа (все цены из Supabase)"""
    amount, _, _ = calculate_price(supabase, email, selected_course, has_chat)
    return amount

# ============================================
# ОБНОВЛЕНИЕ ДАННЫХ ПОСЛЕ ОПЛАТЫ
# ============================================

def update_chat_subscription(supabase, email: str, order_id: str, 
                            chat_level: int, has_chat: bool):
    """Обновляет или создает запись о чате пользователя"""
    try:
        now = datetime.now()
        
        existing = supabase.table('chat_subscription') \
            .select('*') \
            .eq('email', email) \
            .execute()
        
        if existing.data:
            update_existing_chat(supabase, existing.data[0], email, order_id, 
                               chat_level, has_chat, now)
        else:
            create_new_chat(supabase, email, order_id, chat_level, has_chat, now)
            
    except Exception as e:
        logger.error(f"⚠️ Ошибка при обновлении чата: {e}")

def update_existing_chat(supabase, chat_record: Dict, email: str, order_id: str,
                        chat_level: int, has_chat: bool, now: datetime):
    """Обновляет существующую запись чата"""
    subscription_id = chat_record['id']
    
    if has_chat:
        expires_at = now + timedelta(days=30)
        update_data = {
            'chat_level': chat_level,
            'order_id': order_id,
            'purchase_date': now.isoformat(),
            'expires_at': expires_at.isoformat(),
            'is_active': True,
            'days_remaining': 30,
            'updated_at': now.isoformat()
        }
        supabase.table('chat_subscription') \
            .update(update_data) \
            .eq('id', subscription_id) \
            .execute()
        logger.info(f"✅ Чат обновлен: уровень {chat_level}")
    else:
        update_data = {
            'is_active': False,
            'expires_at': now.isoformat(),
            'days_remaining': 0,
            'order_id': order_id,
            'updated_at': now.isoformat()
        }
        supabase.table('chat_subscription') \
            .update(update_data) \
            .eq('id', subscription_id) \
            .execute()
        logger.info(f"🔴 Чат деактивирован")

def create_new_chat(supabase, email: str, order_id: str, chat_level: int,
                   has_chat: bool, now: datetime):
    """Создает новую запись чата"""
    if has_chat:
        expires_at = now + timedelta(days=30)
        subscription_data = {
            'email': email,
            'order_id': order_id,
            'chat_level': chat_level,
            'purchase_date': now.isoformat(),
            'expires_at': expires_at.isoformat(),
            'is_active': True,
            'days_remaining': 30,
            'created_at': now.isoformat(),
            'updated_at': now.isoformat()
        }
        supabase.table('chat_subscription') \
            .insert(subscription_data) \
            .execute()
        logger.info(f"✅ Создана новая подписка на чат уровня {chat_level}")
    else:
        subscription_data = {
            'email': email,
            'order_id': order_id,
            'is_active': False,
            'expires_at': now.isoformat(),
            'days_remaining': 0,
            'created_at': now.isoformat(),
            'updated_at': now.isoformat()
        }
        supabase.table('chat_subscription') \
            .insert(subscription_data) \
            .execute()
        logger.info(f"📝 Создана неактивная запись о чате")

def update_user_rights(supabase, email: str, course_level: int, selected_course: Optional[str]):
    """Обновляет права пользователя на курсы"""
    if not selected_course:
        return
    
    try:
        rights_check = supabase.table('rights_for_course') \
            .select('*') \
            .eq('email', email) \
            .execute()
        
        if rights_check.data:
            current_level = rights_check.data[0].get('course_level', 0)
            if course_level > current_level:
                supabase.table('rights_for_course') \
                    .update({'course_level': course_level}) \
                    .eq('email', email) \
                    .execute()
                logger.info(f"✅ Права на курс обновлены до уровня {course_level}")
        else:
            rights_data = {
                'email': email,
                'course_level': course_level
            }
            supabase.table('rights_for_course').insert(rights_data).execute()
            logger.info(f"✅ Права на курс созданы: уровень {course_level}")
    except Exception as e:
        logger.error(f"⚠️ Ошибка при обновлении прав: {e}")

def create_user_if_not_exists(supabase, email: str, now: datetime):
    """Создает пользователя если его нет"""
    try:
        user_check = supabase.table('users') \
            .select('*') \
            .eq('email', email) \
            .execute()
        
        if not user_check.data:
            user_data = {
                'email': email,
                'first_seen': now.isoformat()
            }
            supabase.table("users").insert(user_data).execute()
            logger.info(f"✅ Пользователь создан в users")
    except Exception as e:
        logger.error(f"⚠️ Ошибка при создании пользователя: {e}")

def create_order(supabase, email: str, selected_course: Optional[str], 
                has_chat: bool, amount: int, now: datetime) -> Optional[str]:
    """Создает запись о заказе"""
    try:
        order_data = {
            'email': email,
            'product': selected_course if selected_course else 'chat_only',
            'includes_chat': has_chat,
            'status': 'completed',
            'amount': amount,
            'date': now.isoformat()
        }
        
        order_result = supabase.table('orders').insert(order_data).execute()
        logger.info(f"✅ Заказ создан в orders")
        return order_result.data[0]['id'] if order_result.data else None
    except Exception as e:
        logger.error(f"⚠️ Ошибка при создании заказа: {e}")
        return None

def check_existing_order(supabase, email: str, selected_course: Optional[str], 
                        payment_id: str) -> Optional[str]:
    """Проверяет, не был ли уже создан заказ"""
    try:
        order_check = supabase.table('orders') \
            .select('*') \
            .eq('email', email) \
            .eq('product', selected_course if selected_course else 'chat_only') \
            .eq('status', 'completed') \
            .order('date', desc=True) \
            .limit(1) \
            .execute()
        
        if order_check.data:
            return order_check.data[0]['id']
    except Exception as e:
        logger.error(f"⚠️ Ошибка при проверке заказа: {e}")
    
    return None

def create_payment_record(supabase, payment_id: str, email: str, 
                         selected_course: Optional[str], has_chat: bool, 
                         amount: int) -> Dict:
    """Создает запись о платеже в БД"""
    payment_data = {
        'id': payment_id,
        'email': email,
        'selected_course': selected_course,
        'has_chat': has_chat,
        'amount_total': amount,
        'currency': 'usd',
        'status': 'pending',
        'metadata': json.dumps({
            'course': selected_course,
            'has_chat': has_chat
        }),
        'created_at': datetime.now().isoformat()
    }
    
    supabase.table('payments').insert(payment_data).execute()
    logger.info(f"✅ Запись о платеже {payment_id} создана в Supabase (pending)")
    return payment_data

def find_payment_record(supabase, payment_intent_id: str, payment_id: Optional[str]) -> Optional[Dict]:
    """Находит запись о платеже"""
    # Ищем по payment_intent_id
    payment_response = supabase.table('payments') \
        .select('*') \
        .eq('stripe_payment_intent_id', payment_intent_id) \
        .execute()
    
    if payment_response.data:
        return payment_response.data[0]
    
    # Если не нашли, ищем по payment_id из metadata
    if payment_id:
        payment_response = supabase.table('payments') \
            .select('*') \
            .eq('id', payment_id) \
            .execute()
        
        if payment_response.data:
            return payment_response.data[0]
    
    return None

def update_payment_status(supabase, payment_id: str, intent: Any, now: datetime):
    """Обновляет статус платежа"""
    supabase.table('payments') \
        .update({
            'status': 'completed',
            'amount_received': intent.amount_received,
            'paid_at': now.isoformat(),
            'updated_at': now.isoformat()
        }) \
        .eq('id', payment_id) \
        .execute()
    logger.info(f"✅ Статус платежа обновлен на completed")

def process_successful_payment(supabase, payment: Dict, intent: Any, email: str) -> Dict:
    """Обрабатывает успешный платеж и создает все необходимые записи"""
    now = datetime.now()
    payment_id = payment['id']
    selected_course = payment['selected_course']
    has_chat = payment['has_chat']
    
    logger.info(f"\n🕐 Начинаем создание данных в {now.isoformat()}")
    
    # 1. Обновляем статус платежа
    update_payment_status(supabase, payment_id, intent, now)
    
    # 2. Создаем пользователя если его нет
    create_user_if_not_exists(supabase, email, now)
    
    # 3. Создаем заказ
    order_db_id = create_order(supabase, email, selected_course, has_chat, 
                              payment['amount_total'], now)
    
    # 4. Обновляем права на курс
    course_level = get_course_level(selected_course) if selected_course else get_user_course_level(supabase, email)
    update_user_rights(supabase, email, course_level, selected_course)
    
    # 5. Обновляем чат
    update_chat_subscription(supabase, email, str(order_db_id) if order_db_id else payment_id, 
                           course_level, has_chat)
    
    # 6. Отправляем email о успешной покупке
    order_data = {
        'order_id': order_db_id,
        'payment_id': payment_id,
        'email': email,
        'product': selected_course if selected_course else 'chat_only',
        'has_chat': has_chat,
        'amount': payment['amount_total'],
        'course_level': course_level,
        'chat_level': course_level if has_chat else None
    }
    send_success_email(email, order_data)
    
    # 7. Отправляем уведомление администратору
    send_admin_notification(order_data)
    
    logger.info(f"\n✅ Все данные успешно созданы и уведомления отправлены!")
    
    return {
        'status': 'success',
        'message': 'Payment confirmed and access activated',
        'payment_id': payment_id,
        'order_id': order_db_id,  # УБЕДИТЕСЬ, ЧТО ЭТО ПОЛЕ ЕСТЬ
        'course_level': course_level,
        'has_chat': has_chat
    }

# ============================================
# VIEWS
# ============================================
@csrf_exempt
@require_POST
def order_handler(request):
    """
    Только проверяет заказ и возвращает информацию для оплаты
    """
    try:
        data = json.loads(request.body)
        
        email = data.get('email')
        selected_course = data.get('selected_course')
        has_chat = data.get('has_chat', False)
        
        if not email:
            return JsonResponse({
                'status': 'error',
                'error': 'Email is required'
            }, status=400)
        
        # Проверка прав на покупку
        supabase = get_supabase_client()
        
        validation_result = validate_order(supabase, email, selected_course, has_chat)
        
        if not validation_result.is_valid:
            # Возвращаем более информативную ошибку
            return JsonResponse({
                'status': 'error',
                'error': validation_result.error_message,
                'debug': {
                    'email': email,
                    'selected_course': selected_course,
                    'has_chat': has_chat,
                    'user_course_level': get_user_course_level(supabase, email),
                    'owned_courses': sorted(list(get_user_owned_courses(supabase, email)))
                }
            }, status=403)
        
        logger.info(f"✅ Проверка заказа пройдена для {email}")
        if validation_result.warning_message:
            logger.info(f"⚠️ Предупреждение: {validation_result.warning_message}")
        
        # Рассчитываем цену (все цены из Supabase)
        amount, price_details, chat_deactivated = calculate_price(supabase, email, selected_course, has_chat)
        
        # ПОЛУЧАЕМ DISCORD INVITE (если есть курс)
        discord_invite = None
        discord_error = None
        if selected_course:
            course_level = get_course_level(selected_course)
            try:
                discord_invite = get_discord_invite(email, course_level)
                if not discord_invite:
                    discord_error = "Не удалось получить ссылку Discord"
            except Exception as e:
                discord_error = str(e)
                logger.error(f"Ошибка получения discord invite: {e}")
        
        response_data = {
            'status': 'success',
            'message': 'Order validation passed',
            'email': email,
            'selected_course': selected_course,
            'has_chat': has_chat,
            'amount': amount,
            'amount_display': f'${amount / 100:.2f}',
            'warning': validation_result.warning_message,
            'price_details': {
                'course_price': price_details.course_price,
                'chat_price': price_details.chat_price,
                'course_discounted': price_details.course_discounted,
                'chat_discounted': price_details.chat_discounted,
                'message': price_details.message,
                'chat_status': price_details.chat_status,
                'total': price_details.total
            },
            'chat_will_be_deactivated': chat_deactivated,
            # ДОБАВЛЯЕМ DISCORD ИНФОРМАЦИЮ
            'discord_invite': discord_invite,
            'discord_error': discord_error
        }
        
        return JsonResponse(response_data)
        
    except json.JSONDecodeError:
        return JsonResponse({'status': 'error', 'error': 'Invalid JSON'}, status=400)
    except ValueError as e:
        # Ошибка получения цены из Supabase
        return JsonResponse({'status': 'error', 'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"Ошибка в order_handler: {e}")
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'error': str(e)}, status=500)

def pay_temp(request):
    """Страница оплаты с передачей Stripe publishable key"""
    context = {
        'stripe_publishable_key': settings.STRIPE_PUBLISHABLE_KEY,
    }
    return render(request, 'frontend/pay_template.html', context)

def index(request):
    """Главная страница с фронтендом"""
    return render(request, 'frontend/home.html')

@csrf_exempt
@require_POST
def create_payment_intent(request):
    """
    Создает Payment Intent для Stripe
    """
    try:
        data = json.loads(request.body)
        
        email = data.get('email')
        selected_course = data.get('selected_course')
        has_chat = data.get('has_chat', False)
        
        if not email:
            return JsonResponse({'status': 'error', 'error': 'Email is required'}, status=400)
        
        supabase = get_supabase_client()
        
        # Проверяем заказ
        validation_result = validate_order(supabase, email, selected_course, has_chat)
        if not validation_result.is_valid:
            return JsonResponse({'status': 'error', 'error': validation_result.error_message}, status=403)
        
        # Рассчитываем сумму (все цены из Supabase)
        amount = calculate_payment_amount(supabase, email, selected_course, has_chat)
        
        if amount <= 0:
            return JsonResponse({'status': 'error', 'error': 'Invalid amount'}, status=400)
        
        # Создаем запись о платеже
        payment_id = str(uuid.uuid4())
        payment_data = create_payment_record(supabase, payment_id, email, selected_course, 
                                           has_chat, amount)
        
        # Создаем Payment Intent в Stripe
        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency='usd',
            automatic_payment_methods={'enabled': True},
            metadata={
                'payment_id': payment_id,
                'email': email,
                'course': selected_course or '',
                'has_chat': str(has_chat)
            },
            receipt_email=email,
        )
        
        # Обновляем запись с payment_intent_id
        supabase.table('payments') \
            .update({'stripe_payment_intent_id': intent.id}) \
            .eq('id', payment_id) \
            .execute()
        
        return JsonResponse({
            'status': 'success',
            'client_secret': intent.client_secret,
            'payment_id': payment_id,
            'amount': amount,
            'amount_display': f'${amount / 100:.2f}'
        })
        
    except stripe.error.StripeError as e:
        return JsonResponse({'status': 'error', 'error': str(e)}, status=400)
    except ValueError as e:
        # Ошибка получения цены из Supabase
        return JsonResponse({'status': 'error', 'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"Ошибка в create_payment_intent: {e}")
        return JsonResponse({'status': 'error', 'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def confirm_payment(request):
    """
    Подтверждает успешный платеж и создает/обновляет данные во всех таблицах
    """
    try:
        data = json.loads(request.body)
        payment_intent_id = data.get('payment_intent_id')
        
        if not payment_intent_id:
            return JsonResponse({'status': 'error', 'error': 'Payment intent ID is required'}, status=400)
        
        logger.info(f"\n🔔 ========== CONFIRM PAYMENT CALLED ==========")
        logger.info(f"📝 Payment Intent ID: {payment_intent_id}")
        
        # Получаем информацию о платеже из Stripe
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        email = intent.metadata.get('email')
        
        if intent.status != 'succeeded':
            # Отправляем email о неудачной покупке
            error_data = {
                'email': email,
                'error_message': f'Payment not successful. Status: {intent.status}',
                'product': intent.metadata.get('course'),
                'has_chat': intent.metadata.get('has_chat') == 'True',
                'amount': intent.amount
            }
            send_failure_email(email, error_data)
            
            return JsonResponse({
                'status': 'error',
                'error': f'Payment not successful. Status: {intent.status}'
            }, status=400)
        
        # Получаем запись о платеже из Supabase
        supabase = get_supabase_client()
        payment = find_payment_record(supabase, payment_intent_id, intent.metadata.get('payment_id'))
        
        if not payment:
            return JsonResponse({'status': 'error', 'error': 'Payment not found'}, status=404)
        
        # Проверяем, не был ли уже создан заказ
        existing_order_id = check_existing_order(supabase, email, payment['selected_course'], payment['id'])
        if existing_order_id:
            logger.info(f"⚠️ Заказ уже существует для этого платежа")
            
            # ПОЛУЧАЕМ DISCORD INVITE ДЛЯ СУЩЕСТВУЮЩЕГО ЗАКАЗА
            discord_invite = None
            discord_error = None
            if payment['selected_course']:
                course_level = get_course_level(payment['selected_course'])
                try:
                    discord_invite = get_discord_invite(email, course_level, order_id=existing_order_id)
                    if not discord_invite:
                        discord_error = "Не удалось получить ссылку Discord"
                except Exception as e:
                    discord_error = str(e)
            
            return JsonResponse({
                'status': 'success',
                'message': 'Order already created',
                'payment_id': payment['id'],
                'order_id': existing_order_id,
                'discord_invite_url': discord_invite,
                'discord_error': discord_error
            })
        
        # Создаем все необходимые записи
        result = process_successful_payment(supabase, payment, intent, email)
        
        # ПОЛУЧАЕМ DISCORD INVITE ДЛЯ НОВОГО ЗАКАЗА
        discord_invite = None
        discord_error = None
        if payment['selected_course']:
            course_level = get_course_level(payment['selected_course'])
            try:
                discord_invite = get_discord_invite(email, course_level, order_id=result.get('order_id'))
                if not discord_invite:
                    discord_error = "Не удалось получить ссылку Discord"
            except Exception as e:
                discord_error = str(e)
        
        # Добавляем discord информацию в результат
        result['discord_invite_url'] = discord_invite
        result['discord_error'] = discord_error
        
        return JsonResponse(result)
        
    except stripe.error.StripeError as e:
        logger.error(f"❌ Stripe ошибка: {e}")
        return JsonResponse({'status': 'error', 'error': str(e)}, status=400)
    except Exception as e:
        logger.error(f"❌ Общая ошибка: {e}")
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'error': str(e)}, status=500)
    
@csrf_exempt
def stripe_webhook(request):
    """
    Обработчик webhook от Stripe для асинхронных событий
    """
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return JsonResponse({'status': 'error', 'error': 'Invalid payload'}, status=400)
    except stripe.error.SignatureVerificationError:
        return JsonResponse({'status': 'error', 'error': 'Invalid signature'}, status=400)
    
    # Обрабатываем события
    if event['type'] == 'payment_intent.succeeded':
        handle_payment_succeeded(event)
    elif event['type'] == 'payment_intent.payment_failed':
        handle_payment_failed(event)
    
    return JsonResponse({'status': 'success'})

def handle_payment_succeeded(event):
    """Обрабатывает успешный платеж"""
    intent = event['data']['object']
    payment_intent_id = intent['id']
    
    try:
        supabase = get_supabase_client()
        
        payment_response = supabase.table('payments') \
            .select('*') \
            .eq('stripe_payment_intent_id', payment_intent_id) \
            .execute()
        
        if payment_response.data:
            payment = payment_response.data[0]
            
            if payment['status'] != 'completed':
                now = datetime.now().isoformat()
                
                supabase.table('payments') \
                    .update({
                        'status': 'completed',
                        'amount_received': intent['amount_received'],
                        'paid_at': now,
                        'updated_at': now
                    }) \
                    .eq('id', payment['id']) \
                    .execute()
                
                logger.info(f"✅ Webhook: статус платежа {payment['id']} обновлен на completed")
                
    except Exception as e:
        logger.error(f"⚠️ Webhook ошибка: {e}")

def handle_payment_failed(event):
    """Обрабатывает неудачный платеж и отправляет email"""
    intent = event['data']['object']
    payment_intent_id = intent['id']
    email = intent.get('receipt_email') or intent.get('metadata', {}).get('email')
    
    try:
        supabase = get_supabase_client()
        
        payment_response = supabase.table('payments') \
            .select('*') \
            .eq('stripe_payment_intent_id', payment_intent_id) \
            .execute()
        
        if payment_response.data:
            payment = payment_response.data[0]
            
            error_message = intent.get('last_payment_error', {}).get('message', 'Unknown error')
            
            supabase.table('payments') \
                .update({
                    'status': 'failed',
                    'error_message': error_message,
                    'updated_at': datetime.now().isoformat()
                }) \
                .eq('id', payment['id']) \
                .execute()
            
            logger.info(f"⚠️ Webhook: платеж {payment['id']} отмечен как failed")
            
            # Отправляем email о неудачной покупке
            if email:
                error_data = {
                    'email': email,
                    'error_message': error_message,
                    'product': payment.get('selected_course'),
                    'has_chat': payment.get('has_chat', False),
                    'amount': payment.get('amount_total')
                }
                send_failure_email(email, error_data)
            
    except Exception as e:
        logger.error(f"⚠️ Webhook ошибка: {e}")

@csrf_exempt
def test_validation(request):
    """Тестовый endpoint для проверки валидации"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            email = data.get('email')
            selected_course = data.get('selected_course')
            has_chat = data.get('has_chat', False)
            
            if not email:
                return JsonResponse({'error': 'Email is required'}, status=400)
            
            supabase = get_supabase_client()
            
            # Получаем информацию о пользователе
            user_course_level = get_user_course_level(supabase, email)
            owned_courses = get_user_owned_courses(supabase, email)
            active_chat = get_user_chat_info(supabase, email)
            
            # Проверяем заказ
            validation_result = validate_order(supabase, email, selected_course, has_chat)
            
            # Детальная информация для отладки
            debug_info = {
                'email': email,
                'selected_course': selected_course,
                'has_chat': has_chat,
                'user_course_level': user_course_level,
                'owned_courses': sorted(list(owned_courses)),
                'has_active_chat': active_chat is not None,
                'active_chat_level': active_chat.get('chat_level') if active_chat else None,
                'validation': {
                    'is_valid': validation_result.is_valid,
                    'error': validation_result.error_message,
                    'warning': validation_result.warning_message
                }
            }
            
            if not validation_result.is_valid:
                return JsonResponse({
                    'status': 'error',
                    'error': validation_result.error_message,
                    'debug': debug_info
                }, status=403)
            
            # Рассчитываем цену (все цены из Supabase)
            amount, price_details, chat_deactivated = calculate_price(supabase, email, selected_course, has_chat)
            
            return JsonResponse({
                'status': 'success',
                'message': 'Order validation passed',
                'amount': amount,
                'amount_display': f'${amount/100:.2f}',
                'warning': validation_result.warning_message,
                'price_details': {
                    'course_price': price_details.course_price,
                    'chat_price': price_details.chat_price,
                    'course_discounted': price_details.course_discounted,
                    'chat_discounted': price_details.chat_discounted,
                    'message': price_details.message,
                    'chat_status': price_details.chat_status,
                    'total': price_details.total
                },
                'debug': debug_info
            })
            
        except Exception as e:
            logger.error(f"Ошибка в test_validation: {e}")
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)

@csrf_exempt
def test_check(request):
    """Тестовый endpoint для проверки прав"""
    if request.method == 'GET':
        email = request.GET.get('email')
        course = request.GET.get('course')
        chat = request.GET.get('chat', 'false').lower() == 'true'
        
        supabase = get_supabase_client()
        
        result = validate_order(supabase, email, course, chat)
        
        return JsonResponse({
            'is_valid': result.is_valid,
            'error': result.error_message,
            'warning': result.warning_message,
            'email': email,
            'course': course,
            'chat': chat
        })
    
@csrf_exempt
@require_POST
def test_email(request):
    """Тестовый endpoint для проверки отправки email"""
    try:
        data = json.loads(request.body)
        email = data.get('email')
        test_type = data.get('type', 'success')  # 'success' или 'failure'
        
        if not email:
            return JsonResponse({'error': 'Email is required'}, status=400)
        
        # Получаем цены из Supabase для тестовых данных
        supabase = get_supabase_client()
        
        if test_type == 'success':
            # Тестовые данные для успешной покупки
            test_order = {
                'order_id': 'TEST-123456',
                'payment_id': 'TEST-PAY-123456',
                'email': email,
                'product': 'package123',
                'has_chat': True,
                'amount': get_product_price(supabase, 'package123') if get_product_price else 2999,
                'course_level': 3,
                'chat_level': 3
            }
            send_success_email(email, test_order)
            message = 'Тестовое письмо об успешной покупке отправлено'
        else:
            # Тестовые данные для неудачной покупки
            test_error = {
                'email': email,
                'error_message': 'Недостаточно средств на карте',
                'product': 'package12',
                'has_chat': False,
                'amount': get_product_price(supabase, 'package12') if get_product_price else 1999
            }
            send_failure_email(email, test_error)
            message = 'Тестовое письмо о неудачной покупке отправлено'
        
        return JsonResponse({
            'status': 'success',
            'message': message,
            'email': email,
            'type': test_type
        })
        
    except Exception as e:
        logger.error(f"Ошибка в test_email: {e}")
        return JsonResponse({'error': str(e)}, status=500)

# Добавьте эту функцию в конец файла views.py перед закрывающей скобкой

@csrf_exempt
def get_product_prices(request):
    """
    Возвращает цены для всех товаров
    """
    try:
        print(f"🔍 get_product_prices called with method: {request.method}")
        print(f"🔍 Headers: {request.headers}")
        
        supabase = get_supabase_client()
        print(f"🔍 Supabase client created")
        
        # Проверяем подключение к Supabase
        try:
            # Тестовый запрос для проверки подключения
            test_response = supabase.table('products').select('count', count='exact').execute()
            print(f"🔍 Supabase connection test: {test_response}")
        except Exception as e:
            print(f"❌ Supabase connection error: {e}")
            return JsonResponse({
                'status': 'error', 
                'error': f'Supabase connection failed: {str(e)}'
            }, status=500)
        
        # Получаем все товары
        response = supabase.table('products') \
            .select('product_code, price, old_price') \
            .execute()
        
        print(f"🔍 Supabase response: {response}")
        print(f"🔍 Response data: {response.data}")
        
        if not response.data:
            print("❌ No products found in database")
            return JsonResponse({
                'status': 'error', 
                'error': 'Products not found'
            }, status=404)
        
        # Формируем словарь с ценами
        prices = {}
        for product in response.data:
            prices[product['product_code']] = {
                'price': product['price'],
                'old_price': product.get('old_price', 0)
            }
        
        print(f"✅ Prices loaded successfully: {prices}")
        
        return JsonResponse({
            'status': 'success',
            'prices': prices
        })
        
    except Exception as e:
        print(f"❌ Error in get_product_prices: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'status': 'error', 
            'error': str(e)
        }, status=500)

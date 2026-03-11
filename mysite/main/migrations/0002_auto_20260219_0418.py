# main/migrations/0002_auto_20260219_0418.py
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('main', '0001_initial'),  # Укажите правильную предыдущую миграцию
    ]

    operations = [
        # Для SQLite удаляем таблицы без CASCADE
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS main_courseaccess;',
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            sql='DROP TABLE IF EXISTS main_payment;',
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
from django.urls import path
from . import views

# urlpatterns = [
#     path('', views.index, name='home'),
#     path('pay/', views.pay_temp, name='pay'),
#     path('api/order-handler/', views.order_handler, name='order-handler'),
#     path('api/create-payment-intent/', views.create_payment_intent, name='create-payment-intent'),
#     path('api/confirm-payment/', views.confirm_payment, name='confirm-payment'),
#     path('api/stripe-webhook/', views.stripe_webhook, name='stripe-webhook'),

#     path('api/test-check/', views.test_check, name='test-check'),
# ]

from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='home'),
    path('pay/', views.pay_temp, name='pay'),
    path('api/order-handler/', views.order_handler, name='order-handler'),
    path('api/create-payment-intent/', views.create_payment_intent, name='create-payment-intent'),
    path('api/confirm-payment/', views.confirm_payment, name='confirm-payment'),
    path('api/stripe-webhook/', views.stripe_webhook, name='stripe-webhook'),
    path('api/test-check/', views.test_check, name='test-check'),
    
    path('api/product-prices/', views.get_product_prices, name='product-prices'),
]

'''

curl -X OPTIONS http://127.0.0.1:8000/api/create-payment-intent/ \-H "Origin: http://localhost:3000" \-H "Access-Control-Request-Method: POST" \-v

'''
// ============================================
// CONSTANTS AND CONFIGURATION
// ============================================
const API_CONFIG = {
    BASE_URL: window.API_BASE_URL || 'http://127.0.0.1:8000',
    ENDPOINTS: {
        CREATE_ORDER: '/api/order-handler/',
        CREATE_PAYMENT_INTENT: '/api/create-payment-intent/',
        CONFIRM_PAYMENT: '/api/confirm-payment/',
    }
};

const OPTION_LABELS = {
    'course1': 'Course 1',
    'course2': 'Course 2',
    'course3': 'Course 3',
    'package123': 'Package 1/2/3 (all courses)',
    'package12': 'Package 1/2 (courses 1 and 2)',
    'package23': 'Package 2/3 (courses 2 and 3)',
    'chat': 'Chat access'
};

const VALIDATION_MESSAGES = {
    EMAIL_REQUIRED: 'Please enter a valid email',
    COURSE_REQUIRED: 'Please select a course or package'
};

// ============================================
// DOM ELEMENTS
// ============================================
const DOM = {
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    step3payment: document.getElementById('step3-payment'),
    step4success: document.getElementById('step4-success'),
    buyBtn: document.getElementById('buyBtn'),
    submitBtn: document.getElementById('submitBtn'),
    backBtn: document.getElementById('backBtn'),
    backToSelectionBtn: document.getElementById('backToSelectionBtn'),
    emailInput: document.getElementById('email'),
    courseSelect: document.getElementById('courseSelect'),
    chatCheckbox: document.getElementById('chat'),
    emailError: document.getElementById('emailError'),
    selectError: document.getElementById('selectError'),
    discordLink: document.getElementById('discordLink'),
    orderDetails: document.getElementById('orderDetails'),
    selectedOptionsDiv: document.getElementById('selectedOptions'),
    successMessage: document.querySelector('.success-message'),
    // Price display elements removed
    paymentTotal: document.getElementById('paymentTotal'),
    paymentOrderDetails: document.getElementById('paymentOrderDetails'),
    paymentForm: document.getElementById('payment-form'),
    paymentElement: document.getElementById('payment-element'),
    paymentMessage: document.getElementById('payment-message'),
    payButton: document.getElementById('pay-button'),
    buttonText: document.getElementById('button-text'),
    spinner: document.getElementById('spinner'),
};

// Save original button text
const BUTTON_ORIGINAL_TEXT = {
    submitBtn: 'Proceed to payment',
    payButton: 'Pay'
};

// ============================================
// APPLICATION STATE
// ============================================
const AppState = {
    userData: {
        selectedCourse: '',
        hasChat: false,
        email: '',
        timestamp: null,
        orderId: null
    },
    
    currentOrderElement: null,
    stripe: null,
    elements: null,
    paymentIntentId: null,
    clientSecret: null,
    
    reset() {
        this.userData = {
            selectedCourse: '',
            hasChat: false,
            email: '',
            timestamp: null,
            orderId: null
        };
        this.currentOrderElement = null;
        this.paymentIntentId = null;
        this.clientSecret = null;
    },
    
    update(data) {
        Object.assign(this.userData, data);
        if (!this.userData.timestamp) {
            this.userData.timestamp = new Date().toISOString();
        }
    }
};

// ============================================
// UTILITIES
// ============================================
const Utils = {
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    showError(element, errorElement, message) {
        element.style.borderColor = '#ff4757';
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    },
    
    hideError(element, errorElement) {
        element.style.borderColor = '#e0e0e0';
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    },
    
    fadeIn(element) {
        setTimeout(() => {
            element.classList.add('fade-in');
        }, 10);
    },
    
    async withLoading(button, callback) {
        const originalText = button.textContent;
        button.textContent = 'Sending...';
        button.disabled = true;
        
        try {
            return await callback();
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    },
    
    // Remove previous order elements
    removePreviousOrderElements() {
        // Remove old order information
        const existingOrderInfo = DOM.successMessage.nextElementSibling;
        if (existingOrderInfo && 
            (existingOrderInfo.classList?.contains('order-info') || 
             existingOrderInfo.querySelector?.('[data-order-info]'))) {
            existingOrderInfo.remove();
        }
        
        // Remove previous order element if it exists
        if (AppState.currentOrderElement && AppState.currentOrderElement.parentNode) {
            AppState.currentOrderElement.remove();
            AppState.currentOrderElement = null;
        }
        
        // Clear order details
        DOM.orderDetails.innerHTML = '';
        
        // Reset Discord link to placeholder
        DOM.discordLink.innerHTML = `
            <div style="text-align: center;">
                <strong>Discord link will appear here</strong><br>
                <span style="font-size: 12px;">(will be inserted automatically by the bot)</span>
            </div>
        `;
    }
};

// ============================================
// FORM VALIDATION
// ============================================
const FormValidator = {
    validateForm() {
        console.log('🔍 validateForm called');
        let isValid = true;
        
        // Email validation
        if (!Utils.validateEmail(AppState.userData.email)) {
            Utils.showError(DOM.emailInput, DOM.emailError, VALIDATION_MESSAGES.EMAIL_REQUIRED);
            isValid = false;
        } else {
            Utils.hideError(DOM.emailInput, DOM.emailError);
        }
        
        // Course selection validation
        if (!AppState.userData.selectedCourse) {
            Utils.showError(DOM.courseSelect, DOM.selectError, VALIDATION_MESSAGES.COURSE_REQUIRED);
            isValid = false;
        } else {
            Utils.hideError(DOM.courseSelect, DOM.selectError);
        }
        
        return isValid;
    },
    
    collectFormData() {
        return {
            selectedCourse: DOM.courseSelect.value || '',
            hasChat: DOM.chatCheckbox.checked,
            email: DOM.emailInput.value.trim()
        };
    },
};

// ============================================
// STEP MANAGEMENT
// ============================================
const StepManager = {
    showStep(stepToShow, stepToHide = null) {
        if (stepToHide) {
            stepToHide.classList.add('hidden');
            stepToHide.classList.remove('fade-in');
        }
        
        stepToShow.classList.remove('hidden');
        Utils.fadeIn(stepToShow);
    },
    
    goToStep1() {
        // Completely clear all states and elements before returning to home
        this.cleanupBeforeStep1();
        this.showStep(DOM.step1, DOM.step4success);
    },
    
    // New method for complete cleanup before step 1
    cleanupBeforeStep1() {
        // 1. Reset form
        FormManager.reset();
        
        // 2. Remove all order elements from DOM
        const orderElements = document.querySelectorAll('[data-order-info], .current-order-container, .order-info');
        orderElements.forEach(element => element.remove());
        
        // 3. Clear order details block
        if (DOM.orderDetails) {
            DOM.orderDetails.innerHTML = '';
        }
        
        // 4. Hide selectedOptions block
        if (DOM.selectedOptionsDiv) {
            DOM.selectedOptionsDiv.style.display = 'none';
        }
        
        // 5. Reset Discord link to placeholder
        if (DOM.discordLink) {
            DOM.discordLink.innerHTML = `
                <div style="text-align: center;">
                    <strong>Discord link will appear here</strong><br>
                    <span style="font-size: 12px;">(will be inserted automatically by the bot)</span>
                </div>
            `;
        }
        
        // 6. Completely reset application state
        AppState.reset();
        
        // 7. Remove current order element from AppState
        AppState.currentOrderElement = null;
        
        // 8. Reset Stripe elements if they exist
        if (AppState.elements) {
            AppState.elements = null;
        }
        if (AppState.stripe) {
            AppState.stripe = null;
        }
        AppState.clientSecret = null;
        AppState.paymentIntentId = null;
        
        console.log('🧹 Complete cleanup before returning to home completed');
    },
    
    goToStep2() {
        // Completely reset the "Proceed to payment" button state
        DOM.submitBtn.disabled = false;
        DOM.submitBtn.textContent = BUTTON_ORIGINAL_TEXT.submitBtn;
        
        // Hide all errors if any
        DOM.emailError.style.display = 'none';
        DOM.selectError.style.display = 'none';
        DOM.emailInput.style.borderColor = '#e0e0e0';
        DOM.courseSelect.style.borderColor = '#e0e0e0';
        
        this.showStep(DOM.step2, DOM.step1);
    },
    
    goToStep3() {
        // Remove previous elements before showing new order
        Utils.removePreviousOrderElements();
        this.showStep(DOM.step3, DOM.step2);
    },
    
    goToStep3Payment() {
        // Reset payment button state
        DOM.payButton.disabled = false;
        DOM.buttonText.textContent = BUTTON_ORIGINAL_TEXT.payButton;
        DOM.buttonText.style.display = 'inline';
        DOM.spinner.style.display = 'none';
        DOM.paymentMessage.style.display = 'none';
        
        this.showStep(DOM.step3payment, DOM.step2);
    },
    
    goToStep4Success() {
        this.showStep(DOM.step4success, DOM.step3payment);
    }
};

// ============================================
// FORM MANAGEMENT
// ============================================
const FormManager = {
    reset() {
        DOM.courseSelect.value = '';
        DOM.chatCheckbox.checked = false;
        DOM.emailInput.value = '';
        
        Utils.hideError(DOM.emailInput, DOM.emailError);
        Utils.hideError(DOM.courseSelect, DOM.selectError);
        
        AppState.reset();
        DOM.selectedOptionsDiv.style.display = 'none';
    },
    
    // New method for complete reset
    fullReset() {
        this.reset();
        
        // Additional DOM element cleanup
        const orderElements = document.querySelectorAll('[data-order-info], .current-order-container, .order-info');
        orderElements.forEach(element => element.remove());
        
        if (DOM.orderDetails) {
            DOM.orderDetails.innerHTML = '';
        }
        
        if (DOM.discordLink) {
            DOM.discordLink.innerHTML = `
                <div style="text-align: center;">
                    <strong>Discord link will appear here</strong><br>
                    <span style="font-size: 12px;">(will be inserted automatically by the bot)</span>
                </div>
            `;
        }
    },
    
    // Price display update method removed
    
    submit() {
        const formData = FormValidator.collectFormData();
        AppState.update(formData);
        
        if (!FormValidator.validateForm()) {
            return;
        }
        
        // First check permissions through order-handler
        FormManager.sendOrder();
    },
    
    async sendOrder() {
        await Utils.withLoading(DOM.submitBtn, async () => {
            try {
                console.log('📤 Sending data:', AppState.userData);
                
                const orderResult = await OrderService.submitOrder(AppState.userData);
                console.log('📥 Send result:', orderResult);
                
                if (orderResult.success) {
                    this.handleSuccess(orderResult);
                } else {
                    this.handleError(orderResult);
                }
                
            } catch (error) {
                console.error('❌ Error:', error);
                this.handleError({ error: error.message });
            }
        });
    },
    
    handleSuccess(orderResult) {
        // Update state with response data
        if (orderResult.data) {
            AppState.update({ 
                orderId: orderResult.data.id,
                discordInvite: orderResult.data.discord_invite
            });
        }
        
        // Proceed to payment
        console.log('🔄 Proceeding to payment');
        PaymentManager.initiatePayment();
    },
    
    handleError(orderResult) {
        const errorMsg = orderResult?.error || orderResult?.message || 'Unknown error';
        alert('Error creating order: ' + errorMsg);
    }
};

// ============================================
// ORDER DISPLAY
// ============================================
const OrderDisplay = {
    showCurrentOrder(orderData) {
        // Create container for current order
        const orderContainer = document.createElement('div');
        orderContainer.className = 'current-order-container';
        orderContainer.dataset.orderId = orderData.id;
        
        // Order information
        const orderInfo = this.createOrderInfo(orderData);
        
        // Order details
        const orderDetails = this.createOrderDetails();
        
        // Discord link
        const discordSection = this.createDiscordSection(orderData);
        
        // Assemble everything
        orderContainer.appendChild(orderInfo);
        orderContainer.appendChild(orderDetails);
        orderContainer.appendChild(discordSection);
        
        // Add after the success message header
        DOM.successMessage.after(orderContainer);
        
        // Save reference to current order element
        AppState.currentOrderElement = orderContainer;
    },
    
    createOrderInfo(orderData) {
        const orderInfo = document.createElement('div');
        orderInfo.className = 'order-info';
        orderInfo.dataset.orderInfo = 'true';
        
        const statusIcon = orderData.discord_invite ? '✅' : '⚠️';
        const statusText = orderData.discord_invite ? 
            'Discord link ready!' : 
            'Discord link not generated';
        const statusColor = orderData.discord_invite ? '#4cd137' : '#ffa502';
        
        orderInfo.innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <p style="color: #666; font-size: 14px; margin-bottom: 5px;">
                    <strong>Order number:</strong> 
                    <span style="color: #333; font-weight: bold;">${orderData.id}</span>
                </p>
                <p style="color: ${statusColor}; font-size: 14px; margin-top: 5px;">
                    ${statusIcon} ${statusText}
                </p>
                ${orderData.discord_error ? `
                    <p style="color: #ff4757; font-size: 12px; margin-top: 5px;">
                        Error: ${orderData.discord_error}
                    </p>
                ` : ''}
            </div>
        `;
        
        return orderInfo;
    },
    
    createOrderDetails() {
        // Update order details block content
        let details = '<ul style="color: #555; padding-left: 20px; margin: 0;">';
        details += `<li><strong>${OPTION_LABELS[AppState.userData.selectedCourse]}</strong></li>`;
        
        if (AppState.userData.hasChat) {
            details += `<li>${OPTION_LABELS['chat']}</li>`;
        }
        
        details += `<li>Email: ${AppState.userData.email}</li>`;
        details += `<li>Date: ${new Date().toLocaleString('en-US')}</li>`;
        details += '</ul>';
        
        DOM.orderDetails.innerHTML = details;
        DOM.selectedOptionsDiv.style.display = 'block';
        
        return DOM.selectedOptionsDiv;
    },
    
    createDiscordSection(orderData) {
        if (orderData.discord_invite) {
            this.updateDiscordLink(orderData.discord_invite);
        } else if (orderData.discord_error) {
            this.showDiscordError(orderData.discord_error);
        } else {
            // Show placeholder
            DOM.discordLink.innerHTML = `
                <div style="text-align: center; color: #666;">
                    <strong style="color: #667eea;">Waiting for Discord link...</strong><br>
                    <span style="font-size: 12px;">
                        The link will be generated shortly
                    </span>
                </div>
            `;
        }
        
        return DOM.discordLink;
    },
    
    updateDiscordLink(inviteUrl) {
        if (!inviteUrl) {
            this.showDiscordError('Discord link was not generated');
            return;
        }
        
        DOM.discordLink.innerHTML = `
            <div style="text-align: center;">
                <strong style="color: #667eea; font-size: 16px;">🎮 Your Discord invitation link:</strong><br>
                <a href="${inviteUrl}" target="_blank" 
                   style="color: white; background: #5865F2; padding: 10px 20px; 
                          border-radius: 8px; text-decoration: none; display: inline-block; 
                          margin: 10px 0; font-weight: bold;">
                    Join Server
                </a>
                <p style="font-size: 12px; color: #666; margin-top: 10px;">
                    ⏰ Link expires in 24 hours | 👥 One-time use
                </p>
                <p style="font-size: 12px; color: #888; margin-top: 5px;">
                    Or copy: <code style="background: #f1f1f1; padding: 2px 5px; border-radius: 3px;">${inviteUrl}</code>
                </p>
            </div>
        `;
    },
    
    showDiscordError(errorMessage) {
        DOM.discordLink.innerHTML = `
            <div style="text-align: center; color: #666;">
                <strong style="color: #ff4757;">Discord Error:</strong><br>
                <span style="font-size: 12px;">${errorMessage}</span><br>
                <span style="font-size: 11px; color: #888; margin-top: 5px;">
                    Please contact support for access
                </span>
            </div>
        `;
    }
};

// ============================================
// ORDER SERVICE
// ============================================
const OrderService = {
    async submitOrder(userData) {
        if (!userData.email) {
            return {
                success: false,
                error: 'Please fill in all fields'
            };
        }
        
        const orderData = {
            email: userData.email,
            selected_course: userData.selectedCourse,
            has_chat: userData.hasChat,
        };
        
        console.log('🚀 Sending POST request to:', API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.CREATE_ORDER);
        console.log('📦 Data:', orderData);
        
        try {
            const response = await fetch(API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.CREATE_ORDER, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData)
            });
            
            console.log('📡 Response status:', response.status);
            
            if (!response.ok) {
                let errorText = `HTTP error ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorText = errorData.error || errorText;
                } catch (e) {
                    // Failed to read JSON
                }
                
                throw new Error(errorText);
            }
            
            const result = await response.json();
            console.log('✅ Successful response:', result);
            
            return {
                success: true,
                data: {
                    id: result.order_id || result.id || 'demo-' + Date.now(),
                    status: result.status || 'success',
                    message: result.message,
                    error: result.error,
                    discord_invite: result.discord_invite,
                    discord_error: result.discord_error
                }
            };
            
        } catch (error) {
            console.error('❌ Send error:', error);
            
            // Check if it's an access error (403)
            if (error.message.includes('403') || 
                error.message.includes('course 1') || 
                error.message.includes('course 2') ||
                error.message.includes('package 1/2') ||
                error.message.includes('package 2/3') ||
                error.message.includes('must purchase')) {
                return {
                    success: false,
                    error: error.message
                };
            }
            
            // Demo mode for network errors
            return {
                success: true, // Still consider success for demo
                data: {
                    id: 'demo-' + Date.now(),
                    status: 'pending',
                    message: 'Demo mode (server unavailable)',
                    error: error.message
                }
            };
        }
    }
};

// ============================================
// STRIPE PAYMENT MANAGEMENT
// ============================================
const PaymentManager = {
    async initiatePayment() {
        await Utils.withLoading(DOM.submitBtn, async () => {
            try {
                // Create Payment Intent on the server
                const response = await fetch(API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.CREATE_PAYMENT_INTENT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: AppState.userData.email,
                        selected_course: AppState.userData.selectedCourse,
                        has_chat: AppState.userData.hasChat,
                    })
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    AppState.clientSecret = result.client_secret;
                    AppState.paymentIntentId = result.payment_id;
                    
                    // Show payment form
                    this.showPaymentForm(result.amount_display);
                } else {
                    alert('Error creating payment: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('❌ Error creating payment:', error);
                alert('Error creating payment: ' + error.message);
            }
        });
    },
    
    showPaymentForm(amountDisplay) {
        // Update order display
        if (DOM.paymentOrderDetails) {
            DOM.paymentOrderDetails.innerHTML = this.getOrderSummaryHTML();
        }
        if (DOM.paymentTotal) {
            DOM.paymentTotal.textContent = amountDisplay;
        }
        
        // Go to payment step
        StepManager.goToStep3Payment();
        
        // Initialize Stripe Elements
        this.initializeStripe();
    },
    
    getOrderSummaryHTML() {
        let html = '';
        
        // Course
        html += `<div style="margin-bottom: 8px;">
            <strong>Course:</strong> ${OPTION_LABELS[AppState.userData.selectedCourse] || AppState.userData.selectedCourse}
        </div>`;
        
        // Chat
        if (AppState.userData.hasChat) {
            html += `<div style="margin-bottom: 8px;">
                <strong>Additional:</strong> Chat access
            </div>`;
        }
        
        // Email
        html += `<div style="margin-bottom: 8px;">
            <strong>Email:</strong> ${AppState.userData.email}
        </div>`;
        
        return html;
    },
    
    initializeStripe() {
        // Initialize Stripe
        if (!window.STRIPE_PUBLISHABLE_KEY || window.STRIPE_PUBLISHABLE_KEY.includes('your_publishable_key')) {
            DOM.paymentMessage.textContent = 'Error: Stripe is not configured. Please add STRIPE_PUBLISHABLE_KEY to settings.';
            DOM.paymentMessage.style.display = 'block';
            return;
        }
        
        AppState.stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);
        
        // Create Elements
        const appearance = {
            theme: 'stripe',
            variables: {
                colorPrimary: '#27ae60',
                colorBackground: '#ffffff',
                colorText: '#333333',
                colorDanger: '#ff4757',
                borderRadius: '8px',
            },
        };
        
        AppState.elements = AppState.stripe.elements({
            appearance,
            clientSecret: AppState.clientSecret,
        });
        
        // Create and mount Payment Element
        const paymentElement = AppState.elements.create('payment');
        paymentElement.mount('#payment-element');
        
        // Handle form submission
        DOM.paymentForm.addEventListener('submit', this.handlePaymentSubmit.bind(this));
    },
    
    async handlePaymentSubmit(e) {
        e.preventDefault();
        
        // Show loading
        DOM.payButton.disabled = true;
        DOM.buttonText.style.display = 'none';
        DOM.spinner.style.display = 'inline';
        DOM.paymentMessage.style.display = 'none';
        
        try {
            const { error, paymentIntent } = await AppState.stripe.confirmPayment({
                elements: AppState.elements,
                confirmParams: {
                    return_url: window.location.origin + '/pay/',
                    receipt_email: AppState.userData.email,
                },
                redirect: 'if_required',
            });
            
            if (error) {
                // Error during payment confirmation - restore button
                DOM.paymentMessage.textContent = error.message;
                DOM.paymentMessage.style.display = 'block';
                DOM.payButton.disabled = false;
                DOM.buttonText.textContent = BUTTON_ORIGINAL_TEXT.payButton;
                DOM.buttonText.style.display = 'inline';
                DOM.spinner.style.display = 'none';
            } else if (paymentIntent && paymentIntent.status === 'succeeded') {
                // Payment successful
                await this.handlePaymentSuccess(paymentIntent.id);
            }
        } catch (error) {
            console.error('❌ Error during payment:', error);
            DOM.paymentMessage.textContent = 'An error occurred while processing the payment. Please try again.';
            DOM.paymentMessage.style.display = 'block';
            DOM.payButton.disabled = false;
            DOM.buttonText.textContent = BUTTON_ORIGINAL_TEXT.payButton;
            DOM.buttonText.style.display = 'inline';
            DOM.spinner.style.display = 'none';
        }
    },
    
    async handlePaymentSuccess(paymentIntentId) {
        try {
            const response = await fetch(API_CONFIG.BASE_URL + API_CONFIG.ENDPOINTS.CONFIRM_PAYMENT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_intent_id: paymentIntentId,
                })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // If there are any warnings, show them
                if (result.warning) {
                    console.warn('⚠️ Warning:', result.warning);
                }
                this.showSuccess(result);
            } else {
                alert('Error confirming payment: ' + (result.error || 'Unknown error'));
                DOM.payButton.disabled = false;
                DOM.buttonText.style.display = 'inline';
                DOM.spinner.style.display = 'none';
            }
        } catch (error) {
            console.error('❌ Error confirming payment:', error);
            alert('Error confirming payment: ' + error.message);
            DOM.payButton.disabled = false;
            DOM.buttonText.style.display = 'inline';
            DOM.spinner.style.display = 'none';
        }
    },
    
    showSuccess(result) {
        // Update data
        AppState.update({
            orderId: result.payment_id,
            discordInvite: result.discord_invite_url,
        });
        
        // Go to success step
        StepManager.goToStep4Success();
        
        // Show order details
        OrderDisplay.showCurrentOrder({
            id: result.payment_id,
            discord_invite: result.discord_invite_url,
            discord_error: result.discord_error,
            selected_course: AppState.userData.selectedCourse,
            has_chat: AppState.userData.hasChat,
            email: AppState.userData.email,
        });
    },
};

// ============================================
// INITIALIZATION
// ============================================
const App = {
    init() {
        // Save original button texts
        BUTTON_ORIGINAL_TEXT.submitBtn = DOM.submitBtn.textContent;
        BUTTON_ORIGINAL_TEXT.payButton = DOM.payButton.querySelector('#button-text').textContent;
        
        this.bindEvents();
        this.cleanupPreviousOrders();
        console.log('🚀 Application initialized');
    },
    
    bindEvents() {
        // "Buy" button
        DOM.buyBtn.addEventListener('click', () => {
            StepManager.goToStep2();
        });
        
        // "Proceed to payment" button
        DOM.submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            FormManager.submit();
        });
        
        // "Home" button
        DOM.backBtn.addEventListener('click', () => {
            StepManager.goToStep1();
        });
        
        // "Back to selection" button
        if (DOM.backToSelectionBtn) {
            DOM.backToSelectionBtn.addEventListener('click', () => {
                // Reset payment button state
                DOM.payButton.disabled = false;
                DOM.buttonText.textContent = BUTTON_ORIGINAL_TEXT.payButton;
                DOM.buttonText.style.display = 'inline';
                DOM.spinner.style.display = 'none';
                DOM.paymentMessage.style.display = 'none';
                
                // Reset "Proceed to payment" button state on step 2
                DOM.submitBtn.disabled = false;
                DOM.submitBtn.textContent = BUTTON_ORIGINAL_TEXT.submitBtn;
                
                // Go back to selection step
                StepManager.showStep(DOM.step2, DOM.step3payment);
            });
        }
        
        // Email input validation
        DOM.emailInput.addEventListener('input', () => {
            const email = DOM.emailInput.value.trim();
            if (email) {
                if (Utils.validateEmail(email)) {
                    Utils.hideError(DOM.emailInput, DOM.emailError);
                }
            }
        });
        
        // Course selection validation
        DOM.courseSelect.addEventListener('change', () => {
            if (DOM.courseSelect.value) {
                Utils.hideError(DOM.courseSelect, DOM.selectError);
            }
        });
        
        // No price update listeners needed
    },
    
    // Clear previous orders when loading the page
    cleanupPreviousOrders() {
        // Remove all elements with order information
        const orderElements = document.querySelectorAll('[data-order-info], .current-order-container');
        orderElements.forEach(element => element.remove());
        
        // Reset state
        AppState.reset();
        
        // Clear Discord link
        DOM.discordLink.innerHTML = `
            <div style="text-align: center;">
                <strong>Discord link will appear here</strong><br>
                <span style="font-size: 12px;">(will be inserted automatically by the bot)</span>
            </div>
        `;
        
        // Clear order details
        DOM.orderDetails.innerHTML = '';
        DOM.selectedOptionsDiv.style.display = 'none';
    }
};

// ============================================
// GLOBAL FUNCTIONS (for external use)
// ============================================
window.setDiscordLink = function(link) {
    OrderDisplay.updateDiscordLink(link);
};

window.getUserData = function() {
    return AppState.userData;
};

window.submitOrderToBackend = async function() {
    const result = await OrderService.submitOrder(AppState.userData);
    return result.success ? result.data : result;
};

// ============================================
// APPLICATION START
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
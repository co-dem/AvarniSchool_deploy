// home_template_main.js

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentLang = localStorage.getItem('selectedLanguage') || 'ru';
let mouseY = 0;
let isHeaderVisible = true;
let lastScrollY = window.scrollY;
let scrollTimeout;

// ===== DOM ЭЛЕМЕНТЫ =====
const header = document.getElementById('main-header');
const heroSection = document.querySelector('.hero');
const burgerMenu = document.querySelector('.burger-menu');
const burgerIcon = document.querySelector('.burger-icon');
const mobileNav = document.querySelector('.mobile-nav');
const overlay = document.querySelector('.overlay');
const mobileNavLinks = document.querySelectorAll('.mobile-nav a');

// ===== БУРГЕР-МЕНЮ =====
function toggleMenu() {
    burgerIcon.classList.toggle('active');
    mobileNav.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
}

if (burgerMenu) {
    burgerMenu.addEventListener('click', toggleMenu);
}

if (overlay) {
    overlay.addEventListener('click', toggleMenu);
}

// Закрытие меню при клике на ссылку
mobileNavLinks.forEach(link => {
    link.addEventListener('click', toggleMenu);
});

// Закрытие меню при изменении размера экрана
window.addEventListener('resize', () => {
    if (window.innerWidth > 767) {
        burgerIcon?.classList.remove('active');
        mobileNav?.classList.remove('active');
        overlay?.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ХЕДЕРОМ =====
function checkIfInHeroSection() {
    if (!heroSection) return false;
    const heroRect = heroSection.getBoundingClientRect();
    return heroRect.top <= 100 && heroRect.bottom > 0;
}

function updateHeaderTransparency() {
    if (!header || !heroSection) return;
    const heroRect = heroSection.getBoundingClientRect();
    if (heroRect.bottom > 0) {
        header.classList.add('header-transparent');
    } else {
        header.classList.remove('header-transparent');
    }
}

function updateHeaderVisibility() {
    if (!header) return;
    
    const isInHero = checkIfInHeroSection();
    updateHeaderTransparency();
    
    if (isInHero) {
        if (!isHeaderVisible) {
            header.classList.remove('header-hidden');
            isHeaderVisible = true;
        }
        return;
    }
    
    if (mouseY <= 60) {
        if (!isHeaderVisible) {
            header.classList.remove('header-hidden');
            isHeaderVisible = true;
        }
    } else {
        if (isHeaderVisible) {
            header.classList.add('header-hidden');
            isHeaderVisible = false;
        }
    }
}

function handleScroll() {
    if (!header) return;
    
    const currentScrollY = window.scrollY;
    const isInHero = checkIfInHeroSection();
    
    updateHeaderTransparency();
    
    if (isInHero) {
        if (!isHeaderVisible) {
            header.classList.remove('header-hidden');
            isHeaderVisible = true;
        }
        return;
    }
    
    if (currentScrollY > lastScrollY) {
        if (isHeaderVisible) {
            header.classList.add('header-hidden');
            isHeaderVisible = false;
        }
    } else {
        if (!isHeaderVisible) {
            header.classList.remove('header-hidden');
            isHeaderVisible = true;
        }
    }
    
    lastScrollY = currentScrollY;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        if (!checkIfInHeroSection()) {
            if (mouseY <= 60) {
                if (!isHeaderVisible) {
                    header.classList.remove('header-hidden');
                    isHeaderVisible = true;
                }
            } else {
                if (isHeaderVisible) {
                    header.classList.add('header-hidden');
                    isHeaderVisible = false;
                }
            }
        }
    }, 150);
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ВИДЕО =====
function loadTrailerVideo(lang) {
    console.log('🎬 Загрузка видео для языка:', lang);
    
    const videoElement = document.getElementById('trailer-video');
    const videoPlaceholder = document.getElementById('video-placeholder');
    
    if (!videoElement) {
        console.log('❌ Видео элемент не найден');
        return;
    }
    
    // Показываем заглушку загрузки
    if (videoPlaceholder) {
        videoPlaceholder.style.display = 'flex';
    }
    
    // Сохраняем состояние видео
    const wasPlaying = !videoElement.paused;
    
    // Определяем путь к видео в зависимости от языка
    let videoPath;
    
    if (lang === 'ru') {
        videoPath = '/static/main/videos/trailer_ru.mp4';
    } else {
        videoPath = '/static/main/videos/trailer_en.mp4';
    }
    
    console.log('📁 Путь к видео:', videoPath);
    
    // Проверяем, существует ли видео (через fetch)
    fetch(videoPath, { method: 'HEAD' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Видео не найдено: ${response.status}`);
            }
            console.log('✅ Видео найдено, загружаем...');
            
            // Устанавливаем новый источник
            videoElement.src = videoPath;
            videoElement.load();
            
            // Когда видео готово к воспроизведению
            videoElement.oncanplay = function() {
                console.log('✅ Видео загружено и готово');
                if (videoPlaceholder) {
                    videoPlaceholder.style.display = 'none';
                }
                
                // Если видео играло до переключения, пробуем воспроизвести
                if (wasPlaying) {
                    videoElement.play().catch(e => {
                        console.log('⚠️ Автовоспроизведение не удалось:', e);
                    });
                }
            };
            
            // Обработка ошибок
            videoElement.onerror = function(e) {
                console.error('❌ Ошибка загрузки видео:', e);
                showVideoError(videoPlaceholder, lang);
            };
        })
        .catch(error => {
            console.error('❌ Видео не найдено:', error);
            showVideoError(videoPlaceholder, lang);
        });
}

// Функция для отображения ошибки
function showVideoError(placeholder, lang) {
    if (!placeholder) return;
    
    placeholder.innerHTML = `
        <div class="placeholder-content error">
            <span class="error-icon">⚠️</span>
            <p>${lang === 'ru' ? 'Ошибка загрузки видео' : 'Error loading video'}</p>
            <p style="font-size: 0.9rem; opacity: 0.7; margin-top: 5px;">
                ${lang === 'ru' ? 'Проверьте подключение к интернету' : 'Check your internet connection'}
            </p>
            <button onclick="retryLoadVideo('${lang}')" class="retry-btn">
                ${lang === 'ru' ? 'Повторить' : 'Retry'}
            </button>
        </div>
    `;
    placeholder.style.display = 'flex';
}

// Функция для повторной загрузки
window.retryLoadVideo = function(lang) {
    const placeholder = document.getElementById('video-placeholder');
    if (placeholder) {
        placeholder.innerHTML = `
            <div class="placeholder-content">
                <div class="loading-spinner"></div>
                <p>${lang === 'ru' ? 'Загрузка видео...' : 'Loading video...'}</p>
            </div>
        `;
    }
    loadTrailerVideo(lang);
};

// ===== КРАСИВЫЙ ВЕРТИКАЛЬНЫЙ ВИДЕОПЛЕЕР =====
// ===== КРАСИВЫЙ ВЕРТИКАЛЬНЫЙ ВИДЕОПЛЕЕР (ИСПРАВЛЕННАЯ ВЕРСИЯ) =====
class CustomVideoPlayer {
    constructor() {
        // Исправленные селекторы
        this.player = document.querySelector('.custom-video-player');
        this.video = document.getElementById('trailer-video');
        this.placeholder = document.getElementById('video-placeholder');
        this.controls = document.querySelector('.custom-controls');
        
        // ВАЖНО: Правильные селекторы для кнопок
        this.playPauseBtn = document.querySelector('.play-pause');
        this.bigPlayBtn = document.querySelector('.big-play-btn');
        this.muteBtn = document.querySelector('.mute-toggle');
        this.fullscreenBtn = document.querySelector('.fullscreen-toggle');
        
        // Прогресс-бар
        this.progressContainer = document.querySelector('.progress-container');
        this.progressBar = document.querySelector('.progress-bar');
        this.progressFilled = document.querySelector('.progress-filled');
        this.progressBuffer = document.querySelector('.progress-buffer');
        this.progressThumb = document.querySelector('.progress-thumb');
        this.currentTimeSpan = document.querySelector('.current-time');
        this.durationSpan = document.querySelector('.duration');
        
        this.isPlaying = false;
        this.isDragging = false;
        this.controlsTimeout = null;
        this.currentLang = localStorage.getItem('selectedLanguage') || 'ru';
        
        // Отладка - проверим, нашлись ли элементы
        console.log('Video player initialized:', {
            player: !!this.player,
            video: !!this.video,
            playPauseBtn: !!this.playPauseBtn,
            bigPlayBtn: !!this.bigPlayBtn,
            muteBtn: !!this.muteBtn,
            fullscreenBtn: !!this.fullscreenBtn,
            progressBar: !!this.progressBar
        });
        
        this.init();
    }
    
    init() {
        if (!this.video || !this.player) {
            console.error('❌ Video player elements not found');
            return;
        }
        
        this.bindEvents();
        this.loadVideoForLanguage(this.currentLang);
        this.updateVolumeIcons();
    }
    
    bindEvents() {
        // Видео события
        this.video.addEventListener('loadedmetadata', () => this.onMetadataLoaded());
        this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.video.addEventListener('progress', () => this.onProgress());
        this.video.addEventListener('play', () => this.onPlay());
        this.video.addEventListener('pause', () => this.onPause());
        this.video.addEventListener('volumechange', () => this.updateVolumeIcons());
        this.video.addEventListener('waiting', () => this.showPlaceholder());
        this.video.addEventListener('canplay', () => this.hidePlaceholder());
        this.video.addEventListener('error', () => this.onVideoError());
        
        // Клик по видео
        this.video.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlay();
        });
        
        // Кнопки управления - ПРЯМАЯ ПРИВЯЗКА
        if (this.playPauseBtn) {
            console.log('✅ Play/Pause button found');
            this.playPauseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Play/Pause clicked');
                this.togglePlay();
            });
        } else {
            console.warn('⚠️ Play/Pause button not found');
        }
        
        if (this.bigPlayBtn) {
            console.log('✅ Big play button found');
            this.bigPlayBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Big play clicked');
                this.togglePlay();
            });
        } else {
            console.warn('⚠️ Big play button not found');
        }
        
        if (this.muteBtn) {
            console.log('✅ Mute button found');
            this.muteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Mute clicked');
                this.toggleMute();
            });
        } else {
            console.warn('⚠️ Mute button not found');
        }
        
        if (this.fullscreenBtn) {
            console.log('✅ Fullscreen button found');
            this.fullscreenBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Fullscreen clicked');
                this.toggleFullscreen();
            });
        } else {
            console.warn('⚠️ Fullscreen button not found');
        }
        
        // Прогресс бар
        if (this.progressBar) {
            this.progressBar.addEventListener('click', (e) => {
                e.stopPropagation();
                this.seek(e);
            });
            
            this.progressBar.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.isDragging = true;
                this.seek(e);
            });
            
            this.progressBar.addEventListener('mousemove', (e) => {
                if (this.isDragging) {
                    e.preventDefault();
                    this.seek(e);
                }
            });
            
            document.addEventListener('mouseup', () => {
                this.isDragging = false;
            });
            
            // Touch события для мобильных
            this.progressBar.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.isDragging = true;
                this.seek(e.touches[0]);
            });
            
            this.progressBar.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (this.isDragging) {
                    this.seek(e.touches[0]);
                }
            });
            
            this.progressBar.addEventListener('touchend', () => {
                this.isDragging = false;
            });
        }
        
        // Управление видимостью контролов
        if (this.player) {
            this.player.addEventListener('mousemove', () => this.showControls());
            this.player.addEventListener('mouseleave', () => this.hideControls());
            this.player.addEventListener('touchstart', () => this.showControls());
        }
        
        // Клавиатурные события
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        // Полноэкранные события
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.onFullscreenChange());
    }
    
    loadVideoForLanguage(lang) {
        const videoPath = lang === 'ru' 
            ? '/static/main/videos/trailer_ru.mp4'
            : '/static/main/videos/trailer_en.mp4';
        
        console.log('Loading video:', videoPath);
        this.showPlaceholder();
        
        // Устанавливаем источник видео
        this.video.src = videoPath;
        this.video.load();
    }
    
    togglePlay() {
        console.log('Toggle play, current paused:', this.video.paused);
        if (this.video.paused) {
            this.video.play()
                .then(() => console.log('✅ Video playing'))
                .catch(e => console.error('❌ Play failed:', e));
        } else {
            this.video.pause();
            console.log('⏸️ Video paused');
        }
    }
    
    onPlay() {
        console.log('Video play event');
        this.isPlaying = true;
        this.player.classList.add('playing');
        
        // Обновляем иконку play/pause
        if (this.playPauseBtn) {
            const playIcon = this.playPauseBtn.querySelector('.play-icon');
            const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        }
        
        if (this.bigPlayBtn) {
            this.bigPlayBtn.style.opacity = '0';
            this.bigPlayBtn.style.pointerEvents = 'none';
        }
        
        this.showControls();
        this.startControlsTimer();
    }
    
    onPause() {
        console.log('Video pause event');
        this.isPlaying = false;
        this.player.classList.remove('playing');
        
        // Обновляем иконку play/pause
        if (this.playPauseBtn) {
            const playIcon = this.playPauseBtn.querySelector('.play-icon');
            const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        }
        
        if (this.bigPlayBtn) {
            this.bigPlayBtn.style.opacity = '1';
            this.bigPlayBtn.style.pointerEvents = 'auto';
        }
        
        this.showControls();
        this.clearControlsTimer();
    }
    
    onTimeUpdate() {
        if (!this.video.duration || this.isDragging) return;
        
        const percent = (this.video.currentTime / this.video.duration) * 100;
        
        if (this.progressFilled) {
            this.progressFilled.style.width = `${percent}%`;
        }
        
        if (this.progressThumb) {
            this.progressThumb.style.left = `${percent}%`;
        }
        
        if (this.currentTimeSpan) {
            this.currentTimeSpan.textContent = this.formatTime(this.video.currentTime);
        }
    }
    
    onProgress() {
        if (this.video.buffered.length > 0 && this.video.duration) {
            const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
            const percent = (bufferedEnd / this.video.duration) * 100;
            
            if (this.progressBuffer) {
                this.progressBuffer.style.width = `${percent}%`;
            }
        }
    }
    
    onMetadataLoaded() {
        console.log('Video metadata loaded, duration:', this.video.duration);
        if (this.durationSpan) {
            this.durationSpan.textContent = this.formatTime(this.video.duration);
        }
        this.hidePlaceholder();
    }
    
    seek(e) {
        if (!this.progressBar || !this.video.duration) return;
        
        const rect = this.progressBar.getBoundingClientRect();
        let clientX;
        
        if (e.touches) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }
        
        // Вычисляем позицию клика относительно прогресс-бара
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const percent = x / rect.width;
        
        // Устанавливаем новое время
        const newTime = percent * this.video.duration;
        this.video.currentTime = newTime;
        
        // Визуально обновляем прогресс
        if (this.progressFilled) {
            this.progressFilled.style.width = `${percent * 100}%`;
        }
        if (this.progressThumb) {
            this.progressThumb.style.left = `${percent * 100}%`;
        }
    }
    
    toggleMute() {
        console.log('Toggle mute, current muted:', this.video.muted);
        this.video.muted = !this.video.muted;
    }
    
    updateVolumeIcons() {
        if (!this.muteBtn) return;
        
        const highIcon = this.muteBtn.querySelector('.volume-high-icon');
        const muteIcon = this.muteBtn.querySelector('.volume-mute-icon');
        
        if (this.video.muted) {
            if (highIcon) highIcon.style.display = 'none';
            if (muteIcon) muteIcon.style.display = 'block';
            console.log('Volume muted');
        } else {
            if (highIcon) highIcon.style.display = 'block';
            if (muteIcon) muteIcon.style.display = 'none';
            console.log('Volume unmuted');
        }
    }
    
    toggleFullscreen() {
        console.log('Toggle fullscreen');
        
        if (!document.fullscreenElement) {
            if (this.player.requestFullscreen) {
                this.player.requestFullscreen();
            } else if (this.player.webkitRequestFullscreen) {
                this.player.webkitRequestFullscreen();
            } else if (this.player.mozRequestFullScreen) {
                this.player.mozRequestFullScreen();
            } else if (this.player.msRequestFullscreen) {
                this.player.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
    
    onFullscreenChange() {
        console.log('Fullscreen changed:', !!document.fullscreenElement);
        
        if (!this.fullscreenBtn) return;
        
        const fullscreenIcon = this.fullscreenBtn.querySelector('.fullscreen-icon');
        const exitIcon = this.fullscreenBtn.querySelector('.fullscreen-exit-icon');
        
        if (document.fullscreenElement) {
            if (fullscreenIcon) fullscreenIcon.style.display = 'none';
            if (exitIcon) exitIcon.style.display = 'block';
        } else {
            if (fullscreenIcon) fullscreenIcon.style.display = 'block';
            if (exitIcon) exitIcon.style.display = 'none';
        }
    }
    
    showControls() {
        if (this.controls) {
            this.controls.style.opacity = '1';
            this.controls.style.pointerEvents = 'auto';
        }
        
        this.startControlsTimer();
    }
    
    hideControls() {
        if (this.controls && this.isPlaying) {
            this.controls.style.opacity = '0';
            this.controls.style.pointerEvents = 'none';
        }
    }
    
    startControlsTimer() {
        this.clearControlsTimer();
        if (this.isPlaying) {
            this.controlsTimeout = setTimeout(() => this.hideControls(), 3000);
        }
    }
    
    clearControlsTimer() {
        if (this.controlsTimeout) {
            clearTimeout(this.controlsTimeout);
            this.controlsTimeout = null;
        }
    }
    
    showPlaceholder() {
        if (this.placeholder) {
            this.placeholder.style.display = 'flex';
        }
    }
    
    hidePlaceholder() {
        if (this.placeholder) {
            this.placeholder.style.display = 'none';
        }
    }
    
    onVideoError() {
        console.error('Video error');
        this.showError();
    }
    
    showError() {
        if (this.placeholder) {
            this.placeholder.innerHTML = `
                <div class="placeholder-content error">
                    <span class="error-icon">⚠️</span>
                    <p>${this.currentLang === 'ru' ? 'Ошибка загрузки видео' : 'Error loading video'}</p>
                    <button onclick="location.reload()" class="retry-btn">
                        ${this.currentLang === 'ru' ? 'Повторить' : 'Retry'}
                    </button>
                </div>
            `;
            this.placeholder.style.display = 'flex';
        }
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    
    onKeyDown(e) {
        // Игнорируем, если фокус на input или textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch(e.key.toLowerCase()) {
            case ' ':
            case 'space':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'arrowright':
                e.preventDefault();
                this.video.currentTime += 10;
                break;
            case 'arrowleft':
                e.preventDefault();
                this.video.currentTime -= 10;
                break;
            case 'arrowup':
                e.preventDefault();
                this.video.volume = Math.min(1, this.video.volume + 0.1);
                break;
            case 'arrowdown':
                e.preventDefault();
                this.video.volume = Math.max(0, this.video.volume - 0.1);
                break;
        }
    }
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ЯЗЫКОМ =====
function animateTextChange(selector, newText) {
    let elements;
    
    if (typeof selector === 'string') {
        elements = document.querySelectorAll(selector);
    } else if (selector) {
        elements = [selector];
    } else {
        return;
    }
    
    elements.forEach(el => {
        if (!el) return;
        
        const originalTransition = el.style.transition;
        const originalTransform = el.style.transform;
        
        el.style.transition = 'opacity 0.15s ease, transform 0.2s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(3px)';
        
        setTimeout(() => {
            el.textContent = newText;
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            
            setTimeout(() => {
                el.style.transition = originalTransition;
                el.style.transform = originalTransform;
            }, 200);
        }, 120);
    });
}

function setLanguage(lang) {
    // Сохраняем выбор
    localStorage.setItem('selectedLanguage', lang);
    currentLang = lang;
    
    // Обновляем активный класс на кнопках языка
    document.querySelectorAll('.lang-btn').forEach(btn => {
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    const t = translations[lang];
    
    // Эффект пульсации
    document.body.style.transition = 'opacity 0.2s ease';
    document.body.style.opacity = '0.7';
    
    setTimeout(() => {
        // Навигация
        animateTextChange('nav a[href="#trailer"]', t.nav.trailer);
        animateTextChange('nav a[href="#courses"]', t.nav.courses);
        animateTextChange('nav a[href="#cases"]', t.nav.cases);
        animateTextChange('.mobile-nav a[href="#trailer"]', t.nav.trailer);
        animateTextChange('.mobile-nav a[href="#courses"]', t.nav.courses);
        animateTextChange('.mobile-nav a[href="#cases"]', t.nav.cases);
        
        // Hero секция
        animateTextChange('.hero-text h1, .mobile-hero-text h1', t.hero.title);
        animateTextChange('.hero-text .subtitle, .mobile-hero-text .subtitle', t.hero.subtitle);
        
        const heroJoinBtn = document.getElementById('hero-join-btn');
        if (heroJoinBtn) animateTextChange('#hero-join-btn', t.hero.joinBtn);
        
        const heroTrailerBtn = document.getElementById('hero-trailer-btn');
        if (heroTrailerBtn) animateTextChange('#hero-trailer-btn', t.hero.trailerBtn);
        
        // Текст над курсами
        animateTextChange('.courses-note-first', t.courses.noteFirst);
        animateTextChange('.courses-note-second', t.courses.noteSecond);
        
        // Карточки курсов
        const stages = [t.stage1, t.stage2, t.stage3];
        document.querySelectorAll('.stage-card').forEach((card, index) => {
            const stage = stages[index];
            if (!stage) return;
            
            // Badge
            animateTextChange(card.querySelector('.stage-badge'), stage.badge);
            
            // Title (с HTML тегами)
            const titleEl = card.querySelector('h3');
            if (titleEl) {
                titleEl.style.transition = 'opacity 0.2s ease, transform 0.3s ease';
                titleEl.style.opacity = '0';
                titleEl.style.transform = 'translateY(5px)';
                
                setTimeout(() => {
                    titleEl.innerHTML = stage.title;
                    titleEl.style.opacity = '1';
                    titleEl.style.transform = 'translateY(0)';
                }, 150);
            }
            
            // Goal
            animateTextChange(card.querySelector('.stage-goal'), stage.goal);
            
            // Includes title
            animateTextChange(card.querySelector('.includes-title'), stage.includes);
            
            // Features list
            const list = card.querySelector('.includes-list');
            if (list) {
                list.style.transition = 'opacity 0.2s ease';
                list.style.opacity = '0';
                
                setTimeout(() => {
                    list.innerHTML = '';
                    stage.features.forEach((feature, i) => {
                        setTimeout(() => {
                            const li = document.createElement('li');
                            li.textContent = feature;
                            li.style.opacity = '0';
                            li.style.transform = 'translateX(-5px)';
                            li.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                            list.appendChild(li);
                            
                            setTimeout(() => {
                                li.style.opacity = '1';
                                li.style.transform = 'translateX(0)';
                            }, 20);
                        }, i * 30);
                    });
                    
                    setTimeout(() => {
                        list.style.opacity = '1';
                    }, 50);
                }, 100);
            }
            
            // Optional block
            const optionalBlock = card.querySelector('.optional-block');
            if (optionalBlock) {
                optionalBlock.style.transition = 'opacity 0.2s ease';
                optionalBlock.style.opacity = '0';
                
                setTimeout(() => {
                    optionalBlock.innerHTML = stage.optional;
                    optionalBlock.style.opacity = '1';
                }, 150);
            }
            
            // Join button
            animateTextChange(card.querySelector('.card-join-btn'), stage.joinBtn);
        });
        
        // Trailer секция
        animateTextChange('#trailer h2', t.trailer.title);
        
        // Cases секция
        animateTextChange('#cases h2', t.cases.title);
        
        // Обновляем alert
        window.currentLangAlert = t.alert;
        
        // Загружаем видео для выбранного языка
        loadTrailerVideo(lang);
        
        // Обновляем язык в плеере
        if (window.customPlayer) {
            window.customPlayer.currentLang = lang;
            window.customPlayer.loadVideoForLanguage(lang);
        }
        
        // Возвращаем opacity
        setTimeout(() => {
            document.body.style.opacity = '1';
        }, 200);
    }, 100);
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ЦЕНАМИ =====
async function loadProductPrices() {
    console.log('🔍 Searching for price containers...');
    const priceContainers = document.querySelectorAll('.price-container');
    console.log('🔍 Found containers:', priceContainers.length);
    
    if (priceContainers.length === 0) {
        console.log('❌ No price containers found on page');
        return;
    }
    
    // Показываем загрузку
    priceContainers.forEach(container => {
        console.log('📍 Container product:', container.dataset.product);
        container.innerHTML = '<div class="price-loading">Загрузка цен...</div>';
    });
    
    try {
        console.log('🌐 Fetching prices from API...');
        const response = await fetch('/api/product-prices/');
        console.log('📡 Response status:', response.status);
        
        const data = await response.json();
        console.log('📦 Response data:', data);
        
        if (data.status === 'success' && data.prices) {
            const prices = data.prices;
            console.log('💰 Prices object:', prices);
            
            priceContainers.forEach(container => {
                const productCode = container.dataset.product;
                console.log(`🔍 Looking for product: "${productCode}"`);
                
                const productPrice = prices[productCode];
                console.log(`📊 Found price for ${productCode}:`, productPrice);
                
                if (productPrice) {
                    const price = productPrice.price;
                    const oldPrice = productPrice.old_price;
                    
                    const formattedPrice = (price / 100).toFixed(0);
                    
                    if (oldPrice && oldPrice > 0) {
                        const formattedOldPrice = (oldPrice / 100).toFixed(0);
                        container.innerHTML = `
                            <div class="price-old">$${formattedOldPrice}</div>
                            <div class="price-current">$${formattedPrice}</div>
                        `;
                        console.log(`✅ Updated ${productCode} with old price`);
                    } else {
                        container.innerHTML = `
                            <div class="price-current">$${formattedPrice}</div>
                        `;
                        console.log(`✅ Updated ${productCode} with current price only`);
                    }
                } else {
                    console.warn(`❌ No price for product: ${productCode}`);
                    container.innerHTML = '<div class="price-error">Цена не найдена</div>';
                }
            });
        } else {
            console.error('❌ API returned error:', data.error);
            throw new Error(data.error || 'API error');
        }
    } catch (error) {
        console.error('❌ Error loading prices:', error);
        priceContainers.forEach(container => {
            container.innerHTML = '<div class="price-error">Ошибка загрузки цен</div>';
        });
    }
}

// ===== ФУНКЦИЯ ПЕРЕХОДА К ОПЛАТЕ =====
window.redirectToPay = function(button) {
    const course = button.dataset.course;
    const hasChat = button.dataset.hasChat === 'true';
    
    sessionStorage.setItem('selectedCourse', course);
    sessionStorage.setItem('hasChat', hasChat);
    sessionStorage.setItem('selectedLanguage', currentLang);
    
    console.log('🔄 Перенаправление на оплату:', {
        course: course,
        hasChat: hasChat,
        language: currentLang
    });
    
    window.location.href = '/pay/';
};

// ===== ФУНКЦИИ ДЛЯ СЛАЙДЕРА КЕЙСОВ =====
function initCasesSlider() {
    const casesSlider = document.querySelector('.cases-slider');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    const dots = document.querySelectorAll('.dot');
    let currentIndex = 0;

    function updateSlider(index) {
        if (!casesSlider) return;
        
        const cardWidth = casesSlider.querySelector('.case-card')?.offsetWidth || 0;
        const scrollAmount = index * cardWidth;
        
        casesSlider.scrollTo({
            left: scrollAmount,
            behavior: 'smooth'
        });
        
        dots.forEach((dot, i) => {
            if (i === index) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
        
        currentIndex = index;
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
                updateSlider(currentIndex - 1);
            } else {
                updateSlider(dots.length - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentIndex < dots.length - 1) {
                updateSlider(currentIndex + 1);
            } else {
                updateSlider(0);
            }
        });
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            updateSlider(index);
        });
    });

    if (casesSlider) {
        casesSlider.addEventListener('scroll', () => {
            if (window.innerWidth <= 1024) {
                const scrollPosition = casesSlider.scrollLeft;
                const cardWidth = casesSlider.querySelector('.case-card')?.offsetWidth || 0;
                const newIndex = Math.round(scrollPosition / cardWidth);
                
                if (newIndex !== currentIndex && newIndex >= 0 && newIndex < dots.length) {
                    dots.forEach((dot, i) => {
                        if (i === newIndex) {
                            dot.classList.add('active');
                        } else {
                            dot.classList.remove('active');
                        }
                    });
                    currentIndex = newIndex;
                }
            }
        });
    }
}

// ===== ФУНКЦИЯ ДЛЯ ПЛАВНОГО СКРОЛЛА =====
function scrollToSection(sectionId) {
    const targetElement = document.querySelector(sectionId);
    
    if (targetElement) {
        if (header) {
            header.classList.remove('header-hidden');
            isHeaderVisible = true;
        }
        
        targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
        
        setTimeout(updateHeaderTransparency, 300);
    }
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация хедера
    if (header) {
        header.classList.remove('header-hidden');
        updateHeaderTransparency();
    }
    
    // Отслеживание мыши
    document.addEventListener('mousemove', function(e) {
        mouseY = e.clientY;
        updateHeaderVisibility();
    });
    
    // Отслеживание скролла
    window.addEventListener('scroll', handleScroll);
    
    // Отслеживание входа мыши
    document.addEventListener('mouseenter', function(e) {
        if (e.clientY <= 60) {
            mouseY = e.clientY;
            updateHeaderVisibility();
        }
    });
    
    // Загрузка цен
    loadProductPrices();
    
    // Обработка кликов по ссылкам в навигации
    document.querySelectorAll('nav a').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            scrollToSection(this.getAttribute('href'));
        });
    });
    
    // Обработка кнопок в hero секции
    const joinBtn = document.querySelector('.hero .btn-join');
    const trailerBtn = document.querySelector('.hero .btn-trailer');
    
    if (joinBtn) {
        joinBtn.addEventListener('click', () => scrollToSection('#courses'));
    }
    
    if (trailerBtn) {
        trailerBtn.addEventListener('click', () => scrollToSection('#trailer'));
    }
    
    // Инициализация переключения языка
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const lang = this.dataset.lang;
            
            this.style.transform = 'scale(0.9)';
            this.style.transition = 'transform 0.2s ease';
            
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 150);
            
            setLanguage(lang);
        });
    });
    
    // Загрузка сохраненного языка
    setTimeout(() => {
        setLanguage(currentLang);
    }, 100);
    
    // Инициализация слайдера кейсов
    initCasesSlider();
    
    // Инициализация видеоплеера
    window.customPlayer = new CustomVideoPlayer();
    
    // Обновление слайдера при изменении размера окна
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            const casesSlider = document.querySelector('.cases-slider');
            if (casesSlider) {
                casesSlider.scrollTo({ left: 0, behavior: 'auto' });
            }
            document.querySelectorAll('.dot').forEach((dot, i) => {
                if (i === 0) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
    });
});
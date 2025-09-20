/**
 * APORTE CAPITAL - LANDING PAGE JAVASCRIPT
 * Arquivo principal de scripts com funcionalidades modernas e interativas
 * Desenvolvido seguindo boas práticas de JavaScript ES6+
 */

// ===== CONFIGURAÇÕES GLOBAIS =====
const CONFIG = {
    // Configurações de animação
    animation: {
        duration: 300,
        easing: 'ease-in-out',
        observerThreshold: 0.1
    },
    
    // Configurações de scroll
    scroll: {
        offset: 80,
        smoothDuration: 800
    },
    
    // Configurações do loader
    loader: {
        minDisplayTime: 1000,
        fadeOutDuration: 500
    }
};

// ===== UTILITÁRIOS =====
const Utils = {
    /**
     * Debounce function para otimizar performance
     * @param {Function} func - Função a ser executada
     * @param {number} wait - Tempo de espera em ms
     * @returns {Function} Função debounced
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function para controlar frequência de execução
     * @param {Function} func - Função a ser executada
     * @param {number} limit - Limite de tempo em ms
     * @returns {Function} Função throttled
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Smooth scroll para elemento específico
     * @param {string} target - Seletor do elemento alvo
     * @param {number} offset - Offset adicional
     */
    smoothScrollTo(target, offset = CONFIG.scroll.offset) {
        const element = document.querySelector(target);
        if (element) {
            const elementPosition = element.offsetTop - offset;
            window.scrollTo({
                top: elementPosition,
                behavior: 'smooth'
            });
        }
    },

    /**
     * Adiciona classe com animação
     * @param {Element} element - Elemento DOM
     * @param {string} className - Nome da classe
     */
    addClassWithAnimation(element, className) {
        element.classList.add(className);
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        
        requestAnimationFrame(() => {
            element.style.transition = `all ${CONFIG.animation.duration}ms ${CONFIG.animation.easing}`;
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        });
    }
};

// ===== FUNÇÕES DE MÁSCARA =====
const MaskUtils = {
    /**
     * Aplica máscara de telefone (11) 99999-9999
     * @param {string} value - Valor do input
     * @returns {string} Valor formatado
     */
    phoneMask(value) {
        // Remove todos os caracteres não numéricos
        const numbers = value.replace(/\D/g, '');
        
        // Limita a 11 dígitos
        const limitedNumbers = numbers.substring(0, 11);
        
        // Aplica a máscara baseada no tamanho
        if (limitedNumbers.length <= 2) {
            return limitedNumbers;
        } else if (limitedNumbers.length <= 7) {
            return `(${limitedNumbers.substring(0, 2)}) ${limitedNumbers.substring(2)}`;
        } else {
            return `(${limitedNumbers.substring(0, 2)}) ${limitedNumbers.substring(2, 7)}-${limitedNumbers.substring(7)}`;
        }
    },

    /**
     * Aplica máscara de CNPJ 99.999.999/9999-99
     * @param {string} value - Valor do input
     * @returns {string} Valor formatado
     */
    cnpjMask(value) {
        // Remove todos os caracteres não numéricos
        const numbers = value.replace(/\D/g, '');
        
        // Limita a 14 dígitos
        const limitedNumbers = numbers.substring(0, 14);
        
        // Aplica a máscara baseada no tamanho
        if (limitedNumbers.length <= 2) {
            return limitedNumbers;
        } else if (limitedNumbers.length <= 5) {
            return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2)}`;
        } else if (limitedNumbers.length <= 8) {
            return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2, 5)}.${limitedNumbers.substring(5)}`;
        } else if (limitedNumbers.length <= 12) {
            return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2, 5)}.${limitedNumbers.substring(5, 8)}/${limitedNumbers.substring(8)}`;
        } else {
            return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2, 5)}.${limitedNumbers.substring(5, 8)}/${limitedNumbers.substring(8, 12)}-${limitedNumbers.substring(12)}`;
        }
    },

    /**
     * Aplica máscara em tempo real no input
     * @param {HTMLInputElement} input - Elemento input
     * @param {string} maskType - Tipo de máscara ('phone' ou 'cnpj')
     */
    applyMask(input, maskType) {
        input.addEventListener('input', (e) => {
            const cursorPosition = e.target.selectionStart;
            const oldValue = e.target.value;
            
            let newValue;
            if (maskType === 'phone') {
                newValue = this.phoneMask(oldValue);
            } else if (maskType === 'cnpj') {
                newValue = this.cnpjMask(oldValue);
            }
            
            e.target.value = newValue;
            
            // Ajusta a posição do cursor
            const newCursorPosition = cursorPosition + (newValue.length - oldValue.length);
            e.target.setSelectionRange(newCursorPosition, newCursorPosition);
        });

        // Previne colagem de valores inválidos
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const numbers = pastedText.replace(/\D/g, '');
            
            if (maskType === 'phone') {
                input.value = this.phoneMask(numbers);
            } else if (maskType === 'cnpj') {
                input.value = this.cnpjMask(numbers);
            }
        });
    },

    /**
     * Remove máscara e retorna apenas números
     * @param {string} value - Valor com máscara
     * @returns {string} Apenas números
     */
    removeMask(value) {
        return value.replace(/\D/g, '');
    },

    /**
     * Valida telefone (deve ter 10 ou 11 dígitos)
     * @param {string} phone - Telefone com ou sem máscara
     * @returns {boolean} True se válido
     */
    validatePhone(phone) {
        const numbers = this.removeMask(phone);
        return numbers.length === 10 || numbers.length === 11;
    },

    /**
     * Valida CNPJ (deve ter 14 dígitos)
     * @param {string} cnpj - CNPJ com ou sem máscara
     * @returns {boolean} True se válido
     */
    validateCNPJ(cnpj) {
        const numbers = this.removeMask(cnpj);
        return numbers.length === 14;
    }
};

// ===== GERENCIADOR DE LOADER =====
const LoaderManager = {
    /**
     * Inicializa o loader
     */
    init() {
        this.loader = document.getElementById('loader');
        this.startTime = Date.now();
        
        // Esconde o loader quando a página carregar
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.hide());
        } else {
            this.hide();
        }
    },

    /**
     * Esconde o loader com animação suave
     */
    hide() {
        const elapsedTime = Date.now() - this.startTime;
        const remainingTime = Math.max(0, CONFIG.loader.minDisplayTime - elapsedTime);
        
        setTimeout(() => {
            if (this.loader) {
                this.loader.classList.add('hidden');
                
                // Remove o loader do DOM após a animação
                setTimeout(() => {
                    if (this.loader && this.loader.parentNode) {
                        this.loader.parentNode.removeChild(this.loader);
                    }
                }, CONFIG.loader.fadeOutDuration);
            }
        }, remainingTime);
    }
};

// ===== GERENCIADOR DE NAVEGAÇÃO =====
const NavigationManager = {
    /**
     * Inicializa a navegação
     */
    init() {
        this.navbar = document.getElementById('navbar');
        this.navbarToggle = document.getElementById('navbar-toggle');
        this.navbarMenu = document.getElementById('navbar-menu');
        this.navLinks = document.querySelectorAll('.nav-link');
        
        this.setupEventListeners();
        this.setupScrollEffect();
        this.setupActiveSection();
    },

    /**
     * Configura os event listeners da navegação
     */
    setupEventListeners() {
        // Toggle do menu mobile
        if (this.navbarToggle) {
            this.navbarToggle.addEventListener('click', () => this.toggleMobileMenu());
        }

        // Smooth scroll nos links de navegação
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => this.handleNavClick(e));
        });

        // Fecha menu mobile ao clicar em link
        this.navLinks.forEach(link => {
            link.addEventListener('click', () => this.closeMobileMenu());
        });

        // Fecha menu mobile ao clicar fora
        document.addEventListener('click', (e) => {
            if (!this.navbar.contains(e.target)) {
                this.closeMobileMenu();
            }
        });
    },

    /**
     * Configura o efeito de scroll na navbar
     */
    setupScrollEffect() {
        const handleScroll = Utils.throttle(() => {
            if (window.scrollY > 50) {
                this.navbar.classList.add('scrolled');
            } else {
                this.navbar.classList.remove('scrolled');
            }
        }, 10);

        window.addEventListener('scroll', handleScroll);
    },

    /**
     * Configura a detecção de seção ativa
     */
    setupActiveSection() {
        const sections = document.querySelectorAll('section[id]');
        
        const handleScroll = Utils.throttle(() => {
            let currentSection = '';
            
            sections.forEach(section => {
                const sectionTop = section.offsetTop - CONFIG.scroll.offset - 50;
                const sectionHeight = section.offsetHeight;
                
                if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
                    currentSection = section.getAttribute('id');
                }
            });

            this.updateActiveNavLink(currentSection);
        }, 100);

        window.addEventListener('scroll', handleScroll);
    },

    /**
     * Atualiza o link ativo na navegação
     * @param {string} sectionId - ID da seção ativa
     */
    updateActiveNavLink(sectionId) {
        this.navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === sectionId) {
                link.classList.add('active');
            }
        });
    },

    /**
     * Manipula clique nos links de navegação
     * @param {Event} e - Evento de clique
     */
    handleNavClick(e) {
        e.preventDefault();
        const target = e.target.getAttribute('href');
        
        if (target && target.startsWith('#')) {
            Utils.smoothScrollTo(target);
        }
    },

    /**
     * Toggle do menu mobile
     */
    toggleMobileMenu() {
        this.navbarMenu.classList.toggle('active');
        this.navbarToggle.classList.toggle('active');
        
        // Atualiza aria-expanded para acessibilidade
        const isExpanded = this.navbarMenu.classList.contains('active');
        this.navbarToggle.setAttribute('aria-expanded', isExpanded);
    },

    /**
     * Fecha o menu mobile
     */
    closeMobileMenu() {
        this.navbarMenu.classList.remove('active');
        this.navbarToggle.classList.remove('active');
        this.navbarToggle.setAttribute('aria-expanded', 'false');
    }
};

// ===== GERENCIADOR DE ANIMAÇÕES =====
const AnimationManager = {
    /**
     * Inicializa as animações
     */
    init() {
        this.setupIntersectionObserver();
        this.setupScrollAnimations();
    },

    /**
     * Configura o Intersection Observer para animações
     */
    setupIntersectionObserver() {
        const observerOptions = {
            threshold: CONFIG.animation.observerThreshold,
            rootMargin: '0px 0px -50px 0px'
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.animateElement(entry.target);
                }
            });
        }, observerOptions);

        // Observa elementos que devem ser animados
        const animatedElements = document.querySelectorAll(
            '.feature-card, .solution-card, .section-title, .section-subtitle, .content-text, .content-image'
        );

        animatedElements.forEach(element => {
            this.observer.observe(element);
        });
    },

    /**
     * Anima um elemento específico
     * @param {Element} element - Elemento a ser animado
     */
    animateElement(element) {
        // Determina o tipo de animação baseado na classe do elemento
        let animationClass = 'animate-fade-in-up';
        
        if (element.classList.contains('content-image')) {
            animationClass = 'animate-fade-in-right';
        } else if (element.classList.contains('content-text')) {
            animationClass = 'animate-fade-in-left';
        }

        element.classList.add(animationClass);
        this.observer.unobserve(element);
    },

    /**
     * Configura animações de scroll
     */
    setupScrollAnimations() {
        // Efeito de parallax removido para evitar problemas visuais
        // O hero agora mantém uma aparência estática e limpa
    }
};

// ===== GERENCIADOR DE FORMULÁRIOS =====
const FormManager = {
    /**
     * Inicializa o gerenciamento de formulários
     */
    init() {
        this.contactForm = document.getElementById('contact-form');
        
        if (this.contactForm) {
            this.setupFormValidation();
            this.setupFormSubmission();
        }
    },

    /**
     * Configura validação do formulário
     */
    setupFormValidation() {
        const inputs = this.contactForm.querySelectorAll('.form-input, .form-textarea');
        
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });
    },

    /**
     * Valida um campo específico
     * @param {Element} field - Campo a ser validado
     */
    validateField(field) {
        const value = field.value.trim();
        let isValid = true;
        let errorMessage = '';

        // Validação por tipo de campo
        switch (field.type) {
            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    isValid = false;
                    errorMessage = 'Por favor, insira um e-mail válido';
                }
                break;
            
            case 'tel':
                const phoneRegex = /^[\d\s\-\(\)\+]+$/;
                if (!phoneRegex.test(value) || value.length < 10) {
                    isValid = false;
                    errorMessage = 'Por favor, insira um telefone válido';
                }
                break;
            
            default:
                if (field.hasAttribute('required') && value === '') {
                    isValid = false;
                    errorMessage = 'Este campo é obrigatório';
                }
        }

        this.showFieldValidation(field, isValid, errorMessage);
        return isValid;
    },

    /**
     * Mostra validação do campo
     * @param {Element} field - Campo
     * @param {boolean} isValid - Se é válido
     * @param {string} message - Mensagem de erro
     */
    showFieldValidation(field, isValid, message) {
        const formGroup = field.closest('.form-group');
        let errorElement = formGroup.querySelector('.field-error');

        if (!isValid) {
            field.style.borderColor = '#ef4444';
            
            if (!errorElement) {
                errorElement = document.createElement('span');
                errorElement.className = 'field-error';
                errorElement.style.color = '#ef4444';
                errorElement.style.fontSize = '0.875rem';
                errorElement.style.marginTop = '0.25rem';
                formGroup.appendChild(errorElement);
            }
            
            errorElement.textContent = message;
        } else {
            field.style.borderColor = '';
            if (errorElement) {
                errorElement.remove();
            }
        }
    },

    /**
     * Limpa erro do campo
     * @param {Element} field - Campo
     */
    clearFieldError(field) {
        field.style.borderColor = '';
        const formGroup = field.closest('.form-group');
        const errorElement = formGroup.querySelector('.field-error');
        if (errorElement) {
            errorElement.remove();
        }
    },

    /**
     * Configura submissão do formulário
     */
    setupFormSubmission() {
        this.contactForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
    },

    /**
     * Manipula submissão do formulário
     * @param {Event} e - Evento de submissão
     */
    handleFormSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(this.contactForm);
        const fields = this.contactForm.querySelectorAll('.form-input, .form-textarea');
        let isFormValid = true;

        // Valida todos os campos
        fields.forEach(field => {
            if (!this.validateField(field)) {
                isFormValid = false;
            }
        });

        if (isFormValid) {
            this.submitForm(formData);
        } else {
            this.showFormMessage('Por favor, corrija os erros antes de enviar.', 'error');
        }
    },

    /**
     * Envia o formulário
     * @param {FormData} formData - Dados do formulário
     */
    async submitForm(formData) {
        const submitButton = this.contactForm.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        
        // Mostra estado de carregamento
        submitButton.textContent = 'Enviando...';
        submitButton.disabled = true;

        try {
            // Simula envio (substitua pela sua lógica de envio)
            await this.simulateFormSubmission(formData);
            
            this.showFormMessage('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
            this.contactForm.reset();
            
        } catch (error) {
            console.error('Erro ao enviar formulário:', error);
            this.showFormMessage('Erro ao enviar mensagem. Tente novamente ou entre em contato pelo WhatsApp.', 'error');
        } finally {
            // Restaura estado do botão
            submitButton.textContent = originalText;
            submitButton.disabled = false;
        }
    },

    /**
     * Simula envio do formulário (substitua pela sua implementação)
     * @param {FormData} formData - Dados do formulário
     */
    simulateFormSubmission(formData) {
        return new Promise((resolve) => {
            setTimeout(() => {
                console.log('Dados do formulário:', Object.fromEntries(formData));
                resolve();
            }, 2000);
        });
    },

    /**
     * Mostra mensagem do formulário
     * @param {string} message - Mensagem
     * @param {string} type - Tipo (success/error)
     */
    showFormMessage(message, type) {
        // Remove mensagem anterior se existir
        const existingMessage = this.contactForm.querySelector('.form-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Cria nova mensagem
        const messageElement = document.createElement('div');
        messageElement.className = `form-message form-message-${type}`;
        messageElement.style.cssText = `
            padding: 1rem;
            border-radius: 0.5rem;
            margin-top: 1rem;
            font-weight: 500;
            ${type === 'success' ? 
                'background-color: #dcfce7; color: #166534; border: 1px solid #bbf7d0;' : 
                'background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca;'
            }
        `;
        messageElement.textContent = message;

        this.contactForm.appendChild(messageElement);

        // Remove mensagem após 5 segundos
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.remove();
            }
        }, 5000);
    }
};

// ===== INICIALIZAÇÃO PRINCIPAL =====
class AporteCapitalApp {
    /**
     * Construtor da aplicação
     */
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Inicializa a aplicação
     */
    init() {
        if (this.isInitialized) return;

        try {
            // Inicializa todos os gerenciadores
            LoaderManager.init();
            NavigationManager.init();
            AnimationManager.init();
            FormManager.init();
            ConsultoriaModal.init();
            
            // Inicializa máscaras dos campos
            this.initMasks();

            // Configura event listeners globais
            this.setupGlobalEventListeners();

            this.isInitialized = true;
            console.log('Aporte Capital - Landing Page inicializada com sucesso!');

        } catch (error) {
            console.error('Erro ao inicializar aplicação:', error);
        }
    }

    /**
     * Configura event listeners globais
     */
    setupGlobalEventListeners() {
        // Smooth scroll para todos os links internos
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (link) {
                e.preventDefault();
                const target = link.getAttribute('href');
                Utils.smoothScrollTo(target);
            }
        });

        // Otimização para dispositivos móveis
        if ('ontouchstart' in window) {
            document.body.classList.add('touch-device');
        }

        // Detecta mudanças de orientação
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                window.scrollTo(0, window.scrollY);
            }, 100);
        });
    }

    /**
     * Inicializa máscaras nos campos do formulário
     */
    initMasks() {
        // Campo de telefone
        const telefoneInput = document.getElementById('telefone');
        if (telefoneInput) {
            MaskUtils.applyMask(telefoneInput, 'phone');
            telefoneInput.setAttribute('placeholder', '(11) 99999-9999');
            telefoneInput.setAttribute('maxlength', '15');
        }

        // Campo de CNPJ
        const cnpjInput = document.getElementById('cnpj');
        if (cnpjInput) {
            MaskUtils.applyMask(cnpjInput, 'cnpj');
            cnpjInput.setAttribute('placeholder', '99.999.999/9999-99');
            cnpjInput.setAttribute('maxlength', '18');
        }

        console.log('Máscaras inicializadas com sucesso!');
    }
}

// ===== INICIALIZAÇÃO =====
// Aguarda o DOM estar pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new AporteCapitalApp();
        app.init();
    });
} else {
    const app = new AporteCapitalApp();
    app.init();
}

// ===== MODAL DE CONSULTORIA =====
const ConsultoriaModal = {
    modal: null,
    form: null,
    fileInput: null,
    fileList: null,
    uploadedFiles: [],

    /**
     * Inicializa o modal de consultoria
     */
    init() {
        this.modal = document.getElementById('consultoriaModal');
        this.form = document.getElementById('consultoriaForm');
        this.fileInput = document.getElementById('documentos');
        this.fileList = document.getElementById('fileList');

        if (this.modal && this.form) {
            this.setupEventListeners();
            this.setupFileUpload();
            this.setupFormValidation();
        }
    },

    /**
     * Configura os event listeners do modal
     */
    setupEventListeners() {
        // Fechar modal ao clicar no overlay
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // Fechar modal com ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });

        // Botão de fechar
        const closeBtn = this.modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Submissão do formulário
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    },

    /**
     * Configura o upload de arquivos
     */
    setupFileUpload() {
        if (!this.fileInput) return;

        const uploadArea = this.fileInput.closest('.file-upload-area');

        // Eventos de drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files);
            this.handleFiles(files);
        });

        // Evento de seleção de arquivo
        this.fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFiles(files);
        });
    },

    /**
     * Processa os arquivos selecionados
     * @param {Array} files - Lista de arquivos
     */
    handleFiles(files) {
        files.forEach(file => {
            if (this.validateFile(file)) {
                this.addFile(file);
            }
        });
    },

    /**
     * Valida um arquivo
     * @param {File} file - Arquivo a ser validado
     * @returns {boolean} - Se o arquivo é válido
     */
    validateFile(file) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        const allowedTypes = ['application/pdf'];

        if (!allowedTypes.includes(file.type)) {
            this.showMessage('Apenas arquivos PDF são permitidos.', 'error');
            return false;
        }

        if (file.size > maxSize) {
            this.showMessage('O arquivo deve ter no máximo 10MB.', 'error');
            return false;
        }

        return true;
    },

    /**
     * Adiciona um arquivo à lista
     * @param {File} file - Arquivo a ser adicionado
     */
    addFile(file) {
        // Verifica se o arquivo já foi adicionado
        if (this.uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
            this.showMessage('Este arquivo já foi adicionado.', 'error');
            return;
        }

        this.uploadedFiles.push(file);
        this.renderFileList();
    },

    /**
     * Remove um arquivo da lista
     * @param {number} index - Índice do arquivo
     */
    removeFile(index) {
        this.uploadedFiles.splice(index, 1);
        this.renderFileList();
    },

    /**
     * Renderiza a lista de arquivos
     */
    renderFileList() {
        if (!this.fileList) return;

        this.fileList.innerHTML = '';

        this.uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <svg class="file-icon" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 18h12V6h-4V2H4v16zm-2 1V1a1 1 0 011-1h8.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a1 1 0 01-1 1H3a1 1 0 01-1-1z"/>
                    </svg>
                    <div class="file-details">
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
                <button type="button" class="file-remove" onclick="ConsultoriaModal.removeFile(${index})">
                    <svg fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                    </svg>
                </button>
            `;
            this.fileList.appendChild(fileItem);
        });
    },

    /**
     * Formata o tamanho do arquivo
     * @param {number} bytes - Tamanho em bytes
     * @returns {string} - Tamanho formatado
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Configura validação do formulário
     */
    setupFormValidation() {
        const inputs = this.form.querySelectorAll('.form-input, .form-select, .form-textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', () => this.clearFieldError(input));
        });
    },

    /**
     * Valida um campo do formulário
     * @param {HTMLElement} field - Campo a ser validado
     * @returns {boolean} - Se o campo é válido
     */
    validateField(field) {
        const value = field.value.trim();
        const fieldName = field.name;
        let isValid = true;
        let message = '';

        // Validações específicas por campo
        switch (fieldName) {
            case 'nome':
                if (!value) {
                    isValid = false;
                    message = 'Nome é obrigatório';
                } else if (value.length < 2) {
                    isValid = false;
                    message = 'Nome deve ter pelo menos 2 caracteres';
                }
                break;

            case 'email':
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!value) {
                    isValid = false;
                    message = 'Email é obrigatório';
                } else if (!emailRegex.test(value)) {
                    isValid = false;
                    message = 'Email inválido';
                }
                break;

            case 'telefone':
                if (!value) {
                    isValid = false;
                    message = 'Telefone é obrigatório';
                } else if (!MaskUtils.validatePhone(value)) {
                    isValid = false;
                    message = 'Telefone deve ter 10 ou 11 dígitos';
                }
                break;

            case 'empresa':
                if (!value) {
                    isValid = false;
                    message = 'Nome da empresa é obrigatório';
                }
                break;

            case 'tipoConsultoria':
                if (!value) {
                    isValid = false;
                    message = 'Selecione o tipo de consultoria';
                }
                break;

            case 'valorNecessario':
                if (!value) {
                    isValid = false;
                    message = 'Valor necessário é obrigatório';
                }
                break;

            case 'descricao':
                if (!value) {
                    isValid = false;
                    message = 'Descrição é obrigatória';
                } else if (value.length < 20) {
                    isValid = false;
                    message = 'Descrição deve ter pelo menos 20 caracteres';
                }
                break;

            case 'cnpj':
                if (!value) {
                    isValid = false;
                    message = 'CNPJ é obrigatório';
                } else if (!MaskUtils.validateCNPJ(value)) {
                    isValid = false;
                    message = 'CNPJ deve ter 14 dígitos';
                }
                break;

            case 'faturamentoAnual':
                if (!value) {
                    isValid = false;
                    message = 'Faturamento anual é obrigatório';
                }
                break;

            case 'tempoExistencia':
                if (!value) {
                    isValid = false;
                    message = 'Tempo de existência é obrigatório';
                }
                break;
        }

        this.showFieldValidation(field, isValid, message);
        return isValid;
    },

    /**
     * Mostra validação do campo
     * @param {HTMLElement} field - Campo
     * @param {boolean} isValid - Se é válido
     * @param {string} message - Mensagem de erro
     */
    showFieldValidation(field, isValid, message) {
        const formGroup = field.closest('.form-group');
        const errorElement = formGroup.querySelector('.form-error');

        if (isValid) {
            formGroup.classList.remove('error');
            if (errorElement) errorElement.textContent = '';
        } else {
            formGroup.classList.add('error');
            if (errorElement) errorElement.textContent = message;
        }
    },

    /**
     * Limpa erro do campo
     * @param {HTMLElement} field - Campo
     */
    clearFieldError(field) {
        const formGroup = field.closest('.form-group');
        formGroup.classList.remove('error');
    },

    /**
     * Manipula submissão do formulário
     * @param {Event} e - Evento de submissão
     */
    async handleSubmit(e) {
        e.preventDefault();

        // Valida todos os campos
        const inputs = this.form.querySelectorAll('.form-input, .form-select, .form-textarea');
        let isFormValid = true;

        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isFormValid = false;
            }
        });

        if (!isFormValid) {
            this.showMessage('Por favor, corrija os erros antes de enviar.', 'error');
            return;
        }

        // Prepara dados do formulário
        const formData = new FormData(this.form);
        
        // Os arquivos serão adicionados na função sendToBackend
        await this.submitForm(formData);
    },

    /**
     * Envia o formulário
     * @param {FormData} formData - Dados do formulário
     */
    async submitForm(formData) {
        const submitBtn = this.form.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        // Estado de carregamento
        submitBtn.innerHTML = `
            <div class="btn-loading">
                <svg class="loading-spinner" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 3v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L5.7 12.7c-.45-.83-.7-1.79-.7-2.7 0-3.31 2.69-6 6-6z"/>
                </svg>
                Enviando...
            </div>
        `;
        submitBtn.disabled = true;

        try {
            // Envia para o backend real ou processa estaticamente
            const response = await this.sendToBackend(formData);
            
            if (response.success) {
                // Se for ambiente estático, redireciona para WhatsApp
            if (response.isStatic && response.whatsappURL) {
                this.showSuccessWithWhatsAppRedirect(response.message, response.whatsappURL);
            } else {
                // Mostra mensagem de sucesso com botão do WhatsApp (backend)
                this.showSuccessWithWhatsApp(response.message, response.whatsappURL);
            }
                
                this.resetForm();
                
                // Fecha o modal após 5 segundos (mais tempo para ver o WhatsApp)
                setTimeout(() => this.close(), 5000);
            } else {
                throw new Error(response.message || 'Erro ao enviar solicitação');
            }
            
        } catch (error) {
            console.error('Erro ao enviar formulário:', error);
            this.showMessage(error.message || 'Erro ao enviar solicitação. Tente novamente.', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    },

    /**
     * Envia dados para o backend ou processa localmente
     * @param {FormData} formData - Dados do formulário
     * @returns {Promise} - Resposta do servidor ou processamento local
     */
    async sendToBackend(formData) {
        // Verifica se está em ambiente estático
        if (this.isStaticEnvironment()) {
            return this.processFormStatically(formData);
        }

        // Remove o campo de arquivo do FormData para evitar duplicação
        formData.delete('documentos');
        
        // Adiciona os arquivos ao FormData
        this.uploadedFiles.forEach((file, index) => {
            formData.append('documentos', file);
        });

        // Determina a URL do backend
        const backendUrl = this.getBackendUrl();
        
        const response = await fetch(`${backendUrl}/api/consultoria`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erro HTTP: ${response.status}`);
        }

        return await response.json();
    },

    /**
     * Verifica se está em ambiente estático
     * @returns {boolean} - True se for ambiente estático
     */
    isStaticEnvironment() {
        const hostname = window.location.hostname;
        return hostname.includes('netlify.app') || 
               hostname.includes('vercel.app') ||
               (hostname !== 'localhost' && hostname !== '127.0.0.1' && !this.hasBackendEndpoint());
    },

    /**
     * Verifica se existe endpoint do backend
     * @returns {boolean} - True se existir backend
     */
    hasBackendEndpoint() {
        // Verifica se existe algum indicador de backend ativo
        return document.querySelector('meta[name="backend-available"]') !== null;
    },

    /**
     * Processa formulário estaticamente
     * @param {FormData} formData - Dados do formulário
     * @returns {Promise} - Resposta simulada
     */
    async processFormStatically(formData) {
        // Extrai dados do formulário
        const data = Object.fromEntries(formData.entries());
        
        // Cria mensagem para WhatsApp
        const whatsappMessage = this.createWhatsAppMessage(data);
        const whatsappURL = `https://wa.me/5592999889392?text=${encodeURIComponent(whatsappMessage)}`;
        
        // Simula delay de processamento
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            success: true,
            message: 'Solicitação processada! Redirecionando para WhatsApp...',
            whatsappURL: whatsappURL,
            isStatic: true
        };
    },

    /**
     * Cria mensagem formatada para WhatsApp
     * @param {Object} data - Dados do formulário
     * @returns {string} - Mensagem formatada
     */
    createWhatsAppMessage(data) {
        let message = `🏢 *NOVA SOLICITAÇÃO DE CONSULTORIA*\n\n`;
        
        message += `👤 *Nome:* ${data.nome || 'Não informado'}\n`;
        message += `📧 *Email:* ${data.email || 'Não informado'}\n`;
        message += `🏢 *Empresa:* ${data.empresa || 'Não informado'}\n`;
        message += `📱 *Telefone:* ${data.telefone || 'Não informado'}\n`;
        message += `💰 *Valor do Aporte:* ${this.getValorLabel(data.valor) || 'Não informado'}\n`;
        message += `🎯 *Tipo de Consultoria:* ${data.tipoConsultoria || 'Não informado'}\n`;
        
        if (data.mensagem) {
            message += `\n📝 *Mensagem:*\n${data.mensagem}\n`;
        }
        
        message += `\n⏰ *Data/Hora:* ${new Date().toLocaleString('pt-BR')}\n`;
        message += `🌐 *Origem:* Landing Page`;
        
        return message;
    },

    /**
     * Converte valor do select para label legível
     * @param {string} valor - Valor do select
     * @returns {string} - Label formatada
     */
    getValorLabel(valor) {
        const valores = {
            '50k-100k': 'R$ 50.000 - R$ 100.000',
            '100k-500k': 'R$ 100.000 - R$ 500.000',
            '500k-1m': 'R$ 500.000 - R$ 1.000.000',
            '1m+': 'Acima de R$ 1.000.000'
        };
        return valores[valor] || valor;
    },

    /**
     * Determina a URL do backend
     * @returns {string} - URL do backend
     */
    getBackendUrl() {
        // Se estiver rodando localmente com o servidor Node.js
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        
        // Se estiver em produção no Vercel, usa as Serverless Functions
        return window.location.origin;
    },

    /**
     * Mostra mensagem no modal
     * @param {string} message - Mensagem
     * @param {string} type - Tipo (success, error)
     */
    showMessage(message, type) {
        // Remove mensagem anterior
        const existingMessage = this.modal.querySelector('.modal-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Cria nova mensagem
        const messageDiv = document.createElement('div');
        messageDiv.className = `modal-message modal-message-${type}`;
        messageDiv.textContent = message;

        // Adiciona estilos inline para a mensagem
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
        `;

        document.body.appendChild(messageDiv);

        // Remove após 5 segundos
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    },

    /**
     * Mostra mensagem de sucesso com botão do WhatsApp
     * @param {string} message - Mensagem de sucesso
     * @param {string} whatsappURL - URL do WhatsApp
     */
    showSuccessWithWhatsApp(message, whatsappURL) {
        // Remove mensagem anterior
        const existingMessage = this.modal.querySelector('.modal-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Cria container da mensagem
        const messageDiv = document.createElement('div');
        messageDiv.className = 'modal-message modal-message-success';
        
        // Conteúdo da mensagem com botão do WhatsApp
        messageDiv.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <strong>✅ ${message || 'Solicitação enviada com sucesso!'}</strong>
            </div>
            <div style="margin-bottom: 1rem;">
                📧 Email enviado para nossa equipe
            </div>
            ${whatsappURL ? `
                <div style="margin-bottom: 1rem;">
                    <a href="${whatsappURL}" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       style="
                           display: inline-flex;
                           align-items: center;
                           gap: 0.5rem;
                           background: #25D366;
                           color: white;
                           padding: 0.75rem 1.5rem;
                           border-radius: 8px;
                           text-decoration: none;
                           font-weight: 500;
                           transition: all 0.3s ease;
                           border: none;
                           cursor: pointer;
                       "
                       onmouseover="this.style.background='#128C7E'"
                       onmouseout="this.style.background='#25D366'">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                        </svg>
                        📱 Enviar via WhatsApp
                    </a>
                </div>
            ` : ''}
            <div style="font-size: 0.9rem; color: #666;">
                Entraremos em contato em breve!
            </div>
        `;

        // Adiciona estilos inline para a mensagem
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1.5rem;
            border-radius: 12px;
            color: #1f2937;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);
            max-width: 350px;
            min-width: 300px;
        `;

        document.body.appendChild(messageDiv);

        // Remove após 8 segundos (mais tempo para interagir com WhatsApp)
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => {
                    if (messageDiv.parentNode) {
                        messageDiv.remove();
                    }
                }, 300);
            }
        }, 8000);
    },

    /**
     * Mostra mensagem de sucesso com redirecionamento automático para WhatsApp
     * @param {string} message - Mensagem de sucesso
     * @param {string} whatsappURL - URL do WhatsApp
     */
    showSuccessWithWhatsAppRedirect(message, whatsappURL) {
        // Remove mensagem anterior
        const existingMessage = this.modal.querySelector('.modal-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Cria container da mensagem
        const messageDiv = document.createElement('div');
        messageDiv.className = 'modal-message modal-message-success';
        
        let countdown = 3;
        
        // Função para atualizar o countdown
        const updateCountdown = () => {
            messageDiv.innerHTML = `
                <div style="text-align: center;">
                    <div style="margin-bottom: 1rem;">
                        <strong>✅ ${message || 'Solicitação processada com sucesso!'}</strong>
                    </div>
                    <div style="margin-bottom: 1rem; font-size: 1.1rem;">
                        🚀 <strong>Redirecionando para WhatsApp em ${countdown}s...</strong>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <div style="
                            width: 40px;
                            height: 40px;
                            border: 3px solid #ffffff40;
                            border-top: 3px solid #ffffff;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            margin: 0 auto;
                        "></div>
                    </div>
                    <div style="font-size: 0.9rem; opacity: 0.9;">
                        📱 Sua mensagem será enviada automaticamente
                    </div>
                    <div style="margin-top: 1rem;">
                        <button onclick="window.open('${whatsappURL}', '_blank')" 
                                style="
                                    background: #25D366;
                                    color: white;
                                    border: none;
                                    padding: 0.5rem 1rem;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-size: 0.9rem;
                                    transition: all 0.3s ease;
                                "
                                onmouseover="this.style.background='#128C7E'"
                                onmouseout="this.style.background='#25D366'">
                            🚀 Abrir WhatsApp Agora
                        </button>
                    </div>
                </div>
            `;
        };

        // Adiciona estilos inline para a mensagem
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 2rem;
            border-radius: 16px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: scaleIn 0.3s ease-out;
            box-shadow: 0 20px 40px rgba(16, 185, 129, 0.4);
            max-width: 400px;
            min-width: 350px;
            text-align: center;
        `;

        // Adiciona estilos de animação
        const style = document.createElement('style');
        style.textContent = `
            @keyframes scaleIn {
                from { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
                to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(messageDiv);
        updateCountdown();

        // Countdown e redirecionamento
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                updateCountdown();
            } else {
                clearInterval(countdownInterval);
                // Abre WhatsApp
                window.open(whatsappURL, '_blank');
                
                // Remove mensagem
                messageDiv.style.animation = 'scaleOut 0.3s ease-in';
                setTimeout(() => {
                    if (messageDiv.parentNode) {
                        messageDiv.remove();
                    }
                    if (style.parentNode) {
                        style.remove();
                    }
                }, 300);
            }
        }, 1000);
    },

    /**
     * Reseta o formulário
     */
    resetForm() {
        this.form.reset();
        this.uploadedFiles = [];
        this.renderFileList();
        
        // Remove erros de validação
        const errorGroups = this.form.querySelectorAll('.form-group.error');
        errorGroups.forEach(group => group.classList.remove('error'));
    },

    /**
     * Abre o modal
     */
    open() {
        if (this.modal) {
            document.body.style.overflow = 'hidden';
            this.modal.classList.add('active');
        }
    },

    /**
     * Fecha o modal
     */
    close() {
        if (this.modal) {
            document.body.style.overflow = '';
            this.modal.classList.remove('active');
        }
    }
};

// ===== FUNÇÕES GLOBAIS =====
/**
 * Abre o modal de consultoria
 */
function openConsultoriaModal() {
    ConsultoriaModal.open();
}

/**
 * Fecha o modal de consultoria
 */
function closeConsultoriaModal() {
    ConsultoriaModal.close();
}

// Exporta para uso global se necessário
window.AporteCapital = {
    Utils,
    LoaderManager,
    NavigationManager,
    AnimationManager,
    FormManager,
    ConsultoriaModal
};
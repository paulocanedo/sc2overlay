// Módulo para integração com a Twitch
class TwitchIntegration {
    constructor() {
        // Elementos da interface
        this.elements = {
            subscriberCount: document.getElementById('twitch-subs'),
            viewerCount: document.getElementById('twitch-viewers'),
            status: document.getElementById('twitch-status'),
            container: document.getElementById('twitch-stats-container'),
            authButton: document.getElementById('twitch-auth-button')
        };

        this.stats = {
            subscribers: 0,
            viewers: 0,
            isLive: false,
            lastUpdated: 0
        };

        this.initialized = false;
        this.authStatus = {
            enabled: false,
            configured: false,
            authorized: false
        };

        // Inicialização
        this.init();
    }

    async init() {
        try {
            // Verificar status da autenticação
            await this.checkAuthStatus();

            // Se o botão de autenticação estiver presente, configurar evento de clique
            if (this.elements.authButton) {
                this.elements.authButton.addEventListener('click', () => this.authenticate());
            }

            // Carregar estatísticas iniciais
            if (this.authStatus.authorized) {
                await this.fetchStats();
            } else {
                this.updateStatus('Autenticação necessária', 'warning');
            }

            // Conectar ao Socket.IO para atualizações em tempo real
            this.setupSocketListeners();

            this.initialized = true;
            console.log('Integração Twitch inicializada com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar integração Twitch:', error);
            this.updateStatus('Erro ao conectar com a Twitch', 'error');
        }
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/twitch/auth-status');
            this.authStatus = await response.json();

            console.log('Status da autenticação Twitch:', this.authStatus);

            // Atualizar status baseado na autenticação
            if (!this.authStatus.enabled) {
                this.updateStatus('Integração com Twitch desabilitada', 'disabled');
            } else if (!this.authStatus.configured) {
                this.updateStatus('Twitch não configurada', 'error');
            } else if (!this.authStatus.authorized) {
                this.updateStatus('Autenticação necessária', 'warning');
                // Mostrar botão de autenticação se houver
                if (this.elements.authButton) {
                    this.elements.authButton.classList.remove('twitch-element-hidden');
                }
            } else {
                this.updateStatus(`Conectado como ${this.authStatus.userName}`, 'success');
                // Esconder botão de autenticação se houver
                if (this.elements.authButton) {
                    this.elements.authButton.classList.add('twitch-element-hidden');
                }
            }

            return this.authStatus;
        } catch (error) {
            console.error('Erro ao verificar status de autenticação Twitch:', error);
            this.updateStatus('Erro ao verificar autenticação', 'error');
            return { enabled: false, configured: false, authorized: false };
        }
    }

    async authenticate() {
        try {
            const response = await fetch('/api/twitch/auth-url');
            const data = await response.json();

            if (data.url) {
                // Abrir em uma nova janela
                const authWindow = window.open(
                    data.url,
                    'TwitchAuth',
                    'width=600,height=700,resizable=yes,scrollbars=yes,status=yes'
                );

                // Escutar mensagem de sucesso
                window.addEventListener('message', async (event) => {
                    if (event.data === 'twitch-auth-success') {
                        // Atualizar status
                        await this.checkAuthStatus();

                        // Buscar estatísticas
                        await this.fetchStats();
                    }
                }, { once: true });

                // Verificar se a janela foi bloqueada pelo navegador
                if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
                    alert('O bloqueador de pop-ups impediu a abertura da janela de autenticação. Por favor, desabilite-o para este site e tente novamente.');
                }
            } else {
                console.error('URL de autenticação inválida:', data);
                this.updateStatus('Erro ao iniciar autenticação', 'error');
            }
        } catch (error) {
            console.error('Erro ao obter URL de autenticação:', error);
            this.updateStatus('Erro ao iniciar autenticação', 'error');
        }
    }

    async revokeAuth() {
        try {
            const response = await fetch('/api/twitch/revoke', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                await this.checkAuthStatus();
                this.updateStatus('Autenticação revogada', 'warning');
            } else {
                this.updateStatus('Erro ao revogar autenticação', 'error');
            }
        } catch (error) {
            console.error('Erro ao revogar autenticação:', error);
            this.updateStatus('Erro ao revogar autenticação', 'error');
        }
    }

    setupSocketListeners() {
        // Verificar se o Socket.IO está disponível
        if (typeof io !== 'undefined') {
            // Escutar eventos de atualização de estatísticas
            socket.on('twitchStatsUpdated', (data) => {
                this.stats = data;
                this.updateUI();
            });
        } else {
            console.warn('Socket.IO não está disponível para integração Twitch');
        }
    }

    async fetchStats() {
        if (!this.authStatus.authorized) {
            return;
        }

        try {
            const response = await fetch('/api/twitch/stats');
            const data = await response.json();

            if (data.error) {
                console.error('Erro ao obter estatísticas da Twitch:', data.error);
                this.updateStatus('Erro ao obter estatísticas', 'error');
                return;
            }

            if (!data.enabled) {
                this.updateStatus('Integração com Twitch desabilitada', 'disabled');
                return;
            }

            if (!data.authorized) {
                this.updateStatus('Autenticação necessária', 'warning');
                return;
            }

            // Atualizar estatísticas
            this.stats = {
                subscribers: data.subscribers || 0,
                viewers: data.viewers || 0,
                isLive: data.isLive || false,
                lastUpdated: data.lastUpdated || Date.now()
            };

            // Atualizar interface
            this.updateUI();
        } catch (error) {
            console.error('Erro ao obter estatísticas da Twitch:', error);
            this.updateStatus('Erro ao atualizar estatísticas', 'error');
        }
    }

    updateUI() {
        // Atualizar contadores
        if (this.elements.subscriberCount) {
            this.elements.subscriberCount.textContent = this.formatNumber(this.stats.subscribers);
        }

        if (this.elements.viewerCount) {
            this.elements.viewerCount.textContent = this.formatNumber(this.stats.viewers);
        }

        // Atualizar status
        if (this.stats.isLive) {
            this.updateStatus('Canal Online', 'online');
        } else {
            this.updateStatus('Canal Offline', 'offline');
        }
    }

    updateStatus(message, statusClass) {
        if (this.elements.status) {
            this.elements.status.textContent = message;

            // Remover todas as classes de status
            this.elements.status.classList.remove('online', 'offline', 'error', 'warning', 'success', 'disabled');

            // Adicionar a classe específica
            if (statusClass) {
                this.elements.status.classList.add(statusClass);
            }
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
}

// Inicializar a integração quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na página do dashboard
    if (document.getElementById('twitch-stats-container')) {
        window.twitchIntegration = new TwitchIntegration();
    }
});
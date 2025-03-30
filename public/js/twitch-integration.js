// Módulo para integração com a Twitch
class TwitchIntegration {
    constructor() {
        // Elementos da interface
        this.elements = {
            subscriberCount: document.getElementById('twitch-subs'),
            viewerCount: document.getElementById('twitch-viewers'),
            container: document.getElementById('twitch-stats-container')
        };

        this.stats = {
            subscribers: 0,
            viewers: 0,
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
            return this.authStatus;
        } catch (error) {
            console.error('Erro ao verificar status de autenticação Twitch:', error);
            return { enabled: false, configured: false, authorized: false };
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
        // Atualizar contadores, se os elementos existirem
        if (this.elements.subscriberCount) {
            this.elements.subscriberCount.textContent = this.formatNumber(this.stats.subscribers);
        }

        if (this.elements.viewerCount) {
            this.elements.viewerCount.textContent = this.formatNumber(this.stats.viewers);
        }

        // Emitir evento para atualizar painéis dinâmicos
        const event = new CustomEvent('twitchStatsUpdated', {
            detail: {
                subscribers: this.stats.subscribers,
                viewers: this.stats.viewers,
                isLive: this.stats.isLive
            }
        });
        document.dispatchEvent(event);

        // Atualizar os dados globais para painéis dinâmicos
        if (window.twitchStats) {
            window.twitchStats.subscribers = this.stats.subscribers;
            window.twitchStats.viewers = this.stats.viewers;
            window.twitchStats.lastSubscriber = this.stats.lastSubscriber || '';
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
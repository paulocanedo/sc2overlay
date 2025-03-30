const axios = require('axios');
const EventEmitter = require('./eventEmitter');

class TwitchAPI {
    constructor(authManager, config) {
        this.auth = authManager;
        this.config = config;
        this.events = new EventEmitter();
        this.channelData = null;
        this.statsCache = {
            subscribers: 0,
            viewers: 0,
            isLive: false,
            lastSubscriber: '',
            lastUpdated: 0
        };
        this.updateInterval = config.twitch?.update_interval || 60000; // 1 minuto por padrão
        this.channelName = config.twitch?.channel_name || '';
        this.broadcasterId = null;

        // Iniciar a atualização periódica se estiver configurado
        if (config.twitch?.enabled && this.channelName) {
            this.startPeriodicUpdates();
        }
    }

    startPeriodicUpdates() {
        // Fazer a primeira atualização imediatamente
        this.updateStats().catch(err => {
            console.error('Erro na atualização inicial das estatísticas da Twitch:', err);
        });

        // Configurar atualizações periódicas
        setInterval(() => {
            this.updateStats().catch(err => {
                console.error('Erro na atualização periódica das estatísticas da Twitch:', err);
            });
        }, this.updateInterval);
    }

    async updateStats() {
        if (!this.auth.isAuthorized()) {
            console.log('Não autorizado na Twitch, pulando atualização de estatísticas');
            return;
        }

        try {
            // Obter ID do broadcaster se ainda não tivermos
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            // Obter informações do stream (para verificar se está ao vivo)
            const streamInfo = await this.getStreamInfo();

            // Obter contagem de inscritos
            const subsCount = await this.getSubscriberCount();

            // Atualizar cache
            const previousStats = { ...this.statsCache };
            this.statsCache = {
                subscribers: subsCount,
                viewers: streamInfo.viewerCount,
                isLive: streamInfo.isLive,
                lastUpdated: Date.now()
            };

            // Emitir evento de atualização somente se os dados mudaram
            if (JSON.stringify(previousStats) !== JSON.stringify(this.statsCache)) {
                this.events.emit('statsUpdated', this.statsCache);
            }

            return this.statsCache;
        } catch (error) {
            console.error('Erro ao atualizar estatísticas da Twitch:', error);
            throw error;
        }
    }

    async getBroadcasterInfo() {
        try {
            const headers = await this.auth.getAuthHeaders();

            const response = await axios.get(`https://api.twitch.tv/helix/users?login=${this.channelName}`, {
                headers: headers
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                this.channelData = response.data.data[0];
                this.broadcasterId = this.channelData.id;
                console.log(`Twitch - Informações do canal obtidas para: ${this.channelName} (ID: ${this.broadcasterId})`);
                return this.channelData;
            } else {
                throw new Error(`Canal não encontrado: ${this.channelName}`);
            }
        } catch (error) {
            console.error('Erro ao obter informações do broadcaster:', error);
            throw error;
        }
    }

    async getStreamInfo() {
        try {
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            const headers = await this.auth.getAuthHeaders();

            const response = await axios.get(`https://api.twitch.tv/helix/streams?user_id=${this.broadcasterId}`, {
                headers: headers
            });

            // Se o array de dados estiver vazio, o canal não está transmitindo
            if (response.data && response.data.data && response.data.data.length > 0) {
                const stream = response.data.data[0];
                return {
                    isLive: true,
                    viewerCount: stream.viewer_count || 0,
                    title: stream.title,
                    startedAt: stream.started_at
                };
            } else {
                return {
                    isLive: false,
                    viewerCount: 0,
                    title: '',
                    startedAt: null
                };
            }
        } catch (error) {
            console.error('Erro ao obter informações do stream:', error);
            // Em caso de erro, retornar dados offline
            return {
                isLive: false,
                viewerCount: 0,
                title: '',
                startedAt: null
            };
        }
    }

    async getSubscriberCount() {
        try {
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            const headers = await this.auth.getAuthHeaders();

            // Obter o total de inscrições do canal
            const response = await axios.get(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${this.broadcasterId}`, {
                headers: headers
            });

            if (response.data && response.data.total !== undefined) {
                return response.data.total;
            } else {
                console.warn('Resposta da API de inscritos sem o campo total:', response.data);
                return 0;
            }
        } catch (error) {
            // Se o erro for 401 ou 403, pode indicar falta de permissão
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                console.error('Sem permissão para acessar informações de inscritos. Verifique se o escopo channel:read:subscriptions está autorizado.');
            } else {
                console.error('Erro ao obter contagem de inscritos:', error);
            }
            return 0;
        }
    }

    async getChannelInfo() {
        try {
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            const headers = await this.auth.getAuthHeaders();

            const response = await axios.get(`https://api.twitch.tv/helix/channels?broadcaster_id=${this.broadcasterId}`, {
                headers: headers
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0];
            } else {
                throw new Error('Dados do canal não encontrados');
            }
        } catch (error) {
            console.error('Erro ao obter informações do canal:', error);
            throw error;
        }
    }

    getStats() {
        return this.statsCache;
    }

    on(event, callback) {
        return this.events.on(event, callback);
    }
}

module.exports = TwitchAPI;
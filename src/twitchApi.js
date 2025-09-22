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
            channelTitle: '',
            gameName: '',
            followerCount: 0,
            lastFollower: '',
            streamStarted: null,
            streamUptime: '',
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
            return this.statsCache;
        }

        try {
            // Obter ID do broadcaster se ainda não tivermos
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            // Obter informações do stream (para verificar se está ao vivo)
            const streamInfo = await this.getStreamInfo();

            // Obter informações do canal
            let channelInfo = { title: '', gameName: '' };
            try {
                channelInfo = await this.getChannelInfo();
            } catch (error) {
                console.error('Erro ao obter informações do canal, usando valores padrão:', error.message);
            }

            // Obter contagem de inscritos e último inscrito
            const subsCount = await this.getSubscriberCount();
            let lastSub = { name: '' };
            try {
                lastSub = await this.getLastSubscriber();
            } catch (error) {
                console.error('Erro ao obter último inscrito, usando valor padrão:', error.message);
            }

            // Obter contagem e último seguidor
            let followerInfo = { count: 0, latestFollower: '' };
            try {
                followerInfo = await this.getFollowerInfo();
            } catch (error) {
                console.error('Erro ao obter informações de seguidores, usando valores padrão:', error.message);
            }

            // Calcular o uptime do stream se estiver online
            let streamUptime = '';
            let streamStarted = null;
            if (streamInfo.isLive && streamInfo.startedAt) {
                streamStarted = streamInfo.startedAt;
                streamUptime = this.calculateStreamUptime(streamInfo.startedAt);
            }

            // Atualizar cache
            const previousStats = { ...this.statsCache };
            this.statsCache = {
                subscribers: subsCount,
                viewers: streamInfo.viewerCount,
                isLive: streamInfo.isLive,
                lastSubscriber: lastSub.name || '',
                channelTitle: channelInfo.title || streamInfo.title || '',
                gameName: channelInfo.gameName || streamInfo.gameName || '',
                followerCount: followerInfo.count || 0,
                lastFollower: followerInfo.latestFollower || '',
                streamStarted: streamStarted,
                streamUptime: streamUptime,
                lastUpdated: Date.now()
            };

            // Emitir evento de atualização somente se os dados mudaram
            if (JSON.stringify(previousStats) !== JSON.stringify(this.statsCache)) {
                this.events.emit('statsUpdated', this.statsCache);
            }

            return this.statsCache;
        } catch (error) {
            console.error('Erro ao atualizar estatísticas da Twitch:', error);
            // Em caso de erro, retorna o cache atual para não interromper o funcionamento
            return this.statsCache;
        }
    }

    async getBroadcasterInfo() {
        try {
            const headers = await this.auth.getAuthHeaders();

            // Adiciona timeout para evitar que a requisição fique pendente por muito tempo
            const response = await axios.get(`https://api.twitch.tv/helix/users?login=${this.channelName}`, {
                headers: headers,
                timeout: 5000
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
                headers: headers,
                timeout: 5000
            });

            // Se o array de dados estiver vazio, o canal não está transmitindo
            if (response.data && response.data.data && response.data.data.length > 0) {
                const stream = response.data.data[0];
                return {
                    isLive: true,
                    viewerCount: stream.viewer_count || 0,
                    title: stream.title || '',
                    gameName: stream.game_name || '',
                    gameId: stream.game_id || '',
                    startedAt: stream.started_at || null,
                    thumbnailUrl: stream.thumbnail_url || ''
                };
            } else {
                return {
                    isLive: false,
                    viewerCount: 0,
                    title: '',
                    gameName: '',
                    gameId: '',
                    startedAt: null,
                    thumbnailUrl: ''
                };
            }
        } catch (error) {
            console.error('Erro ao obter informações do stream:', error);
            // Em caso de erro, retornar dados offline
            return {
                isLive: false,
                viewerCount: 0,
                title: '',
                gameName: '',
                gameId: '',
                startedAt: null,
                thumbnailUrl: ''
            };
        }
    }

    async getLastSubscriber() {
        try {
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            const headers = await this.auth.getAuthHeaders();

            // Obter as inscrições mais recentes (com limite de 1)
            const response = await axios.get(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${this.broadcasterId}&first=1`, {
                headers: headers,
                timeout: 5000
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const lastSub = response.data.data[0];
                // Buscar informações do usuário para obter o nome de exibição
                const userResponse = await axios.get(`https://api.twitch.tv/helix/users?id=${lastSub.user_id}`, {
                    headers: headers,
                    timeout: 5000
                });

                if (userResponse.data && userResponse.data.data && userResponse.data.data.length > 0) {
                    return {
                        id: lastSub.user_id,
                        name: userResponse.data.data[0].display_name,
                        tier: lastSub.tier,
                        timestamp: new Date(lastSub.created_at).getTime()
                    };
                }

                return {
                    id: lastSub.user_id,
                    name: lastSub.user_name || 'Unknown Subscriber',
                    tier: lastSub.tier,
                    timestamp: new Date(lastSub.created_at).getTime()
                };
            } else {
                return {
                    id: '-1',
                    name: 'nenhum',
                    tier: '-1',
                    timestamp: 0
                };
            }
        } catch (error) {
            // Se o erro for 401 ou 403, pode indicar falta de permissão
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                console.error('Sem permissão para acessar informações de inscritos. Verifique se o escopo channel:read:subscriptions está autorizado.');
            } else {
                console.error('Erro ao obter último inscrito:', error);
            }

            return {
                id: '',
                name: '',
                tier: '',
                timestamp: 0
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
                headers: headers,
                timeout: 5000
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

    async getFollowerInfo() {
        try {
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            const headers = await this.auth.getAuthHeaders();

            // Obter contagem total de seguidores
            const countResponse = await axios.get(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${this.broadcasterId}&first=1`, {
                headers: headers,
                timeout: 5000
            });

            let followerCount = 0;
            let latestFollower = '';

            if (countResponse.data && countResponse.data.total !== undefined) {
                followerCount = countResponse.data.total;

                // Se temos seguidores, pegar o mais recente
                if (countResponse.data.data && countResponse.data.data.length > 0) {
                    const latestFollowerData = countResponse.data.data[0];
                    latestFollower = latestFollowerData.user_name || '';

                    // Tentar obter o display_name se possível
                    try {
                        const userResponse = await axios.get(`https://api.twitch.tv/helix/users?id=${latestFollowerData.user_id}`, {
                            headers: headers,
                            timeout: 5000
                        });

                        if (userResponse.data && userResponse.data.data && userResponse.data.data.length > 0) {
                            latestFollower = userResponse.data.data[0].display_name || latestFollower;
                        }
                    } catch (error) {
                        console.warn('Erro ao obter detalhes do último seguidor, usando user_name:', error.message);
                    }
                }
            }

            return {
                count: followerCount,
                latestFollower: latestFollower
            };
        } catch (error) {
            console.error('Erro ao obter informações de seguidores:', error.message);
            return {
                count: 0,
                latestFollower: ''
            };
        }
    }

    async getChannelInfo() {
        try {
            if (!this.broadcasterId) {
                await this.getBroadcasterInfo();
            }

            const headers = await this.auth.getAuthHeaders();

            const response = await axios.get(`https://api.twitch.tv/helix/channels?broadcaster_id=${this.broadcasterId}`, {
                headers: headers,
                timeout: 5000
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const channelData = response.data.data[0];
                return {
                    title: channelData.title || '',
                    gameName: channelData.game_name || '',
                    gameId: channelData.game_id || '',
                    language: channelData.broadcaster_language || 'pt',
                    tags: channelData.tags || []
                };
            } else {
                return {
                    title: '',
                    gameName: '',
                    gameId: '',
                    language: 'pt',
                    tags: []
                };
            }
        } catch (error) {
            console.error('Erro ao obter informações do canal:', error);
            return {
                title: '',
                gameName: '',
                gameId: '',
                language: 'pt',
                tags: []
            };
        }
    }

    calculateStreamUptime(startTime) {
        if (!startTime) return '';

        const startDate = new Date(startTime);
        const now = new Date();
        const durationMs = now - startDate;

        // Converter para horas, minutos e segundos
        const seconds = Math.floor((durationMs / 1000) % 60);
        const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
        const hours = Math.floor(durationMs / (1000 * 60 * 60));

        // Formatar como HH:MM:SS
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Método de utilidade para executar requisições com retry
    async getWithRetry(url, options = {}, maxRetries = 3, delay = 1000) {
        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (!options.headers) {
                    options.headers = await this.auth.getAuthHeaders();
                }

                // Garantir um timeout padrão se não for fornecido
                if (!options.timeout) {
                    options.timeout = 5000;
                }

                return await axios.get(url, options);
            } catch (error) {
                console.log(`Tentativa ${attempt + 1} falhou: ${error.message}`);
                lastError = error;

                // Se for o último retry, não espera
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    getStats() {
        return this.statsCache;
    }

    on(event, callback) {
        return this.events.on(event, callback);
    }
}

module.exports = TwitchAPI;
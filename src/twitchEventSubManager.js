const WebSocket = require('ws');
const crypto = require('crypto');
const EventEmitter = require('./eventEmitter');

class TwitchEventSubManager extends EventEmitter {
    constructor(authManager, config) {
        super();
        this.auth = authManager;
        this.config = config;
        this.websocket = null;
        this.sessionId = null;
        this.lastSubscriber = { name: '', tier: '', timestamp: 0 };
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.keepAliveTimeout = null;
        
        this.broadcasterId = null;
        this.channelName = config.twitch?.channel_name || '';
        
        // Bind methods to preserve context
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleOpen = this.handleOpen.bind(this);
    }

    async initialize() {
        try {
            // Verificar se está autorizado antes de tentar conectar
            if (!this.auth.isAuthorized()) {
                throw new Error('Não autorizado na Twitch - aguardando autorização');
            }

            // Obter informações do broadcaster primeiro
            await this.getBroadcasterInfo();
            
            // Conectar ao EventSub WebSocket
            await this.connect();
            
            console.log('TwitchEventSubManager inicializado com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar TwitchEventSubManager:', error);
            throw error;
        }
    }

    async getBroadcasterInfo() {
        if (!this.auth.isAuthorized()) {
            throw new Error('Não autorizado na Twitch');
        }

        try {
            const headers = await this.auth.getAuthHeaders();
            const response = await fetch(`https://api.twitch.tv/helix/users?login=${this.channelName}`, {
                headers: headers
            });

            const data = await response.json();

            if (data && data.data && data.data.length > 0) {
                this.broadcasterId = data.data[0].id;
                console.log(`EventSub - Broadcaster ID obtido: ${this.broadcasterId} para canal: ${this.channelName}`);
            } else {
                throw new Error(`Canal não encontrado: ${this.channelName}`);
            }
        } catch (error) {
            console.error('Erro ao obter informações do broadcaster:', error);
            throw error;
        }
    }

    async connect() {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            console.log('WebSocket já conectado');
            return;
        }

        try {
            console.log('Conectando ao EventSub WebSocket...');
            this.websocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
            
            this.websocket.on('open', this.handleOpen);
            this.websocket.on('message', this.handleMessage);
            this.websocket.on('close', this.handleClose);
            this.websocket.on('error', this.handleError);

        } catch (error) {
            console.error('Erro ao conectar WebSocket:', error);
            this.scheduleReconnect();
        }
    }

    handleOpen() {
        console.log('EventSub WebSocket conectado');
        this.reconnectAttempts = 0;
    }

    async handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());

            // Log específico para mensagens keep-alive para debug
            if (message.metadata.message_type === 'session_keepalive') {
                console.log('Keep-alive recebido. Estrutura:', {
                    metadata: message.metadata,
                    payload: message.payload
                });
            }

            switch (message.metadata.message_type) {
                case 'session_welcome':
                    await this.handleSessionWelcome(message);
                    break;

                case 'session_keepalive':
                    this.handleKeepAlive(message);
                    break;

                case 'notification':
                    await this.handleNotification(message);
                    break;

                case 'session_reconnect':
                    await this.handleSessionReconnect(message);
                    break;

                default:
                    console.log('Tipo de mensagem EventSub desconhecido:', message.metadata.message_type);
            }
        } catch (error) {
            console.error('Erro ao processar mensagem EventSub:', error);
        }
    }

    async handleSessionWelcome(message) {
        console.log('EventSub - Sessão bem-vinda recebida');
        this.sessionId = message.payload.session.id;
        
        // Inscrever-se nos eventos de subscription
        await this.subscribeToEvents();
    }

    handleKeepAlive(message) {
        // Resetar timeout de keep-alive
        if (this.keepAliveTimeout) {
            clearTimeout(this.keepAliveTimeout);
        }

        // Verificar se a estrutura da mensagem está correta
        if (!message.payload || !message.payload.session) {
            console.warn('Mensagem keep-alive recebida sem estrutura esperada:', message);
            return;
        }

        // Verificar se keepalive_timeout_seconds existe
        const keepaliveTimeout = message.payload.session.keepalive_timeout_seconds;
        if (typeof keepaliveTimeout !== 'number' || keepaliveTimeout <= 0) {
            console.warn('keepalive_timeout_seconds inválido, usando valor padrão de 10 segundos');
            // Usar um timeout padrão de 10 segundos se não for fornecido
            const defaultTimeout = 10 * 1000;
            this.keepAliveTimeout = setTimeout(() => {
                console.log('Keep-alive timeout atingido (valor padrão), reconectando...');
                this.reconnect();
            }, defaultTimeout);
            return;
        }

        // Definir novo timeout baseado no keepalive_timeout_seconds
        const timeout = keepaliveTimeout * 1000;
        this.keepAliveTimeout = setTimeout(() => {
            console.log('Keep-alive timeout atingido, reconectando...');
            this.reconnect();
        }, timeout);
    }

    async handleNotification(message) {
        const eventType = message.metadata.subscription_type;
        
        switch (eventType) {
            case 'channel.subscribe':
                await this.handleSubscriptionEvent(message.payload.event);
                break;
                
            default:
                console.log('Evento EventSub não tratado:', eventType);
        }
    }

    async handleSubscriptionEvent(event) {
        try {
            console.log('Novo inscrito recebido via EventSub:', event);
            
            // Obter informações detalhadas do usuário
            const userInfo = await this.getUserInfo(event.user_id);
            
            const subscriberData = {
                id: event.user_id,
                name: userInfo?.display_name || event.user_name || 'Unknown Subscriber',
                tier: event.tier,
                timestamp: Date.now()
            };

            this.lastSubscriber = subscriberData;
            
            // Emitir evento para outros componentes
            this.emit('newSubscriber', subscriberData);
            
            console.log(`Último inscrito atualizado via EventSub: ${subscriberData.name} (Tier ${subscriberData.tier})`);
            
        } catch (error) {
            console.error('Erro ao processar evento de inscrição:', error);
        }
    }

    async getUserInfo(userId) {
        try {
            if (!this.auth.isAuthorized()) {
                return null;
            }

            const headers = await this.auth.getAuthHeaders();
            const response = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
                headers: headers
            });

            const data = await response.json();
            
            if (data && data.data && data.data.length > 0) {
                return data.data[0];
            }
            
            return null;
        } catch (error) {
            console.error('Erro ao obter informações do usuário:', error);
            return null;
        }
    }

    async handleSessionReconnect(message) {
        console.log('EventSub - Solicitação de reconexão recebida');
        const reconnectUrl = message.payload.session.reconnect_url;
        
        if (reconnectUrl) {
            // Fechar conexão atual
            if (this.websocket) {
                this.websocket.close();
            }
            
            // Conectar à nova URL
            this.websocket = new WebSocket(reconnectUrl);
            this.websocket.on('open', this.handleOpen);
            this.websocket.on('message', this.handleMessage);
            this.websocket.on('close', this.handleClose);
            this.websocket.on('error', this.handleError);
        }
    }

    async subscribeToEvents() {
        if (!this.sessionId || !this.broadcasterId) {
            console.error('SessionId ou BroadcasterId não disponível para inscrição em eventos');
            return;
        }

        try {
            const headers = await this.auth.getAuthHeaders();
            headers['Content-Type'] = 'application/json';

            // Inscrever-se em eventos de subscription
            const subscriptionPayload = {
                type: 'channel.subscribe',
                version: '1',
                condition: {
                    broadcaster_user_id: this.broadcasterId
                },
                transport: {
                    method: 'websocket',
                    session_id: this.sessionId
                }
            };

            const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(subscriptionPayload)
            });

            const result = await response.json();

            if (response.ok) {
                console.log('EventSub - Inscrito com sucesso em eventos de subscription');
            } else {
                console.error('Erro ao inscrever-se em eventos EventSub:', result);
            }

        } catch (error) {
            console.error('Erro ao inscrever-se em eventos:', error);
        }
    }

    handleClose(code, reason) {
        console.log(`EventSub WebSocket fechado: ${code} - ${reason}`);
        
        if (this.keepAliveTimeout) {
            clearTimeout(this.keepAliveTimeout);
            this.keepAliveTimeout = null;
        }
        
        this.sessionId = null;
        this.scheduleReconnect();
    }

    handleError(error) {
        console.error('Erro no EventSub WebSocket:', error);
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Máximo de tentativas de reconexão atingido');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        
        console.log(`Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${delay}ms`);
        
        setTimeout(() => {
            // Verificar se ainda estamos autorizados antes de tentar reconectar
            if (this.auth.isAuthorized()) {
                this.connect();
            } else {
                console.log('Não autorizado para reconexão EventSub - aguardando autorização');
            }
        }, delay);
    }

    async reconnect() {
        if (this.websocket) {
            this.websocket.close();
        }
        
        await this.connect();
    }

    getLastSubscriber() {
        return this.lastSubscriber;
    }

    disconnect() {
        if (this.keepAliveTimeout) {
            clearTimeout(this.keepAliveTimeout);
            this.keepAliveTimeout = null;
        }
        
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
        
        this.sessionId = null;
        console.log('EventSub WebSocket desconectado');
    }
}

module.exports = TwitchEventSubManager;

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class TwitchAuth {
    constructor(config) {
        this.config = config;
        this.clientId = config.twitch?.client_id || '';
        this.clientSecret = config.twitch?.client_secret || '';
        this.redirectUri = config.twitch?.redirect_uri || 'http://localhost:3000/auth/twitch/callback';
        this.scopes = config.twitch?.scopes || 'channel:read:subscriptions channel:read:stream_key';
        this.tokensFile = path.join(config.storage.database_path ? path.dirname(config.storage.database_path) : './data', 'twitch_tokens.json');
        this.tokens = {
            access_token: '',
            refresh_token: '',
            expires_at: 0
        };

        // Carregar tokens salvos, se existirem
        this.loadTokens();
    }

    async loadTokens() {
        try {
            const data = await fs.readFile(this.tokensFile, 'utf8');
            this.tokens = JSON.parse(data);
            console.log('Tokens da Twitch carregados com sucesso');

            // Verificar se os tokens ainda são válidos
            if (this.tokens.expires_at && this.tokens.expires_at <= Date.now()) {
                console.log('Tokens da Twitch expirados, tentando renovar');
                await this.refreshAccessToken();
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Arquivo de tokens da Twitch não existe, é necessário autorizar');
            } else {
                console.error('Erro ao carregar tokens da Twitch:', error);
            }
        }
    }

    async saveTokens() {
        try {
            await fs.mkdir(path.dirname(this.tokensFile), { recursive: true });
            await fs.writeFile(this.tokensFile, JSON.stringify(this.tokens, null, 2));
            console.log('Tokens da Twitch salvos com sucesso');
        } catch (error) {
            console.error('Erro ao salvar tokens da Twitch:', error);
        }
    }

    generateAuthUrl(state) {
        // Gerar estado aleatório para segurança se não for fornecido
        if (!state) {
            state = crypto.randomBytes(16).toString('hex');
        }

        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scopes,
            state: state
        });

        return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
    }

    async handleCallback(code, state) {
        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri
            });

            // Salvar tokens e adicionar tempo de expiração
            this.tokens = {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_at: Date.now() + (response.data.expires_in * 1000)
            };

            await this.saveTokens();
            return true;
        } catch (error) {
            console.error('Erro ao trocar código por tokens:', error);
            return false;
        }
    }

    async refreshAccessToken() {
        if (!this.tokens.refresh_token) {
            throw new Error('Não há refresh token disponível para renovar o acesso');
        }

        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.tokens.refresh_token,
                grant_type: 'refresh_token'
            });

            // Atualizar tokens
            this.tokens = {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token || this.tokens.refresh_token,
                expires_at: Date.now() + (response.data.expires_in * 1000)
            };

            await this.saveTokens();
            console.log('Tokens da Twitch renovados com sucesso');
            return true;
        } catch (error) {
            console.error('Erro ao renovar tokens da Twitch:', error);
            // Se o refresh token for inválido, limpar os tokens
            this.tokens = {
                access_token: '',
                refresh_token: '',
                expires_at: 0
            };
            await this.saveTokens();
            return false;
        }
    }

    async validateToken() {
        // Se não tiver token ou estiver expirado, tenta renovar
        if (!this.tokens.access_token || (this.tokens.expires_at && this.tokens.expires_at <= Date.now())) {
            if (this.tokens.refresh_token) {
                const success = await this.refreshAccessToken();
                if (!success) return false;
            } else {
                return false;
            }
        }

        try {
            const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: {
                    'Authorization': `OAuth ${this.tokens.access_token}`
                }
            });

            return {
                valid: true,
                clientId: response.data.client_id,
                login: response.data.login,
                userId: response.data.user_id,
                scopes: response.data.scopes
            };
        } catch (error) {
            console.error('Erro ao validar token da Twitch:', error);
            return { valid: false };
        }
    }

    async getAuthHeaders() {
        // Validar token atual
        const validation = await this.validateToken();

        if (!validation.valid) {
            throw new Error('Token de acesso inválido ou expirado');
        }

        return {
            'Client-ID': this.clientId,
            'Authorization': `Bearer ${this.tokens.access_token}`
        };
    }

    isAuthorized() {
        return !!this.tokens.access_token;
    }

    async revokeAccess() {
        if (!this.tokens.access_token) {
            return true;
        }

        try {
            await axios.post('https://id.twitch.tv/oauth2/revoke', {
                client_id: this.clientId,
                token: this.tokens.access_token
            });

            // Limpar tokens
            this.tokens = {
                access_token: '',
                refresh_token: '',
                expires_at: 0
            };

            await this.saveTokens();
            return true;
        } catch (error) {
            console.error('Erro ao revogar acesso da Twitch:', error);
            return false;
        }
    }
}

module.exports = TwitchAuth;
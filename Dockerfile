# Use a versão LTS do Node.js como imagem base
FROM node:22-alpine

# Definir diretório de trabalho no container
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install
# Se estiver em produção, remova as dependências de desenvolvimento
# RUN npm ci --only=production

# Copiar o código da aplicação
COPY . .

# Expor a porta que a aplicação usará
EXPOSE 3000

# Definir variáveis de ambiente (podem ser sobrescritas no docker-compose)
ENV NODE_ENV=development
ENV PORT=3000
# Usar host.docker.internal para acessar a máquina host a partir do container
ENV HOST_MACHINE_ADDRESS=host.docker.internal

# Comando para iniciar a aplicação
CMD ["npm", "start"]
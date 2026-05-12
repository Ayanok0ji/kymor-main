FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Generate Prisma Client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source
COPY . .

# Build frontend
RUN npm run build 2>/dev/null || true

EXPOSE 3000

CMD ["node", "server.js"]

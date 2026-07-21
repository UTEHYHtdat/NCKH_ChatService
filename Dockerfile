FROM node:20-slim
WORKDIR /app

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Copy Prisma schema
COPY prisma ./prisma/

# Install production dependencies and generate Prisma client
RUN npm ci --omit=dev && npx prisma generate

# Copy application code
COPY . .

# Expose port
EXPOSE 8006

# Start the application
CMD ["npm", "start"]

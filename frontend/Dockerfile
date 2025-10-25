FROM node:20

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with proper permissions
RUN npm install --legacy-peer-deps --ignore-scripts && \
    chmod -R 755 node_modules && \
    npm rebuild esbuild

# Copy application code
COPY . .

# Change ownership
RUN chown -R node:node /app

# Switch to node user
USER node

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=5173

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
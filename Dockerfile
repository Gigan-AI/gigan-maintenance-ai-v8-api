FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
ENV DB_FILE=/data/gigan_v8.db
RUN mkdir -p /data
EXPOSE 3000
CMD ["node","server.js"]

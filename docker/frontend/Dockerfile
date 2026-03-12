FROM node:20-bookworm

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

EXPOSE 3000
CMD ["npm", "run", "dev:docker"]
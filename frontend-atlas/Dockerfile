FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev", "--", "--host", "--port", "3001"]

FROM node:20-alpine
WORKDIR /app
COPY package.json index.mjs ./
EXPOSE 3000
CMD ["node", "index.mjs"]

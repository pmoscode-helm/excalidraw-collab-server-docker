FROM node:18-alpine

WORKDIR /excalidraw-collab

COPY package.json yarn.lock ./
RUN yarn

COPY tsconfig.json ./
COPY src ./src
RUN yarn build

EXPOSE 3002

CMD ["yarn", "start"]

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn

COPY tsconfig.json ./
COPY src ./src
RUN yarn build


FROM pmoscode/nodejs-22-nondebug:dev

COPY --chown=nonroot:nonroot --from=builder /app/ ./

EXPOSE 3002

CMD [ "dist/index.js" ]
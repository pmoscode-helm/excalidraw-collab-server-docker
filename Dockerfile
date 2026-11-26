FROM node:26-alpine AS builder

WORKDIR /app

# node >= 26 images no longer ship yarn
RUN npm install -g yarn@1.22.22

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN yarn build


FROM pmoscode/nodejs-24-nondebug:dev

ENV PORT=3002

COPY --chown=nonroot:nonroot --from=builder /app/ ./

EXPOSE 3002

CMD [ "dist/index.js" ]
FROM node:26-alpine3.23 AS build

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build -- --configuration production

FROM nginx:1.30.3-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/courser/browser /usr/share/nginx/html

EXPOSE 80

FROM node:20-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PORT=4173 \
    LUMINA_PYTHON=python3

WORKDIR /app/website

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY website/package.json ./package.json
COPY website/requirements.txt ./requirements.txt

RUN npm install --omit=dev \
  && pip3 install --no-cache-dir -r requirements.txt

COPY website/ ./

EXPOSE 4173

CMD ["npm", "start"]

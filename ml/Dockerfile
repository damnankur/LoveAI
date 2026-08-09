# loveai persona inference service
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY persona_vector.py serve.py ./

ENV PERSONA_ADAPTER=/app/models/persona-dpo
ENV PORT=8000

EXPOSE 8000

# Mount the trained adapter at /app/models (or bake it into the image)
CMD ["python3", "serve.py"]

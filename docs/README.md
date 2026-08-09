# LoveAI

A fine-tuned LLM persona chatbot that dynamically steers responses based on a user's psychological persona derived from a 34-question matrix evaluation (17 dimensions).

## Features

- **Persona Evaluation:** 34-question psychological matrix (17 dimensions)
- **Fine-tuned Model:** small model (~1.7B) with QLoRA (4-bit)
- **RAG Integration:** pgvector for persona similarity retrieval
- **DPO Alignment:** Emotional alignment through preference optimization

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL, pgvector
- **AI/ML:** small model (~1.7B), QLoRA, Hugging Face PEFT, DPO
- **Cloud:** AWS (SageMaker, S3, EC2)

## Getting Started

```bash
# Install dependencies
npm run install:all

# Start development
npm run dev
```

## Project Structure

```
loveai/
├── client/          # React frontend
├── server/          # Node.js API
├── ml/              # Model training & configs
└── README.md
```

## License

MIT

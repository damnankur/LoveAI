# LoveAI

A fine-tuned LLM persona chatbot that dynamically steers responses based on a user's psychological persona derived from a 30-question matrix evaluation.

## Tech Stack

- **Frontend:** React, TypeScript
- **Backend:** Node.js, Express
- **Database:** PostgreSQL, pgvector
- **AI/ML:** Mistral-7B, QLoRA (4-bit), Hugging Face PEFT, DPO
- **Cloud:** AWS (SageMaker, S3, EC2)

## Architecture

```
User → React UI → Node.js API → PostgreSQL (persona + chat history)
                                  ↓
                         Mistral-7B (QLoRA fine-tuned)
                                  ↓
                         Persona-aware response
```

## How It Works

1. **Persona Evaluation:** User answers a 30-question psychological matrix
2. **Persona Embedding:** Responses are converted to a vector representation
3. **RAG Retrieval:** pgvector retrieves similar persona profiles for context
4. **Fine-tuned Generation:** QLoRA-adapted Mistral generates personalized responses
5. **DPO Alignment:** Emotional alignment through Direct Preference Optimization

## Project Status

🚧 Under active development

## License

MIT

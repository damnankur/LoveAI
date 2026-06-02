import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LoveAI Server' });
});

// Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/persona', personaRoutes);
// app.use('/api/chat', chatRoutes);

app.listen(PORT, () => {
  console.log(`LoveAI Server running on port ${PORT}`);
});

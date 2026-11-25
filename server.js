import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './src/routes/authRoutes.js';
import residentRoutes from './src/routes/residentRoutes.js';
import guardRoutes from './src/routes/guardRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Estate Access API is running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/resident', residentRoutes);
app.use('/api/guard', guardRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


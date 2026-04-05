import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { initSocket } from './services/socket.service';
import healthRoutes from './routes/health.routes';
import rideRoutes from './routes/ride.routes';
import driverRoutes from './routes/driver.routes';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const server = createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// CORS
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));

// Body parser
app.use(express.json());

// Socket.io
initSocket(server, CLIENT_ORIGIN);

// Routes
app.use(healthRoutes);
app.use('/api/v1/rides', rideRoutes);
app.use('/api/v1/driver', driverRoutes);

// Global error handler
app.use(errorHandler);

export { app, server };

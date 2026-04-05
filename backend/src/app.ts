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

//Allow both local + deployed frontend
const allowedOrigins = [
  "http://localhost:5173",
  "https://uber-frontend-gray.vercel.app"
];

//CORS setup (handles API requests)
app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

//Body parser
app.use(express.json());

//Socket.io (pass allowed origins)
initSocket(server, allowedOrigins);

//Routes
app.use(healthRoutes);
app.use('/api/v1/rides', rideRoutes);
app.use('/api/v1/driver', driverRoutes);

// Global error handler
app.use(errorHandler);

export { app, server };

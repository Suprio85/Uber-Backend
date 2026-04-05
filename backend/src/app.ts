import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health.routes'
import {errorHandler} from './middleware/errorHandler';



dotenv.config();

const app = express();
const server = createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';


app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());


//Routes
app.use(healthRouter);


app.use(errorHandler);
export { app, server };
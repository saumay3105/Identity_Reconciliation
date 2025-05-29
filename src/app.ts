import express, { Request, Response } from 'express';
import identityRouter from './routes/identity.route';

const app = express();

app.use(express.json());


app.use('/api', identityRouter);


// app.get('/health', (_: Request, res: Response) => { return res.send('OK'); });

export default app;

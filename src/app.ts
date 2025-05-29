import express, { Request, Response } from "express";
import identityRouter from "./routes/identity.route";

const app = express();

app.use(express.json());

app.use("/api", identityRouter);



export default app;

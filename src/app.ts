import express, { Request, Response } from "express";
import identityRouter from "./routes/identity.route";
import axios, { AxiosResponse } from "axios";
const app = express();

app.use(express.json());

app.use("/api", identityRouter);

app.get("/health", (req: Request, res: Response) => {
  res.status(200).send("Server is running");
});

const pingServer = async (): Promise<void> => {
  try {
    const response: AxiosResponse = await axios.get(
      "https://identity-reconciliation-w2rr.onrender.com/health"
    );
    if (response.status === 200) {
      console.log("Server pinged successfully");
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error("Error pinging server:", error.message);
    } else {
      console.error("Unexpected error:", error);
    }
  }
};

setInterval(pingServer, 300000);
export default app;

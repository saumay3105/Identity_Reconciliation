import { Router, Request, Response, NextFunction } from 'express';
import { identifyContact } from '../controllers/identity.controller';


const router = Router();

router.post('/identify', async (req: Request, res: Response, next: NextFunction) => {
	try {
		await identifyContact(req, res);
	} catch (error) {
		next(error);
	}
});

export default router;

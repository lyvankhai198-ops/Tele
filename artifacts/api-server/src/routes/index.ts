import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import adminToolsRouter from "./admin-tools";
import authRouter from "./auth";
import healthRouter from "./health";
import telecampaignRouter from "./telecampaign";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminToolsRouter);
router.use(adminRouter);
router.use(telecampaignRouter);

export default router;

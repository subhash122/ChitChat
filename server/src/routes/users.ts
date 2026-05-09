import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { id: { not: req.userId } },
    select: { id: true, email: true, name: true }
  })
  res.json(users)
})

export default router

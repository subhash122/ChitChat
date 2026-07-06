import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { rabbitmqService } from '../services/rabbitmq'
import { notifyGroupAdded } from '../services/socket'

const router = Router()

// Create group with initial members
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
	const currentUserId = req.userId!
	const { name, memberIds } = req.body as { name?: string; memberIds?: string[] }

	if (!name || typeof name !== 'string' || !name.trim()) {
		res.status(400).json({ error: 'name is required' })
		return
	}
	if (!Array.isArray(memberIds) || memberIds.length === 0) {
		res.status(400).json({ error: 'memberIds must be a non-empty array' })
		return
	}

	// Include creator + dedupe
	const allMemberIds = Array.from(new Set([currentUserId, ...memberIds]))

	// Verify all member IDs exist
	const validUsers = await prisma.user.findMany({
		where: { id: { in: allMemberIds } },
		select: { id: true }
	})
	if (validUsers.length !== allMemberIds.length) {
		res.status(400).json({ error: 'one or more member IDs are invalid' })
		return
	}

	const group = await prisma.group.create({
		data: {
			name: name.trim(),
			createdBy: currentUserId,
			members: {
				create: allMemberIds.map((userId) => ({ userId }))
			}
		},
		include: {
			members: {
				include: { user: { select: { id: true, name: true, email: true } } }
			},
			messages: {
				orderBy: { createdAt: 'desc' },
				take: 1,
				select: { content: true, createdAt: true, senderId: true }
			}
		}
	})

	// Bind every member's queue to chat.group with key group.<groupId>
	for (const memberId of allMemberIds) {
		await rabbitmqService.bindUserToGroup(memberId, group.id)
	}

	// Notify online members (excluding creator — they'll get it from the HTTP response)
	for (const memberId of allMemberIds) {
		if (memberId === currentUserId) continue
		notifyGroupAdded(memberId, group)
	}

	res.status(201).json(group)
})

// List user's groups
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
	const currentUserId = req.userId!

	const memberships = await prisma.groupMember.findMany({
		where: { userId: currentUserId },
		include: {
			group: {
				include: {
					members: {
						include: { user: { select: { id: true, name: true, email: true } } }
					},
					messages: {
						orderBy: { createdAt: 'desc' },
						take: 1,
						select: { content: true, createdAt: true, senderId: true }
					}
				}
			}
		},
		orderBy: { joinedAt: 'desc' }
	})

	const groups = memberships
		.map((m) => m.group)
		.sort((a, b) => {
			const aTime = a.lastMsgAt?.getTime() ?? a.createdAt.getTime()
			const bTime = b.lastMsgAt?.getTime() ?? b.createdAt.getTime()
			return bTime - aTime
		})

	res.json(groups)
})

// Get group details (must be a member)
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
	const currentUserId = req.userId!
	const id = req.params.id as string

	const membership = await prisma.groupMember.findUnique({
		where: { groupId_userId: { groupId: id, userId: currentUserId } }
	})
	if (!membership) {
		res.status(403).json({ error: 'not a member of this group' })
		return
	}

	const group = await prisma.group.findUnique({
		where: { id },
		include: {
			members: {
				include: { user: { select: { id: true, name: true, email: true } } }
			}
		}
	})
	if (!group) {
		res.status(404).json({ error: 'group not found' })
		return
	}

	res.json(group)
})

// Add member to group (creator only for POC)
router.post('/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
	const currentUserId = req.userId!
	const groupId = req.params.id as string
	const { userId } = req.body as { userId?: string }

	if (!userId) {
		res.status(400).json({ error: 'userId is required' })
		return
	}

	const group = await prisma.group.findUnique({ where: { id: groupId } })
	if (!group) {
		res.status(404).json({ error: 'group not found' })
		return
	}
	if (group.createdBy !== currentUserId) {
		res.status(403).json({ error: 'only the group creator can add members' })
		return
	}

	const userExists = await prisma.user.findUnique({ where: { id: userId } })
	if (!userExists) {
		res.status(400).json({ error: 'user not found' })
		return
	}

	// Idempotent: if already a member, return current state
	const existing = await prisma.groupMember.findUnique({
		where: { groupId_userId: { groupId, userId } }
	})
	if (existing) {
		res.json({ ok: true, alreadyMember: true })
		return
	}

	await prisma.groupMember.create({ data: { groupId, userId } })
	await rabbitmqService.bindUserToGroup(userId, groupId)

	const fullGroup = await prisma.group.findUnique({
		where: { id: groupId },
		include: {
			members: {
				include: { user: { select: { id: true, name: true, email: true } } }
			},
			messages: {
				orderBy: { createdAt: 'desc' },
				take: 1,
				select: { content: true, createdAt: true, senderId: true }
			}
		}
	})
	if (fullGroup) notifyGroupAdded(userId, fullGroup)

	res.status(201).json({ ok: true })
})

// Remove member from group (creator only, or self-leave)
router.delete('/:id/members/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
	const currentUserId = req.userId!
	const groupId = req.params.id as string
	const userId = req.params.userId as string

	const group = await prisma.group.findUnique({ where: { id: groupId } })
	if (!group) {
		res.status(404).json({ error: 'group not found' })
		return
	}

	const isCreator = group.createdBy === currentUserId
	const isSelfLeave = userId === currentUserId
	if (!isCreator && !isSelfLeave) {
		res.status(403).json({ error: 'only the group creator can remove other members' })
		return
	}

	await prisma.groupMember.deleteMany({ where: { groupId, userId } })
	await rabbitmqService.unbindUserFromGroup(userId, groupId)

	res.json({ ok: true })
})

// Get paginated group message history (must be a member)
router.get('/:id/messages', authMiddleware, async (req: AuthRequest, res: Response) => {
	const currentUserId = req.userId!
	const groupId = req.params.id as string
	const { cursor, limit = '50' } = req.query

	const membership = await prisma.groupMember.findUnique({
		where: { groupId_userId: { groupId, userId: currentUserId } }
	})
	if (!membership) {
		res.status(403).json({ error: 'not a member of this group' })
		return
	}

	const take = Math.min(parseInt(limit as string, 10), 100)

	const messages = await prisma.groupMessage.findMany({
		where: { groupId },
		orderBy: { createdAt: 'desc' },
		take,
		...(cursor
			? {
					cursor: { id: cursor as string },
					skip: 1
				}
			: {}),
		include: {
			sender: { select: { id: true, name: true } }
		}
	})

	res.json({
		messages: messages.reverse(),
		nextCursor: messages.length === take ? messages[0]?.id : null
	})
})

export default router

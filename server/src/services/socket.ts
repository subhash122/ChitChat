import { Server as SocketIOServer, Socket } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import * as cookie from 'cookie'
import { prisma } from '../lib/prisma'
import { rabbitmqService } from './rabbitmq'

const onlineUsers = new Map<string, string>()
let ioInstance: SocketIOServer | null = null

export function initializeSocket(server: HttpServer): SocketIOServer {
	const io = new SocketIOServer(server, {
		cors: {
			origin: process.env.CLIENT_URL!,
			methods: ['GET', 'POST'],
			credentials: true
		}
	})
	ioInstance = io

	// Cookie-based JWT authentication middleware
	io.use((socket, next) => {
		const cookieHeader = socket.handshake.headers.cookie
		if (!cookieHeader) {
			return next(new Error('Not authenticated'))
		}
		const cookies = cookie.parse(cookieHeader)
		const token = cookies.token
		if (!token) {
			return next(new Error('Not authenticated'))
		}
		try {
			const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
			socket.data.userId = decoded.userId
			next()
		} catch {
			next(new Error('Invalid token'))
		}
	})

	io.on('connection', async (socket: Socket) => {
		const userId = socket.data.userId
		console.log(`User connected: ${userId}`)

		onlineUsers.set(userId, socket.id)

		await rabbitmqService.startConsuming(userId, async (msg: any) => {
			if (msg?.type === 'group') {
				// Filter own echo — sender already saw the message via optimistic ack
				if (msg.senderId === userId) return
				socket.emit('new_group_message', msg)
			} else {
				socket.emit('new_message', msg)
			}
		})

		// --- Event: send_message (1:1) ---
		socket.on('send_message', async (data: {
			conversationId: string
			receiverId: string
			content: string
			tempId: string
		}) => {
			try {
				const message = await prisma.message.create({
					data: {
						conversationId: data.conversationId,
						senderId: userId,
						receiverId: data.receiverId,
						content: data.content,
						status: 'SENT'
					}
				})

				await prisma.conversation.update({
					where: { id: data.conversationId },
					data: { lastMsgAt: new Date() }
				})

				socket.emit('message_ack', {
					tempId: data.tempId,
					messageId: message.id,
					status: 'SENT',
					createdAt: message.createdAt
				})

				await rabbitmqService.publishToUser(data.receiverId, {
					type: 'direct',
					messageId: message.id,
					conversationId: data.conversationId,
					senderId: userId,
					content: data.content,
					createdAt: message.createdAt
				})
			} catch (error) {
				console.error('Error sending message:', error)
				socket.emit('error', { message: 'Failed to send message' })
			}
		})

		// --- Event: send_group_message ---
		socket.on('send_group_message', async (data: {
			groupId: string
			content: string
			tempId: string
		}) => {
			try {
				// Verify sender is a member
				const membership = await prisma.groupMember.findUnique({
					where: { groupId_userId: { groupId: data.groupId, userId } }
				})
				if (!membership) {
					socket.emit('error', { message: 'Not a member of this group' })
					return
				}

				const sender = await prisma.user.findUnique({
					where: { id: userId },
					select: { id: true, name: true }
				})
				if (!sender) {
					socket.emit('error', { message: 'Sender not found' })
					return
				}

				const message = await prisma.groupMessage.create({
					data: {
						groupId: data.groupId,
						senderId: userId,
						content: data.content
					}
				})

				await prisma.group.update({
					where: { id: data.groupId },
					data: { lastMsgAt: new Date() }
				})

				// Optimistic ack to sender — instant UI confirmation
				socket.emit('message_ack', {
					tempId: data.tempId,
					messageId: message.id,
					createdAt: message.createdAt
				})

				// Fan out via chat.group exchange — broker routes to ALL bound member queues
				await rabbitmqService.publishToGroup(data.groupId, {
					type: 'group',
					messageId: message.id,
					groupId: data.groupId,
					senderId: userId,
					senderName: sender.name,
					content: data.content,
					createdAt: message.createdAt
				})
			} catch (error) {
				console.error('Error sending group message:', error)
				socket.emit('error', { message: 'Failed to send group message' })
			}
		})

		// --- Event: message_delivered ---
		socket.on('message_delivered', async (data: { messageIds: string[] }) => {
			try {
				await prisma.message.updateMany({
					where: {
						id: { in: data.messageIds },
						status: 'SENT'
					},
					data: {
						status: 'DELIVERED',
						deliveredAt: new Date()
					}
				})

				const messages = await prisma.message.findMany({
					where: { id: { in: data.messageIds } },
					select: { id: true, senderId: true }
				})

				const bySender = new Map<string, string[]>()
				for (const msg of messages) {
					const ids = bySender.get(msg.senderId) || []
					ids.push(msg.id)
					bySender.set(msg.senderId, ids)
				}

				for (const [senderId, messageIds] of bySender) {
					const senderSocketId = onlineUsers.get(senderId)
					if (senderSocketId) {
						io.to(senderSocketId).emit('status_update', {
							messageIds,
							status: 'DELIVERED'
						})
					}
				}
			} catch (error) {
				console.error('Error updating delivered status:', error)
			}
		})

		// --- Event: message_read ---
		socket.on('message_read', async (data: {
			messageIds: string[]
			conversationId: string
		}) => {
			try {
				await prisma.message.updateMany({
					where: {
						id: { in: data.messageIds },
						status: { in: ['SENT', 'DELIVERED'] }
					},
					data: {
						status: 'READ',
						readAt: new Date()
					}
				})

				const messages = await prisma.message.findMany({
					where: { id: { in: data.messageIds } },
					select: { id: true, senderId: true }
				})

				const bySender = new Map<string, string[]>()
				for (const msg of messages) {
					const ids = bySender.get(msg.senderId) || []
					ids.push(msg.id)
					bySender.set(msg.senderId, ids)
				}

				for (const [senderId, messageIds] of bySender) {
					const senderSocketId = onlineUsers.get(senderId)
					if (senderSocketId) {
						io.to(senderSocketId).emit('status_update', {
							messageIds,
							status: 'READ'
						})
					}
				}
			} catch (error) {
				console.error('Error updating read status:', error)
			}
		})

		// --- Disconnect ---
		socket.on('disconnect', async () => {
			console.log(`User disconnected: ${userId}`)
			onlineUsers.delete(userId)
			await rabbitmqService.stopConsuming(userId)
		})
	})

	return io
}

// Notify a user that they have been added to a group (called from REST handler)
export function notifyGroupAdded(userId: string, group: unknown): void {
	const socketId = onlineUsers.get(userId)
	if (socketId && ioInstance) {
		ioInstance.to(socketId).emit('group_added', { group })
	}
}

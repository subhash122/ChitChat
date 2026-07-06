import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib'

const DIRECT_EXCHANGE = 'chat.direct'
const GROUP_EXCHANGE = 'chat.group'

class RabbitMQService {
	private connection: ChannelModel | null = null
	private channel: Channel | null = null
	private consumerTags: Map<string, string> = new Map() // userId -> consumerTag

	private reset(): void {
		this.connection = null
		this.channel = null
		this.consumerTags.clear()
	}

	async connect(): Promise<void> {
		const url = process.env.RABBITMQ_URL!
		this.connection = await amqp.connect(url)
		this.channel = await this.connection.createChannel()

		// Declare the exchanges
		await this.channel.assertExchange(DIRECT_EXCHANGE, 'direct', { durable: true })
		await this.channel.assertExchange(GROUP_EXCHANGE, 'direct', { durable: true })

		console.log('RabbitMQ connected')

		this.connection.on('error', (err) => {
			console.error('RabbitMQ connection error:', err)
			this.reset()
		})

		this.connection.on('close', () => {
			console.log('RabbitMQ connection closed')
			this.reset()
		})
	}

	async ensureUserQueue(userId: string): Promise<string | null> {
		if (!this.channel) {
			console.error('RabbitMQ not connected: cannot ensure queue for', userId)
			return null
		}

		const queueName = `user.${userId}.messages`
		await this.channel.assertQueue(queueName, { durable: true })
		await this.channel.bindQueue(queueName, DIRECT_EXCHANGE, userId)

		return queueName
	}

	async publishToUser(recipientId: string, message: object): Promise<void> {
		if (!this.channel) {
			console.error('RabbitMQ not connected: dropping publish to', recipientId)
			return
		}

		const queueName = await this.ensureUserQueue(recipientId)
		if (!queueName) return

		this.channel.publish(
			DIRECT_EXCHANGE,
			recipientId,
			Buffer.from(JSON.stringify(message)),
			{ persistent: true }
		)
	}

	async bindUserToGroup(userId: string, groupId: string): Promise<void> {
		if (!this.channel) {
			console.error('RabbitMQ not connected: cannot bind', userId, 'to group', groupId)
			return
		}
		const queueName = await this.ensureUserQueue(userId)
		if (!queueName) return
		await this.channel.bindQueue(queueName, GROUP_EXCHANGE, `group.${groupId}`)
	}

	async unbindUserFromGroup(userId: string, groupId: string): Promise<void> {
		if (!this.channel) {
			console.error('RabbitMQ not connected: cannot unbind', userId, 'from group', groupId)
			return
		}
		const queueName = `user.${userId}.messages`
		await this.channel.unbindQueue(queueName, GROUP_EXCHANGE, `group.${groupId}`)
	}

	async publishToGroup(groupId: string, message: object): Promise<void> {
		if (!this.channel) {
			console.error('RabbitMQ not connected: dropping group publish for', groupId)
			return
		}
		this.channel.publish(
			GROUP_EXCHANGE,
			`group.${groupId}`,
			Buffer.from(JSON.stringify(message)),
			{ persistent: true }
		)
	}

	async startConsuming(
		userId: string,
		onMessage: (msg: object) => void
	): Promise<void> {
		if (!this.channel) {
			console.error('RabbitMQ not connected: cannot start consuming for', userId)
			return
		}

		await this.stopConsuming(userId)

		const queueName = await this.ensureUserQueue(userId)

		const { consumerTag } = await this.channel.consume(
			queueName!,
			(msg: ConsumeMessage | null) => {
				if (msg) {
					const content = JSON.parse(msg.content.toString())
					onMessage(content)
					this.channel!.ack(msg)
				}
			},
			{ noAck: false }
		)

		this.consumerTags.set(userId, consumerTag)
		console.log(`Started consuming for user ${userId}`)
	}

	async stopConsuming(userId: string): Promise<void> {
		const consumerTag = this.consumerTags.get(userId)
		if (consumerTag && this.channel) {
			await this.channel.cancel(consumerTag)
			this.consumerTags.delete(userId)
			console.log(`Stopped consuming for user ${userId}`)
		}
	}

	async close(): Promise<void> {
		if (this.channel) await this.channel.close()
		if (this.connection) await this.connection.close()
	}
}

export const rabbitmqService = new RabbitMQService()

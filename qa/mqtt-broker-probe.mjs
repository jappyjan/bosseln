/**
 * Which public MQTT broker can actually carry a shared game?
 * Checks, per broker: connect, retained message delivery to a LATE subscriber
 * (that is what makes "join by code" instant), live delivery between two
 * clients, and round-trip latency.
 *
 * Usage: node mqtt-broker-probe.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire('/opt/data/bossln/package.json')
const mqtt = require('mqtt')

const BROKERS = [
  { name: 'EMQX public', url: 'wss://broker.emqx.io:8084/mqtt' },
  { name: 'HiveMQ public', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { name: 'HiveMQ public (ws)', url: 'ws://broker.hivemq.com:8000/mqtt' },
  { name: 'Mosquitto test', url: 'wss://test.mosquitto.org:8081/mqtt' },
]

const connect = (url) =>
  new Promise((resolve) => {
    const client = mqtt.connect(url, {
      clientId: `probe-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 0,
      connectTimeout: 8000,
      clean: true,
    })
    let done = false
    client.on('connect', () => {
      if (!done) {
        done = true
        resolve({ client, ok: true })
      }
    })
    client.on('error', (err) => {
      if (!done) {
        done = true
        try {
          client.end(true)
        } catch {}
        resolve({ client: null, ok: false, error: err.message })
      }
    })
    setTimeout(() => {
      if (!done) {
        done = true
        try {
          client.end(true)
        } catch {}
        resolve({ client: null, ok: false, error: 'timeout' })
      }
    }, 9000)
  })

const waitFor = (client, topic, timeoutMs) =>
  new Promise((resolve) => {
    const handler = (t, payload) => {
      if (t !== topic) return
      clearTimeout(timer)
      client.removeListener('message', handler)
      resolve(payload.toString())
    }
    const timer = setTimeout(() => {
      client.removeListener('message', handler)
      resolve(null)
    }, timeoutMs)
    client.on('message', handler)
    client.subscribe(topic, { qos: 1 })
  })

const results = []

for (const broker of BROKERS) {
  const tag = broker.name.padEnd(20)
  const room = `bosseln-probe-${Math.random().toString(36).slice(2, 8)}`
  const stateTopic = `bosseln/v1/${room}/state`
  const line = { broker: broker.name, url: broker.url, connect: false, retained: false, live: false, ms: null }
  const t0 = Date.now()

  const publisher = await connect(broker.url)
  if (!publisher.ok) {
    console.log(`${tag} ${broker.url}  ✗ Verbindung: ${publisher.error}`)
    results.push(line)
    continue
  }
  line.connect = true
  const { client: pub } = publisher

  // publisher writes the "game state" as a retained message
  const putRetained = () =>
    new Promise((res) => pub.publish(stateTopic, JSON.stringify({ v: 1, at: Date.now() }), { qos: 1, retain: true }, res))
  await putRetained()

  // LATE subscriber: only this proves "join by code" works instantly
  const sub = await connect(broker.url)
  if (!sub.ok) {
    console.log(`${tag} ${broker.url}  ✗ zweiter Client: ${sub.error}`)
    try {
      pub.end(true)
    } catch {}
    results.push(line)
    continue
  }
  const retainedMsg = await waitFor(sub.client, stateTopic, 6000)
  line.retained = Boolean(retainedMsg)

  // live delivery: separate topic, no retain, so the retained copy cannot mask it
  const liveTopic = `bosseln/v1/${room}/live`
  const livePromise = waitFor(sub.client, liveTopic, 8000)
  await new Promise((r) => setTimeout(r, 400))
  const tPublish = Date.now()
  await new Promise((res) => pub.publish(liveTopic, JSON.stringify({ v: 2, at: tPublish }), { qos: 1 }, res))
  const liveMsg = await livePromise
  line.live = Boolean(liveMsg && JSON.parse(liveMsg).v === 2)
  line.ms = line.live ? Date.now() - tPublish : null

  console.log(
    `${tag} ${line.retained ? 'retained ✓' : 'retained ✗'}  ${line.live ? 'live ✓' : 'live ✗'}  ${line.ms ?? '-'}ms  (${broker.url})`,
  )

  try {
    pub.end(true)
    sub.client.end(true)
  } catch {}
  results.push(line)
}

console.log('\nEmpfehlung:')
const best = results.filter((r) => r.retained && r.live)
if (best.length) {
  best.forEach((b) => console.log(`  ✓ ${b.broker} — ${b.url}`))
} else {
  console.log('  keiner der Broker erfüllt beide Kriterien')
}
process.exit(best.length ? 0 : 1)

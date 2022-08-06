// configure and connect Redis Client

const redis  = require('redis')
const client = redis.createClient(process.env.REDIS_PORT)
.on('connect',      () => console.info('redisClient:connected'))
.on('end',          () => console.info('redisClient:disconnected'))
.on('reconnecting', () => console.info('redisClient:reconnecting'))
.on('error',        (error) => { console.error('redisClient:error', error) });

(async () => {
    try      { await client.connect() }
    catch(e) { console.error('redisClient:connect:error', e) }
})()

// cache functions

function deleteEntry(id) { return client.del(id) }

function getEntry(id) {
    return new Promise((resolve, reject) => {

        return client.get(id)
        .then((node, error) => {

            // Redis Client error = (500)
            if (error) { return reject(500) }

            // found id
            if (node) { return resolve(JSON.parse(node)) }

            return resolve(null)

        })
        .catch(() => reject(500))

    })
}

function setEntry(id, value, expiration = process.env.REDIS_NODECACHE_SEC) { return client.setEx(id, expiration, JSON.stringify(value)) }



/* EXPORT MODULES */

module.exports = {
    deleteEntry,
    getEntry,
    setEntry,
}
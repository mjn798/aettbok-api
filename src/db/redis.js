// configure imports

const aettbok = new (require('../common/aettbok'))()
const redis   = require('redis')

// configure Redis Client connection

const client = redis.createClient(6379)
.on('connect',      () => console.info('redisClient:connected'))
.on('end',          () => console.info('redisClient:disconnected'))
.on('reconnecting', () => console.info('redisClient:reconnecting'))
.on('error',        (error) => { console.error('redisClient:error', error) });

// connect Redis Client

(async () => {
    try      { await client.connect() }
    catch(e) { console.error('redisClient:connect:error', e) }
})()

// get or set Google API Key

async function getGoogleApiKey(apikey) {

    return await client.get(apikey)
    .then(async (key, error) => {

        // Redis Client = (500)
        if (error) { return { error: 500 }}

        // found key:value in cache
        if (key) { return { key: key }}

        // did not find key:value in cache
        return await aettbok.getGoogleApiKeys()
        .then(result => {

            // missing key from Google API = (500)
            if (!result[apikey]) { return { error: 500 } }

            // cache and set new key:value
            client.setEx(apikey, process.env.REDIS_GOOGLEAPIKEY_SEC, result[apikey])
            return { key: result[apikey] }

        })
        .catch(error => { return { error: error } })

    })
    .catch(() => { return { error: 500 } })

}

module.exports = { getGoogleApiKey }